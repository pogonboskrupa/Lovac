// Imena mjesta na podlozi Teren. Admin ih dodaje ("+" → Ime mjesta na Terenu: pomjeri kartu, križ pokazuje mjesto),
// svi ih vide, ali SAMO dok je podloga Teren (ili dok admin postavlja novo ime, da vidi šta već postoji).
// Offline-first: tačke su u IndexedDB (`spiskovi/teren_tacke`), admin upisuje lokalno pa šalje kad ima veze; ostali čitaju keš.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { uuid } from './zapisi.js';
import { formatCoordMode } from './geo.js';
import { getCoordMode } from './map.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import {
  TACKA_VRSTE, validateTacka, newTacka, editTacka, mergeTacke, visibleTacke, nextTackeCursor, missingTable, vrstaNaziv,
} from './teren-tacke.js';

const $ = (id) => document.getElementById(id);
const DOC_ID = 'teren_tacke';
const PULL_MS = 30 * 60000;
const PULL_MIN_MS = 10 * 60000;
const FIRST_PULL_MS = 6000;

export function initTerenTacke(L, map, activeBase) {
  const layer = L.layerGroup();
  const form = $('forma-mjesto');
  const sheet = $('mjesto-forma');
  const bar = $('mjesto-traka');
  const cross = $('mjesto-nisan');
  const screen = $('ekran-mapa');
  let doc = { id: DOC_ID, rows: [], kursor: null };
  let chain = Promise.resolve(); // upisi u dokument idu jedan po jedan (flush, pull i izmjene ne smiju prepisati jedni druge)
  let tableMissing = false;
  let lastPull = 0;
  let placing = null; // { id?, naziv, vrsta, lat?, lon? } dok admin bira mjesto na karti
  let editing = null; // tačka koja se uređuje (null = nova)
  let vrsta = 'naselje';
  const me = () => cachedProfile();
  const isAdmin = () => me()?.is_admin === true;
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());
  const terenActive = () => activeBase?.() === 'teren';

  const serial = (fn) => { const next = chain.then(fn, fn); chain = next.catch(() => {}); return next; };
  const persist = () => idbPut('spiskovi', doc);
  const load = async () => {
    const saved = await idbGet('spiskovi', DOC_ID).catch(() => null);
    if (saved?.rows) doc = { id: DOC_ID, rows: saved.rows, kursor: saved.kursor ?? null };
  };

  // ---------- crtanje ----------
  const iconFor = (t) => L.divIcon({
    className: 'tt-ikona',
    html: `<span class="tt" data-vrsta="${escapeHtml(t.vrsta)}"><i class="tt-tacka"></i><span class="tt-naziv">${escapeHtml(t.naziv)}</span></span>`,
    iconSize: [0, 0],
  });

  const render = () => {
    layer.clearLayers();
    if (!terenActive() && !placing) { map.removeLayer(layer); return; }
    layer.addTo(map);
    const admin = isAdmin();
    for (const t of visibleTacke(doc.rows, map.getZoom())) {
      const m = L.marker([t.lat, t.lon], { icon: iconFor(t), keyboard: false, interactive: admin && !placing, riseOnHover: false });
      if (admin) m.on('click', () => openForm(t));
      m.addTo(layer);
    }
  };

  // ---------- server ----------
  const run = async (q) => {
    const { data, error } = await q;
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  };

  const flush = () => serial(async () => {
    if (!online() || tableMissing || !isAdmin()) return;
    let changed = false;
    for (const t of doc.rows.filter((x) => x.sinhronizovano === false && !x.odbijeno)) {
      const { sinhronizovano, odbijeno, ...row } = t;
      try {
        await run(getClient().from('teren_tacke').upsert(row, { onConflict: 'id' }));
        const cur = doc.rows.find((x) => x.id === t.id);
        // izmijenjena tokom slanja ostaje u redu: sinhronizovano se postavlja samo ako je isto vrijeme izmjene
        if (cur && cur.updated_at === t.updated_at) { cur.sinhronizovano = true; changed = true; }
      } catch (err) {
        if (missingTable(err)) { tableMissing = true; toast('Server još ne podržava imena mjesta — sačuvano na telefonu'); break; }
        if (err.code === '42501' || /row-level security/i.test(err.message)) {
          const cur = doc.rows.find((x) => x.id === t.id);
          if (cur) { cur.odbijeno = true; changed = true; }
          toast('Server nije prihvatio ime mjesta (samo administrator ga može dodati)');
          continue;
        }
        console.warn('mjesto čeka slanje', err.message);
        break;
      }
    }
    if (changed) await persist();
  });

  const pull = ({ force = false } = {}) => serial(async () => {
    if (!online() || tableMissing) return;
    if (!force && Date.now() - lastPull < PULL_MIN_MS) return;
    lastPull = Date.now();
    try {
      for (let krug = 0; krug < 5; krug++) {
        let q = getClient().from('teren_tacke').select('*').order('updated_at', { ascending: true }).limit(1000);
        if (doc.kursor) q = q.gt('updated_at', doc.kursor);
        const fresh = await run(q);
        if (!fresh?.length) break;
        doc = { ...doc, rows: mergeTacke(doc.rows, fresh), kursor: nextTackeCursor(fresh, doc.kursor) };
        await persist();
        if (fresh.length < 1000) break;
      }
      render();
    } catch (err) {
      if (missingTable(err)) tableMissing = true;
      else console.warn('imena mjesta', err.message);
    }
  });

  // ---------- postavljanje mjesta na karti (križ u sredini) ----------
  const updateCoords = () => {
    const c = map.getCenter();
    const f = formatCoordMode(getCoordMode(), c.lat, c.lng);
    $('mjesto-traka-koord').textContent = `${f.oznaka} ${f.tekst}${terenActive() ? '' : ' · Podloga nije Teren: imena se vide samo na Terenu.'}`;
  };
  const startPlacing = (draft) => {
    placing = draft;
    $('meni-dodaj').hidden = true;
    sheet.hidden = true;
    bar.hidden = false;
    cross.hidden = false;
    screen.classList.add('mjesto-radi');
    if (Number.isFinite(draft.lat)) map.setView([draft.lat, draft.lon], Math.max(map.getZoom(), 14), { animate: false });
    map.on('move', updateCoords);
    updateCoords();
    render();
  };
  const stopPlacing = () => {
    placing = null;
    bar.hidden = true;
    cross.hidden = true;
    screen.classList.remove('mjesto-radi');
    map.off('move', updateCoords);
    render();
  };

  $('btn-dodaj-mjesto').addEventListener('click', () => startPlacing({ naziv: '', vrsta: 'naselje' }));
  $('btn-mjesto-odustani').addEventListener('click', stopPlacing);
  $('btn-mjesto-ja').addEventListener('click', () => {
    const fix = currentFix();
    if (!fix) { toast('Nema GPS pozicije — pomjeri kartu ručno'); return; }
    map.setView([fix.lat, fix.lon], Math.max(map.getZoom(), 15), { animate: false });
  });
  $('btn-mjesto-dalje').addEventListener('click', () => {
    const c = map.getCenter();
    const draft = { ...placing, lat: c.lat, lon: c.lng };
    stopPlacing();
    openForm(editing, draft);
  });

  // ---------- forma ----------
  const drawVrste = () => {
    $('mjesto-vrste').innerHTML = TACKA_VRSTE.map((v) => `<button type="button" class="dugme" role="radio" data-vrsta="${v.kod}" aria-checked="${v.kod === vrsta}">${escapeHtml(v.naziv)}</button>`).join('');
  };
  $('mjesto-vrste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vrsta]');
    if (!b) return;
    vrsta = b.dataset.vrsta;
    drawVrste();
  });

  function openForm(tacka = null, draft = null) {
    editing = tacka;
    const d = draft || (tacka ? { naziv: tacka.naziv, vrsta: tacka.vrsta, lat: tacka.lat, lon: tacka.lon } : null);
    if (!d) return;
    placing = null;
    vrsta = d.vrsta;
    form.elements.naziv.value = d.naziv;
    form.dataset.lat = String(d.lat);
    form.dataset.lon = String(d.lon);
    const f = formatCoordMode(getCoordMode(), d.lat, d.lon);
    $('mjesto-pozicija').textContent = `Mjesto: ${f.oznaka} ${f.tekst}`;
    $('mjesto-naslov').textContent = tacka ? 'Uredi ime mjesta' : 'Ime mjesta';
    $('btn-mjesto-skini').hidden = !tacka;
    $('mjesto-status').textContent = '';
    drawVrste();
    $('meni-dodaj').hidden = true;
    sheet.hidden = false;
  }
  const closeForm = () => { sheet.hidden = true; editing = null; };
  $('btn-mjesto-zatvori').addEventListener('click', closeForm);
  $('btn-mjesto-pomjeri').addEventListener('click', () => {
    const draft = { naziv: form.elements.naziv.value, vrsta, lat: Number(form.dataset.lat), lon: Number(form.dataset.lon) };
    startPlacing(draft);
  });

  const upsertLocal = (row) => serial(async () => {
    const i = doc.rows.findIndex((x) => x.id === row.id);
    if (i >= 0) doc.rows[i] = row; else doc.rows.push(row);
    await persist();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = { naziv: form.elements.naziv.value, vrsta, lat: Number(form.dataset.lat), lon: Number(form.dataset.lon) };
    const err = validateTacka(rec);
    if (err) { $('mjesto-status').textContent = err; return; }
    try {
      await upsertLocal(editing ? editTacka(editing, rec) : newTacka({ ...rec, id: uuid(), autorId: me()?.id }));
    } catch (er) {
      $('mjesto-status').textContent = `Nije sačuvano: ${er.message}`;
      return;
    }
    closeForm();
    const minZoom = TACKA_VRSTE.find((v) => v.kod === rec.vrsta)?.minZoom ?? 14;
    map.setView([rec.lat, rec.lon], Math.max(map.getZoom(), minZoom), { animate: false });
    render();
    toast(terenActive() ? 'Ime mjesta je sačuvano' : 'Sačuvano — ime se vidi na podlozi Teren');
    flush();
  });

  wireTwoTap($('btn-mjesto-skini'), 'Dodirni ponovo — ime se skida sa karte', async () => {
    if (!editing) return;
    await upsertLocal(editTacka(editing, { aktivno: false }));
    closeForm();
    render();
    toast(`Skinuto: ${editing?.naziv ?? 'ime mjesta'}`);
    flush();
  });

  // ---------- veze sa ostatkom aplikacije ----------
  const refreshButton = () => { $('btn-dodaj-mjesto').hidden = !isAdmin(); };
  $('btn-dodaj')?.addEventListener('click', refreshButton);
  document.addEventListener('podloga:promjena', () => {
    render();
    if (terenActive()) pull();
  });
  map.on('zoomend', render);
  registerBackHandler(() => {
    if (placing) { stopPlacing(); return true; }
    if (!sheet.hidden) { closeForm(); return true; }
    return false;
  });

  refreshButton();
  load().then(render);
  setTimeout(() => { pull({ force: true }).then(flush); }, FIRST_PULL_MS);
  setInterval(() => { pull({ force: true }).then(flush); }, PULL_MS);
  // ime koje čeka slanje (admin bio bez veze) ne čeka pola sata: lokalna provjera svake minute, zahtjev samo kad ima šta poslati
  setInterval(() => { if (doc.rows.some((t) => t.sinhronizovano === false && !t.odbijeno)) flush(); }, 60000);
  document.addEventListener('ekran:mapa', () => { refreshButton(); flush(); });
  return { render, pull, flush, rows: () => doc.rows, vrstaNaziv };
}
