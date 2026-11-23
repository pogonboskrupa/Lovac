// Prikaz traga kretanja lovaca sekcije za lov (checkbox "Prikaži trag kretanja lovaca sekcije"):
// svaki lovac ima svoju boju i ime, trag ostaje u arhivi lova. Radi i iz keša kad nema veze.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { loadJSON, saveSoft } from './storage.js';
import { memberName } from './dijeljenje-ui.js';
import { groupTrails, withLocalPoints, mergeTrailRows, nextTrailCursor } from './lovtrag.js';
import { collectPages } from './pregled.js';
import { initialsOf } from './lokacija.js';
import { formatMemberDistance } from './istrazivac.js';
import { toast, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const KEY = (lovId) => `lovac.lovtrag.prikaz.${lovId}`;
const POLL_MS = 30000;
// samo kolone koje karta treba (bez lov_id i id-eva): ~40 % manje prometa
const TRAG_KOLONE = 'korisnik_id,lat,lon,t,primljeno';
const TRAG_KOLONE_STARE = 'korisnik_id,lat,lon,t';

export const trailEnabled = (lovId) => loadJSON(KEY(lovId), false) === true;

export function initLovTragovi(L, map) {
  const layer = L.layerGroup().addTo(map);
  const legend = $('lov-trag-legenda');
  let activeId = null; // lov čiji se trag trenutno prikazuje
  let live = false;
  let timer = null;
  let trails = [];

  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

  const clear = () => {
    layer.clearLayers();
    legend.hidden = true;
    legend.innerHTML = '';
    clearInterval(timer);
    timer = null;
    activeId = null;
    trails = [];
  };

  // Inkrementalno: keš u IndexedDB + samo redovi poslije kursora, po stranicama (server vraća najviše 1000 redova).
  // Ranije se svakih 30 s preuzimao cijeli trag i vidio se samo njegov početak.
  let noRecvColumn = false; // migracija 028 još nije pokrenuta → kursor po t
  let noRpc = false; // ni funkcija lov_trag (028) → direktno iz tabele (RLS po redu, sporije)
  const missingFn = (err) => ['PGRST202', '42883'].includes(err.code) || /could not find the function/i.test(err.message);
  const fetchSince = (lovId, cursor) => collectPages(async (from, to) => {
    const order = cursor?.kolona === 'primljeno' ? 'primljeno' : 't';
    const sb = getClient();
    if (!noRpc) {
      const { data, error } = await sb.rpc('lov_trag', { p_lov: lovId, p_kolona: cursor?.kolona || null, p_od: cursor?.v || null })
        .select(TRAG_KOLONE).order(order, { ascending: true }).order('korisnik_id', { ascending: true }).range(from, to);
      if (!error) return data || [];
      if (!missingFn(error)) throw Object.assign(new Error(error.message), { code: error.code });
      noRpc = true;
    }
    let q = sb.from('lov_tragovi').select(noRecvColumn ? TRAG_KOLONE_STARE : TRAG_KOLONE).eq('lov_id', lovId);
    if (cursor) q = q.gt(cursor.kolona, cursor.v);
    const { data, error } = await q.order(order, { ascending: true }).order('korisnik_id', { ascending: true }).range(from, to);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data || [];
  }, 1000, 40);

  const rowsFor = async (lovId, net = true) => {
    const cache = await idbGet('arhiva', `trag:${lovId}`).catch(() => null);
    let rows = cache?.rows || [];
    if (!net || !online()) return rows;
    let cursor = cache?.kursor || null;
    if (cursor?.kolona === 'primljeno' && noRecvColumn) cursor = null;
    try {
      let fresh;
      try {
        fresh = await fetchSince(lovId, cursor);
      } catch (err) {
        // tabela bez kolone primljeno (migracija 028 nije pokrenuta): kursor po t
        if (err.code !== '42703' || noRecvColumn) throw err;
        noRecvColumn = true;
        if (cursor?.kolona === 'primljeno') cursor = null;
        fresh = await fetchSince(lovId, cursor);
      }
      if (!cache?.kursor) rows = [];
      rows = mergeTrailRows(rows, fresh);
      cursor = nextTrailCursor(fresh, cursor);
      await idbPut('arhiva', { id: `trag:${lovId}`, rows, kursor: cursor, preuzeto: Date.now() });
    } catch (err) {
      console.warn('trag lova', err.message);
    }
    return rows;
  };

  const draw = () => {
    layer.clearLayers();
    for (const tr of trails) {
      L.polyline(tr.tacke.map((p) => [p.lat, p.lon]), { color: tr.boja, weight: 4, opacity: 0.9, interactive: false }).addTo(layer);
      const end = tr.tacke[tr.tacke.length - 1];
      const icon = L.divIcon({ className: 'uc-ikona', html: `<span class="uc-marker" style="background:${tr.boja}">${escapeHtml(initialsOf(memberName(tr.id)))}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker([end.lat, end.lon], { icon, keyboard: false }).bindTooltip(`${memberName(tr.id)} · ${formatMemberDistance(tr.duzina)}`).addTo(layer);
    }
    legend.hidden = !trails.length;
    legend.innerHTML = trails.map((tr) => `<button type="button" class="clan-chip" data-uid="${escapeHtml(tr.id)}"><span class="trag-tackica" style="background:${tr.boja}"></span>
      <span><b>${escapeHtml(memberName(tr.id).split(' ')[0])}</b> ${formatMemberDistance(tr.duzina)}</span></button>`).join('');
  };

  const refresh = async ({ net = true } = {}) => {
    if (!activeId) return;
    const me = cachedProfile();
    const rows = await rowsFor(activeId, net);
    const local = loadJSON(`lovac.lovtrag.bafer.${activeId}`, []);
    trails = groupTrails(withLocalPoints(rows, local, me?.id));
    draw();
  };

  // lovId, live (lov u toku → osvježava se), fit (zumiraj na sve tragove)
  const show = async (lovId, { isLive = false, fit = false } = {}) => {
    clear();
    activeId = lovId;
    live = isLive;
    await refresh();
    if (!trails.length) toast('Još nema snimljenog traga kretanja za ovaj lov');
    if (fit && trails.length) map.fitBounds(trails.flatMap((t) => t.tacke.map((p) => [p.lat, p.lon])), { padding: [60, 60], maxZoom: 17, animate: false });
    if (live) timer = setInterval(refresh, POLL_MS);
  };

  legend.addEventListener('click', (e) => {
    const b = e.target.closest('[data-uid]');
    const tr = b && trails.find((t) => t.id === b.dataset.uid);
    if (tr) map.fitBounds(tr.tacke.map((p) => [p.lat, p.lon]), { padding: [60, 60], maxZoom: 17, animate: false });
  });

  // Panel lova na karti mora ostati nizak (prekriva stanove), pa checkbox je samo u kartici lova (tab sekcije);
  // kad je uključen, trag se prikazuje čim se otvori raspored tog lova.
  let shown = null;
  document.addEventListener('lov:prikazan', (e) => {
    shown = e.detail.lov;
    if (!shown) { if (activeId) clear(); return; }
    if (trailEnabled(shown.id) && shown.lov.status !== 'planiran') show(shown.id, { isLive: shown.lov.status === 'u_toku' });
    else if (activeId === shown.id) clear();
  });
  const setEnabled = (lovId, on, isLive) => {
    saveSoft(KEY(lovId), on);
    if (on) show(lovId, { isLive }); else if (activeId === lovId) clear();
    document.dispatchEvent(new CustomEvent('lovtrag:prikaz', { detail: { lovId, on } }));
  };
  // checkbox u kartici lova (tab sekcije)
  document.addEventListener('lovtrag:trazi', (e) => {
    setEnabled(e.detail.lovId, e.detail.on, e.detail.live);
    if (e.detail.on) toast('Trag kretanja lovaca je na karti');
  });
  // iz arhive: prikaži trag tog lova na karti i zumiraj
  document.addEventListener('lovtrag:arhiva', (e) => show(e.detail.lovId, { isLive: false, fit: true }));
  // vlastite tačke su već u lokalnom baferu: crta se iz keša, bez novog upita na server
  document.addEventListener('lovtrag:poslano', async (e) => {
    if (!activeId || !live || e.detail?.lovId !== activeId) return;
    const { korisnikId, tacke = [] } = e.detail;
    const key = `trag:${activeId}`;
    const cache = await idbGet('arhiva', key).catch(() => null);
    if (cache?.kursor && tacke.length) {
      const rows = mergeTrailRows(cache.rows, tacke.map((p) => ({ korisnik_id: korisnikId, lat: p.lat, lon: p.lon, t: p.t })));
      await idbPut('arhiva', { ...cache, rows }).catch(() => {});
    }
    refresh({ net: false });
  });
}
