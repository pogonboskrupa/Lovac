// Dnevno svjetlo (čip na mapi) i Istraživač mod: 3D nagib karte + trake sa smjerom i udaljenošću članova.

import { sunTimes, daylightStatus } from './sunce.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { compassName } from './geo.js';
import { memberVectors, formatMemberDistance, arrowAngle } from './istrazivac.js';
import { cachedProfile } from './auth.js';
import { memberName } from './dijeljenje-ui.js';
import { escapeHtml } from './ui.js';
import { getClient } from './auth.js';
import { connectionQuality } from './net.js';
import { currentHeading } from './gps.js';
import { initialsOf } from './lokacija.js';
import { loadJSON, saveSoft } from './storage.js';
import { tiltById, nextTilt, freshnessOf, barSummary, detailLine, crumbsAdd, mergeMemberTrail, trailMeters } from './istrazivac-pregled.js';
import { touchAngle, rotateBy, rotationForHeading, upBearing, gestureDelta, mapTransformCss, screenDragToPan, explorerView } from './rotacija.js';

const $ = (id) => document.getElementById(id);
const DAY = 86400000;

function localNoon(offsetDays = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays, 12).getTime();
}

export function initIstrazivac(L, map) {
  // ---------- dnevno svjetlo ----------
  const chip = $('svjetlo-chip');
  const updateLight = () => {
    const p = currentFix() || (({ lat, lng }) => ({ lat, lon: lng }))(map.getCenter());
    const st = daylightStatus(Date.now(), sunTimes(localNoon(), p.lat, p.lon), sunTimes(localNoon(1), p.lat, p.lon));
    chip.dataset.stanje = st.stanje;
    chip.textContent = st.tekst;
    chip.hidden = false;
  };
  updateLight();
  setInterval(updateLight, 60000);
  chip.addEventListener('click', () => $('btn-danas')?.click());

  // ---------- istraživač ----------
  const screen = $('ekran-mapa');
  const btn = $('btn-istrazivac');
  const bar = $('istrazivac-traka');
  let rows = [];
  let on = false;
  let following = true;
  let rot = 0;
  let followCompass = false;
  const controls = $('istrazivac-kontrole');
  const karta = $('karta');
  let tiltId = tiltById(loadJSON('lovac.ist.nagib', null)).id;

  // ---- odabrani član: udaljenost od mene, linija i trag kretanja ----
  let selected = null;
  let showTrail = loadJSON('lovac.ist.trag', false) === true;
  let crumbs = loadJSON('lovac.ist.mrvice', { lov: null, by: {} });
  let serverTrail = { uid: null, pts: [], at: 0 };
  const selLayer = L.layerGroup().addTo(map);

  const fetchServerTrail = async (uid) => {
    const lovId = rows.find((r) => r.korisnik_id === uid)?.lov_id ?? crumbs.lov;
    const sb = getClient();
    if (!lovId || !sb || connectionQuality() === 'nema') return;
    if (serverTrail.uid === uid && Date.now() - serverTrail.at < 30000) return;
    serverTrail = { uid, pts: serverTrail.uid === uid ? serverTrail.pts : [], at: Date.now() };
    try {
      const { data, error } = await sb.from('lov_tragovi').select('lat,lon,t').eq('lov_id', lovId).eq('korisnik_id', uid).order('t', { ascending: false }).limit(1000);
      if (error) throw new Error(error.message);
      // server vraća najviše 1000 redova: uzimaju se NAJNOVIJE tačke (inače bi se vidio samo početak lova)
      serverTrail = { uid, pts: (data || []).reverse(), at: Date.now() };
      updateSelection();
    } catch (err) {
      console.warn('trag člana', err.message);
    }
  };

  const updateSelection = () => {
    selLayer.clearLayers();
    const card = $('istrazivac-detalj');
    const me = currentFix();
    const v = on && selected && me ? memberVectors(me, rows, cachedProfile()?.id, memberName).find((m) => m.id === selected) : null;
    card.hidden = !v;
    $('btn-ist-trag').setAttribute('aria-checked', String(showTrail));
    if (!v) return;
    L.polyline([[me.lat, me.lon], [v.lat, v.lon]], { color: '#2563eb', weight: 3, dashArray: '6 8', interactive: false }).addTo(selLayer);
    let pts = [];
    if (showTrail) {
      pts = mergeMemberTrail(serverTrail.uid === selected ? serverTrail.pts : [], crumbs.by?.[selected] || []);
      if (pts.length > 1) L.polyline(pts.map((p) => [p.lat, p.lon]), { color: '#f97316', weight: 4, opacity: 0.9, interactive: false }).addTo(selLayer);
      if (pts.length) L.circleMarker([pts[0].lat, pts[0].lon], { radius: 5, color: '#ffffff', weight: 2, fillColor: '#f97316', fillOpacity: 1, interactive: false }).addTo(selLayer);
      fetchServerTrail(selected);
    }
    $('ist-detalj-ime').textContent = v.ime;
    $('ist-detalj-udaljenost').textContent = `${formatMemberDistance(v.udaljenost)} ${compassName(v.smjer)} od tebe`;
    $('ist-detalj-starost').textContent = `${detailLine(v).split(' · ').pop()}${showTrail && pts.length > 1 ? ` · trag ${formatMemberDistance(trailMeters(pts))}` : ''}`;
  };

  const selectMember = (uid, { fit = false } = {}) => {
    selected = uid;
    serverTrail = { uid: null, pts: [], at: 0 };
    if (uid && fit) {
      const me = currentFix();
      const r = rows.find((x) => x.korisnik_id === uid);
      following = false;
      if (me && r) map.fitBounds([[me.lat, me.lon], [r.lat, r.lon]], { padding: [90, 90], animate: false, maxZoom: 17 });
    }
    applyRot();
  };

  // Kvadratni kontejner + uvećanje po nagibu (rotacija.js): okrenuta karta više nema crnih ivica sa strane.
  const VIEW0 = { side: 0, scale: 1.6, p: 900, fog: 0, key: '' };
  let view = VIEW0;
  const magla = document.createElement('div');
  magla.id = 'ist-magla';
  magla.hidden = true;
  screen.appendChild(magla);

  const layoutView = () => {
    const w = screen.clientWidth || window.innerWidth;
    const h = screen.clientHeight || window.innerHeight;
    const deg = tiltById(tiltId).stepeni;
    const key = `${w}x${h}@${deg}`;
    if (key === view.key) return false;
    view = { ...explorerView(w, h, deg), key };
    const { side } = view;
    Object.assign(karta.style, { left: `${Math.round((w - side) / 2)}px`, top: `${Math.round((h - side) / 2)}px`, width: `${side}px`, height: `${side}px` });
    magla.style.height = `${view.fog ? view.fog + 48 : 0}px`;
    return true;
  };

  const resetView = () => {
    view = VIEW0;
    for (const k of ['left', 'top', 'width', 'height']) karta.style[k] = '';
  };

  const applyRot = () => {
    const tilt = tiltById(tiltId);
    if (on && layoutView()) map.invalidateSize({ animate: false });
    magla.hidden = !on || !view.fog;
    karta.style.transform = on ? mapTransformCss(rot, { tilt: tilt.stepeni, scale: view.scale, p: view.p }) : '';
    $('btn-ist-kompas').setAttribute('aria-pressed', String(followCompass));
    $('btn-ist-nagib-tekst').textContent = `${tilt.stepeni}°`;
    $('ist-n-strelica').setAttribute('transform', `rotate(${rot})`);
    $('btn-ist-ja').setAttribute('aria-pressed', String(following));
    render();
  };

  const render = () => {
    renderBar();
    updateSelection();
  };

  const renderBar = () => {
    const me = currentFix();
    if (!on) return;
    if (!me) { bar.innerHTML = '<span class="sitno">Čekam GPS…</span>'; return; }
    const v = memberVectors(me, rows, cachedProfile()?.id, memberName);
    const sum = barSummary(v);
    bar.innerHTML = (v.length
      ? `<span class="ist-sazetak" id="ist-sazetak">${escapeHtml(sum.tekst)}</span>` + v.map((m) => `<button type="button" class="clan-chip" data-uid="${escapeHtml(m.id)}" data-svjezina="${freshnessOf(m.starost)}"${m.id === sum.najblizi ? ' data-najblizi' : ''} aria-label="${escapeHtml(m.ime)}, ${compassName(m.smjer)}, ${formatMemberDistance(m.udaljenost)}">
          <span class="clan-lice">${escapeHtml(initialsOf(m.ime))}</span>
          <svg class="ic strelica" style="transform:rotate(${Math.round(arrowAngle(m.smjer, upBearing(rot)))}deg)"><use href="#ic-arrow"/></svg>
          <span><b>${escapeHtml(m.ime.split(' ')[0])}</b> ${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)}${m.starost > 1 ? ` · ${m.starost} min` : ''}</span></button>`).join('')
      : '<span class="sitno">Nema kolega koji dijele lokaciju</span>');
  };

  const setOn = (value) => {
    on = value;
    screen.classList.toggle('istrazivac', on);
    btn.setAttribute('aria-pressed', String(on));
    bar.hidden = !on;
    $('btn-ist-izlaz').hidden = !on;
    if (!on) selectMember(null);
    controls.hidden = !on;
    if (!on) { rot = 0; followCompass = false; resetView(); }
    following = true;
    screen.classList.toggle('istrazivac', on);
    map.invalidateSize({ animate: false });
    for (const h of ['dragging', 'touchZoom', 'doubleClickZoom']) map[h][on ? 'disable' : 'enable']();
    if (on) {
      const me = currentFix();
      if (me) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 15));
    }
    applyRot();
  };

  // Rezerva za WebView bez `overflow: clip`: ako se ekran ipak programski skrolovao, vrati ga.
  screen.addEventListener('scroll', () => { if (on && (screen.scrollTop || screen.scrollLeft)) { screen.scrollTop = 0; screen.scrollLeft = 0; } });
  btn.addEventListener('click', () => setOn(!on));
  window.addEventListener('resize', () => { if (on) applyRot(); });
  $('btn-ist-izlaz').addEventListener('click', () => setOn(false));
  $('btn-ist-detalj-zatvori').addEventListener('click', () => selectMember(null));
  $('btn-ist-trag').addEventListener('click', () => { showTrail = !showTrail; saveSoft('lovac.ist.trag', showTrail); updateSelection(); });
  $('btn-ist-nagib').addEventListener('click', () => { tiltId = nextTilt(tiltId); saveSoft('lovac.ist.nagib', tiltId); applyRot(); });
  $('btn-ist-ja').addEventListener('click', () => {
    following = true;
    const me = currentFix();
    if (me) map.setView([me.lat, me.lon], map.getZoom(), { animate: false });
    applyRot();
  });
  // Kompas sa sjeverom je i dugme: dodir vraća kartu na sjever gore.
  $('ist-n').addEventListener('click', () => { followCompass = false; rot = 0; applyRot(); });
  $('btn-ist-x').addEventListener('click', () => setOn(false));
  $('btn-ist-kompas').addEventListener('click', () => {
    followCompass = !followCompass;
    const h = currentHeading();
    if (followCompass && h != null) rot = rotationForHeading(h);
    applyRot();
  });
  // Jedan prst pomjera kartu (istraživanje terena), dva prsta je okreću. Leaflet dragging je isključen jer ne zna za nagib i rotaciju.
  const pointers = new Map();
  let lastAngle = null;
  let lastDist = null;
  let pinchAcc = 0;
  const ownsGesture = (e) => on && !e.target.closest('button, input, select, a, .leaflet-control, #istrazivac-kontrole, #istrazivac-traka, #istrazivac-detalj, .meni, .list-preko');
  const angleOfPair = () => {
    const [a, b] = [...pointers.values()];
    return touchAngle(a, b);
  };
  const distOfPair = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  screen.addEventListener('pointerdown', (e) => {
    if (!ownsGesture(e)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { screen.setPointerCapture(e.pointerId); } catch { /* nije kritično */ }
    lastAngle = pointers.size === 2 ? angleOfPair() : null;
    lastDist = pointers.size === 2 ? distOfPair() : null;
    pinchAcc = 0;
  });
  screen.addEventListener('pointermove', (e) => {
    if (!on || !pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const a = angleOfPair();
      if (lastAngle != null) { followCompass = false; rot = rotateBy(rot, gestureDelta(lastAngle, a)); applyRot(); }
      lastAngle = a;
      // Razmak prstiju: zumiranje (svaka promjena razmaka za ~41 % je jedan nivo).
      const d = distOfPair();
      if (lastDist && d > 0) {
        pinchAcc += Math.log2(d / lastDist);
        if (pinchAcc >= 0.5) { map.zoomIn(1, { animate: false }); pinchAcc = 0; }
        else if (pinchAcc <= -0.5) { map.zoomOut(1, { animate: false }); pinchAcc = 0; }
      }
      lastDist = d;
      return;
    }
    if (pointers.size === 1 && (dx || dy)) {
      following = false;
      const [px, py] = screenDragToPan(dx, dy, rot, { tilt: tiltById(tiltId).stepeni, scale: view.scale });
      map.panBy([px, py], { animate: false });
      applyRot();
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); lastAngle = null; lastDist = null; pinchAcc = 0; };
  screen.addEventListener('pointerup', endPointer);
  screen.addEventListener('pointercancel', endPointer);
  bar.addEventListener('click', (e) => {
    const c = e.target.closest('[data-uid]');
    const r = c && rows.find((x) => x.korisnik_id === c.dataset.uid);
    if (!r) return;
    selectMember(selected === r.korisnik_id ? null : r.korisnik_id, { fit: true });
  });
  document.addEventListener('uzivo:pozicije', (e) => {
    rows = e.detail.rows || [];
    // Mrvice kretanja drugih lovaca se pamte uvijek dok stižu pozicije (i kad 3D nije uključen), pa trag ostaje poslije.
    const myId = cachedProfile()?.id;
    const before = crumbs;
    for (const r of rows) if (r.korisnik_id !== myId) crumbs = crumbsAdd(crumbs, r);
    if (crumbs !== before) saveSoft('lovac.ist.mrvice', crumbs);
    render();
  });
  onGpsUpdate((fix, heading) => {
    if (on && followCompass && heading != null) { rot = rotationForHeading(heading); applyRot(); }
    render();
    if (on && fix && following) map.setView([fix.lat, fix.lon], map.getZoom(), { animate: false });
  });
}
