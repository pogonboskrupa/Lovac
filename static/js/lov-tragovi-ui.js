// Prikaz traga kretanja lovaca sekcije za lov (checkbox "Prikaži trag kretanja lovaca sekcije"):
// svaki lovac ima svoju boju i ime, trag ostaje u arhivi lova. Radi i iz keša kad nema veze.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { loadJSON, saveSoft } from './storage.js';
import { memberName } from './dijeljenje-ui.js';
import { groupTrails, withLocalPoints } from './lovtrag.js';
import { initialsOf } from './lokacija.js';
import { formatMemberDistance } from './istrazivac.js';
import { toast, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const KEY = (lovId) => `lovac.lovtrag.prikaz.${lovId}`;
const POLL_MS = 30000;

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

  const rowsFor = async (lovId) => {
    if (online()) {
      try {
        const { data, error } = await getClient().from('lov_tragovi').select('*').eq('lov_id', lovId).order('t', { ascending: true }).limit(20000);
        if (error) throw new Error(error.message);
        await idbPut('arhiva', { id: `trag:${lovId}`, rows: data, preuzeto: Date.now() });
        return data;
      } catch (err) {
        console.warn('trag lova', err.message);
      }
    }
    return (await idbGet('arhiva', `trag:${lovId}`).catch(() => null))?.rows || [];
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

  const refresh = async () => {
    if (!activeId) return;
    const me = cachedProfile();
    const rows = await rowsFor(activeId);
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
  document.addEventListener('lovtrag:poslano', () => { if (activeId && live) refresh(); });
}
