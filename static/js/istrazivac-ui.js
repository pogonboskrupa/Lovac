// Dnevno svjetlo (čip na mapi) i Istraživač mod: 3D nagib karte + trake sa smjerom i udaljenošću članova.

import { sunTimes, daylightStatus } from './sunce.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { compassName } from './geo.js';
import { memberVectors, formatMemberDistance, arrowAngle } from './istrazivac.js';
import { cachedProfile } from './auth.js';
import { memberName } from './dijeljenje-ui.js';
import { escapeHtml } from './ui.js';
import { currentHeading } from './gps.js';
import { initialsOf } from './lokacija.js';
import { loadJSON, saveSoft } from './storage.js';
import { tiltById, nextTilt, freshnessOf, barSummary, upLabel } from './istrazivac-pregled.js';
import { ROT_KORAK, touchAngle, rotateBy, rotationForHeading, upBearing, gestureDelta, mapTransformCss, screenDragToPan } from './rotacija.js';

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

  const applyRot = () => {
    const tilt = tiltById(tiltId);
    karta.style.transform = on ? mapTransformCss(rot, { tilt: tilt.stepeni }) : '';
    $('btn-ist-kompas').setAttribute('aria-pressed', String(followCompass));
    $('btn-ist-nagib-tekst').textContent = `${tilt.stepeni}°`;
    $('ist-hud').textContent = upLabel(upBearing(rot), tilt.stepeni) + (following ? '' : ' · istražuješ');
    $('btn-ist-ja').setAttribute('aria-pressed', String(following));
    render();
  };

  const render = () => {
    const me = currentFix();
    if (!on) return;
    const izlaz = '<button type="button" class="istrazivac-izlaz" data-izlaz>Izađi iz 3D</button>';
    if (!me) { bar.innerHTML = `${izlaz}<span class="sitno">Čekam GPS…</span>`; return; }
    const v = memberVectors(me, rows, cachedProfile()?.id, memberName);
    const sum = barSummary(v);
    bar.innerHTML = izlaz + (v.length
      ? `<span class="ist-sazetak" id="ist-sazetak">${escapeHtml(sum.tekst)}</span>` + v.map((m) => `<button type="button" class="clan-chip" data-uid="${escapeHtml(m.id)}" data-svjezina="${freshnessOf(m.starost)}"${m.id === sum.najblizi ? ' data-najblizi' : ''} aria-label="${escapeHtml(m.ime)}, ${compassName(m.smjer)}, ${formatMemberDistance(m.udaljenost)}">
          <span class="clan-lice">${escapeHtml(initialsOf(m.ime))}</span>
          <svg class="ic strelica" style="transform:rotate(${Math.round(arrowAngle(m.smjer, upBearing(rot)))}deg)"><use href="#ic-arrow"/></svg>
          <span><b>${escapeHtml(m.ime.split(' ')[0])}</b> ${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)}${m.starost > 1 ? ` · ${m.starost} min` : ''}</span></button>`).join('')
      : '<span class="sitno">Nema članova koji dijele lokaciju (lov u toku + internet).</span>');
  };

  const setOn = (value) => {
    on = value;
    screen.classList.toggle('istrazivac', on);
    btn.setAttribute('aria-pressed', String(on));
    bar.hidden = !on;
    controls.hidden = !on;
    if (!on) { rot = 0; followCompass = false; }
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

  btn.addEventListener('click', () => setOn(!on));
  $('btn-ist-lijevo').addEventListener('click', () => { followCompass = false; rot = rotateBy(rot, -ROT_KORAK); applyRot(); });
  $('btn-ist-desno').addEventListener('click', () => { followCompass = false; rot = rotateBy(rot, ROT_KORAK); applyRot(); });
  $('btn-ist-nagib').addEventListener('click', () => { tiltId = nextTilt(tiltId); saveSoft('lovac.ist.nagib', tiltId); applyRot(); });
  $('btn-ist-ja').addEventListener('click', () => {
    following = true;
    const me = currentFix();
    if (me) map.setView([me.lat, me.lon], map.getZoom(), { animate: false });
    applyRot();
  });
  $('btn-ist-sjever').addEventListener('click', () => { followCompass = false; rot = 0; applyRot(); });
  $('btn-ist-kompas').addEventListener('click', () => {
    followCompass = !followCompass;
    const h = currentHeading();
    if (followCompass && h != null) rot = rotationForHeading(h);
    applyRot();
  });
  // Jedan prst pomjera kartu (istraživanje terena), dva prsta je okreću. Leaflet dragging je isključen jer ne zna za nagib i rotaciju.
  const pointers = new Map();
  let lastAngle = null;
  const ownsGesture = (e) => on && !e.target.closest('button, input, select, a, .leaflet-control, #istrazivac-kontrole, #istrazivac-traka, .meni, .list-preko');
  const angleOfPair = () => {
    const [a, b] = [...pointers.values()];
    return touchAngle(a, b);
  };
  screen.addEventListener('pointerdown', (e) => {
    if (!ownsGesture(e)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { screen.setPointerCapture(e.pointerId); } catch { /* nije kritično */ }
    lastAngle = pointers.size === 2 ? angleOfPair() : null;
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
      return;
    }
    if (pointers.size === 1 && (dx || dy)) {
      following = false;
      const [px, py] = screenDragToPan(dx, dy, rot, { tilt: tiltById(tiltId).stepeni });
      map.panBy([px, py], { animate: false });
      applyRot();
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); lastAngle = null; };
  screen.addEventListener('pointerup', endPointer);
  screen.addEventListener('pointercancel', endPointer);
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-izlaz]')) { setOn(false); return; }
    const c = e.target.closest('[data-uid]');
    const r = c && rows.find((x) => x.korisnik_id === c.dataset.uid);
    if (!r) return;
    following = false;
    map.panTo([r.lat, r.lon]);
    applyRot();
  });
  document.addEventListener('uzivo:pozicije', (e) => { rows = e.detail.rows || []; render(); });
  onGpsUpdate((fix, heading) => {
    if (on && followCompass && heading != null) { rot = rotationForHeading(heading); applyRot(); }
    render();
    if (on && fix && following) map.setView([fix.lat, fix.lon], map.getZoom(), { animate: false });
  });
}
