// Kamere na karti (samo lovočuvari): dodavanje na poziciji, markeri, vođenje do kamere, skidanje.
// Offline-first: kamera se prvo čuva lokalno (IndexedDB), pa šalje kad ima veze; keš se briše ako korisnik nije lovočuvar.

import { getClient, cachedProfile } from './auth.js';
import { idbAll, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { uuid } from './zapisi.js';
import { cachedSekcije } from './sekcije-ui.js';
import { rangeLabel } from './istrazivac.js';
import { formatCoordMode } from './geo.js';
import { getCoordMode } from './map.js';
import { startNavigation } from './navigacija.js';
import { lovocuvarRevirIds, validateKamera, newKamera, mergeKamere, visibleKamere } from './kamere.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const STORE = 'kamere';
const POLL_MS = 60000;

async function qKam(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export function initKamere(L, map) {
  const layer = L.layerGroup().addTo(map);
  const sheet = $('kamera-forma');
  const form = $('forma-kamera');
  let reviri = []; // [{ id, naziv }] u kojima sam lovočuvar
  let draft = null;
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

  const loadRoles = async () => {
    const ctx = await cachedSekcije();
    const ids = new Set(lovocuvarRevirIds(me()?.id, ctx));
    reviri = (await idbAll('spiskovi').catch(() => [])).find((x) => x.id === 'reviri')?.rows?.filter((r) => ids.has(r.id))
      || ctx.reviri.filter((r) => ids.has(r.id));
    $('btn-dodaj-kameru').hidden = !reviri.length;
    return reviri.length > 0;
  };

  const icon = L.divIcon({ className: 'kamera-ikona', html: '<span class="kamera-marker"><svg class="ic"><use href="#ic-camera"/></svg></span>', iconSize: [40, 40], iconAnchor: [20, 20], popupAnchor: [0, -20] });

  const popupHtml = (k) => `<div class="kamera-popup" data-id="${escapeHtml(k.id)}"><b>${escapeHtml(k.naziv)}</b>
    <span class="sitno">${currentFix() ? `${escapeHtml(rangeLabel(currentFix(), k))} · ` : ''}${k.sinhronizovano === false ? 'čeka slanje' : 'sa servera'}</span>
    ${k.napomena ? `<span>${escapeHtml(k.napomena)}</span>` : ''}
    <div class="red-dugmadi"><button type="button" class="dugme glavno" data-akcija="vodi">Vodi me</button>
    <button type="button" class="dugme" data-akcija="skini">Skini</button></div></div>`;

  const render = async () => {
    layer.clearLayers();
    if (!reviri.length) { map.removeLayer(layer); return; }
    layer.addTo(map);
    for (const k of visibleKamere(await idbAll(STORE).catch(() => []))) {
      if (!reviri.some((r) => r.id === k.revir_id)) continue;
      L.marker([k.lat, k.lon], { icon, keyboard: false }).bindPopup(popupHtml(k), { minWidth: 190 }).addTo(layer);
    }
  };

  const flush = async () => {
    if (!online()) return;
    for (const k of (await idbAll(STORE)).filter((x) => x.sinhronizovano === false)) {
      try {
        const { sinhronizovano, ...row } = k;
        await qKam(getClient().from('kamere').upsert(row, { onConflict: 'id' }));
        await idbPut(STORE, { ...k, sinhronizovano: true });
      } catch (err) {
        console.warn('kamera čeka slanje', err.message);
        break;
      }
    }
  };

  const pull = async () => {
    if (!online()) return;
    try {
      const remote = await qKam(getClient().from('kamere').select('*'));
      for (const k of mergeKamere(await idbAll(STORE), remote)) await idbPut(STORE, k);
    } catch (err) {
      console.warn('kamere', err.message);
    }
  };

  // Ko nije lovočuvar nema ni keš kamera na telefonu.
  const purgeIfNotWarden = async () => {
    const all = await idbAll(STORE).catch(() => []);
    for (const k of all) if (!reviri.some((r) => r.id === k.revir_id)) await idbPut(STORE, { ...k, aktivno: false, naziv: '', napomena: null, lat: 0, lon: 0 });
  };

  const refresh = async () => {
    const warden = await loadRoles();
    if (!warden) { await purgeIfNotWarden(); await render(); return; }
    await flush();
    await pull();
    await render();
  };

  // ---------- forma ----------
  const open = () => {
    const fix = currentFix();
    const c = map.getCenter();
    draft = fix ? { lat: fix.lat, lon: fix.lon, izvor: `GPS ±${Math.round(fix.acc ?? 0)} m` } : { lat: c.lat, lon: c.lng, izvor: 'nema GPS-a — pozicija je odabrana na sredini karte' };
    const f = formatCoordMode(getCoordMode(), draft.lat, draft.lon);
    $('kamera-pozicija').textContent = `Pozicija: ${f.oznaka} ${f.tekst} (${draft.izvor})`;
    $('kamera-revir').innerHTML = reviri.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.naziv)}</option>`).join('');
    form.reset();
    $('kamera-status').textContent = '';
    $('meni-dodaj').hidden = true;
    sheet.hidden = false;
  };
  const close = () => { sheet.hidden = true; draft = null; };

  $('btn-dodaj-kameru').addEventListener('click', open);
  $('btn-kamera-odustani').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = { revir_id: form.elements.revir.value, naziv: form.elements.naziv.value, napomena: form.elements.napomena.value, lat: draft.lat, lon: draft.lon };
    const err = validateKamera(rec);
    if (err) { $('kamera-status').textContent = err; return; }
    try {
      await idbPut(STORE, newKamera({ ...rec, id: uuid(), autorId: me().id }));
    } catch (er) {
      $('kamera-status').textContent = `Kamera nije sačuvana: ${er.message}`;
      return;
    }
    const at = [draft.lat, draft.lon];
    close();
    await render();
    map.setView(at, Math.max(map.getZoom(), 16), { animate: false });
    toast('Kamera je sačuvana');
    flush().then(render);
  });

  map.on('popupopen', (e) => {
    const root = e.popup.getElement()?.querySelector('.kamera-popup');
    if (!root) return;
    const id = root.dataset.id;
    root.querySelector('[data-akcija="vodi"]').addEventListener('click', async () => {
      const k = (await idbAll(STORE)).find((x) => x.id === id);
      map.closePopup();
      if (k) startNavigation({ lat: k.lat, lon: k.lon, naziv: k.naziv });
    });
    wireTwoTap(root.querySelector('[data-akcija="skini"]'), 'Dodirni ponovo — kamera se skida', async () => {
      const k = (await idbAll(STORE)).find((x) => x.id === id);
      map.closePopup();
      if (k) await idbPut(STORE, { ...k, aktivno: false, updated_at: new Date().toISOString(), sinhronizovano: false });
      await render();
      flush();
      toast('Kamera je skinuta');
    });
  });

  registerBackHandler(() => { if (sheet.hidden) return false; close(); return true; });
  document.addEventListener('sekcije:promjena', refresh);
  setInterval(refresh, POLL_MS);
  refresh();
}
