// UI opažanja: brzi unos na trenutnoj poziciji, pregled po periodu (tačke / gustina), spisak.

import { getSpisak, getSpisakAll, lookupNaziv } from './spiskovi.js';
import { newRecord, saveRecord, listRecords, deleteRecord, getRecord } from './zapisi.js';
import { filterObservations, densityGrid, summarizeBySpecies, periodRange, clampCount } from './opazanja.js';
import { savePhoto, deletePhoto, createPhotoStrip } from './foto.js';
import { currentFix } from './gps.js';
import { loadJSON, saveSoft } from './storage.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import { shareDialog, memberName } from './dijeljenje-ui.js';
import { VIDLJIVOST } from './zapisi.js';

const STORE = 'opazanja';
const LAST_KEY = 'lovac.opazanje.zadnja_vrsta';
const FILTER_KEY = 'lovac.opazanja.filter';
const PALETA = ['#e4572e', '#2f7dff', '#17a34a', '#d9a441', '#a855f7', '#0ea5a4', '#db2777', '#64748b'];
const $ = (id) => document.getElementById(id);

const pad = (n) => String(n).padStart(2, '0');
export function formatWhen(t) {
  const d = new Date(t);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function colorFor(vrste, kod) {
  const i = vrste.findIndex((v) => v.kod === kod);
  return PALETA[(i < 0 ? 0 : i) % PALETA.length];
}

function categoryName(vrste, vrsta, kat) {
  if (!kat || kat === 'nepoznato') return 'spol/dob nepoznat';
  return vrste.find((v) => v.kod === vrsta)?.kategorije?.find((k) => k.kod === kat)?.naziv || kat;
}

export function initOpazanja(L, map) {
  const layer = L.layerGroup().addTo(map);
  const photos = createPhotoStrip();
  const sheet = $('opazanje-forma');
  const form = $('forma-opazanje');
  const overview = $('opazanja');
  let draft = null;
  let filter = { prikaz: 'tacke', vrsta: '', period: '30', naKarti: true, ...loadJSON(FILTER_KEY, {}) };

  const setPressed = (container, attr, value) => {
    container.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
  };

  const filtered = async () => {
    const { od, do: doT } = periodRange(filter.period);
    return filterObservations(await listRecords(STORE), { vrsta: filter.vrsta || null, od, do: doT });
  };

  const renderLayer = async () => {
    const vrste = await getSpisakAll('vrste');
    layer.clearLayers();
    if (!filter.naKarti) return;
    const list = await filtered();
    if (filter.prikaz === 'gustina') {
      for (const c of densityGrid(list, 500)) {
        L.rectangle([[c.lat0, c.lon0], [c.lat1, c.lon1]], {
          interactive: false, weight: 0, fillColor: '#e4572e', fillOpacity: 0.15 + 0.55 * c.intensity, className: 'op-gustina',
        }).addTo(layer);
      }
      return;
    }
    for (const o of list) {
      const color = colorFor(vrste, o.vrsta);
      L.circleMarker([o.lat, o.lon], {
        radius: 6 + Math.min(o.broj || 1, 10) / 2, color: '#ffffff', weight: 2, fillColor: color, fillOpacity: 0.9, className: 'op-tacka',
      }).bindPopup(`<b>${escapeHtml(lookupNaziv(vrste, o.vrsta))}</b> × ${o.broj}<br>${escapeHtml(categoryName(vrste, o.vrsta, o.kategorija))}`
        + `<br>${escapeHtml(formatWhen(o.vrijeme))}${o.napomena ? `<br>${escapeHtml(o.napomena)}` : ''}`
        + `${o.tudji ? `<br><i>Podijelio: ${escapeHtml(memberName(o.vlasnik_id))}</i>` : ''}`).addTo(layer);
    }
  };

  // ---- brzi unos ----
  const renderCategories = async () => {
    const v = (await getSpisakAll('vrste')).find((x) => x.kod === draft.vrsta);
    const kats = [...(v?.kategorije || []), { kod: 'nepoznato', naziv: 'Nepoznato' }];
    if (!kats.some((k) => k.kod === draft.kategorija)) draft.kategorija = 'nepoznato';
    $('op-kategorija').innerHTML = kats.map((k) => `<button type="button" data-kat="${escapeHtml(k.kod)}">${escapeHtml(k.naziv)}</button>`).join('');
    setPressed($('op-kategorija'), 'data-kat', draft.kategorija);
  };

  const openForm = async () => {
    const vrste = await getSpisak('vrste');
    const fix = currentFix();
    const c = map.getCenter();
    const last = loadJSON(LAST_KEY, null);
    draft = {
      vrsta: vrste.some((v) => v.kod === last) ? last : vrste[0]?.kod,
      kategorija: 'nepoznato',
      foto: [],
      vrijeme: Date.now(),
      ...(fix ? { lat: fix.lat, lon: fix.lon, acc: fix.acc, izvor: `GPS ±${Math.round(fix.acc)} m` }
        : { lat: c.lat, lon: c.lng, acc: null, izvor: 'nema GPS-a — nišan na sredini karte' }),
    };
    $('op-vrijeme').textContent = formatWhen(draft.vrijeme);
    $('op-pozicija').textContent = `Pozicija: ${draft.izvor}`;
    $('op-vrste').innerHTML = vrste.map((v) => `<button type="button" data-kod="${escapeHtml(v.kod)}">${escapeHtml(v.naziv)}</button>`).join('');
    setPressed($('op-vrste'), 'data-kod', draft.vrsta);
    form.broj.value = '1';
    form.napomena.value = '';
    $('op-upozorenje').hidden = true;
    await renderCategories();
    await photos.render($('op-foto'), [], true);
    $('meni-dodaj').hidden = true;
    sheet.hidden = false;
    document.dispatchEvent(new CustomEvent('opazanje:vrsta', { detail: { vrsta: draft.vrsta, kategorija: draft.kategorija } }));
  };

  const closeForm = async (saved) => {
    if (!saved && draft) for (const id of draft.foto) await deletePhoto(id);
    draft = null;
    photos.release();
    sheet.hidden = true;
  };

  $('op-vrste').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-kod]');
    if (!b) return;
    draft.vrsta = b.dataset.kod;
    setPressed($('op-vrste'), 'data-kod', draft.vrsta);
    await renderCategories();
    document.dispatchEvent(new CustomEvent('opazanje:vrsta', { detail: { vrsta: draft.vrsta, kategorija: draft.kategorija } }));
  });
  $('op-kategorija').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kat]');
    if (!b) return;
    draft.kategorija = b.dataset.kat;
    setPressed($('op-kategorija'), 'data-kat', draft.kategorija);
    document.dispatchEvent(new CustomEvent('opazanje:vrsta', { detail: { vrsta: draft.vrsta, kategorija: draft.kategorija } }));
  });
  $('op-broj-plus').addEventListener('click', () => { form.broj.value = String(clampCount(Number(form.broj.value) + 1)); });
  $('op-broj-minus').addEventListener('click', () => { form.broj.value = String(clampCount(Number(form.broj.value) - 1)); });
  $('op-foto-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      try { draft.foto.push(await savePhoto(f)); } catch (err) { toast(err.message); }
    }
    await photos.render($('op-foto'), draft.foto, true);
  });
  $('op-foto').addEventListener('click', async (e) => {
    const b = e.target.closest('.foto-ukloni');
    if (!b) return;
    const id = b.closest('[data-foto]').dataset.foto;
    draft.foto = draft.foto.filter((x) => x !== id);
    await deletePhoto(id);
    await photos.render($('op-foto'), draft.foto, true);
  });
  $('btn-op-odustani').addEventListener('click', () => closeForm(false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rec = newRecord({
      vrsta: draft.vrsta,
      kategorija: draft.kategorija,
      broj: clampCount(form.broj.value),
      napomena: form.napomena.value.trim(),
      fotografije: draft.foto,
      vrijeme: draft.vrijeme,
      lat: draft.lat,
      lon: draft.lon,
      acc: draft.acc,
    });
    try {
      await saveRecord(STORE, rec);
    } catch {
      return;
    }
    saveSoft(LAST_KEY, rec.vrsta);
    await closeForm(true);
    await renderLayer();
    toast('Opažanje sačuvano');
  });

  $('btn-opazanje').addEventListener('click', openForm);
  $('btn-dodaj-opazanje').addEventListener('click', openForm);

  // ---- pregled ----
  const saveFilter = () => saveSoft(FILTER_KEY, filter);

  const renderOverview = async () => {
    const vrste = await getSpisakAll('vrste');
    const sel = $('op-filter-vrsta');
    sel.innerHTML = `<option value="">Sve vrste</option>${(await getSpisak('vrste'))
      .map((v) => `<option value="${escapeHtml(v.kod)}">${escapeHtml(v.naziv)}</option>`).join('')}`;
    sel.value = filter.vrsta;
    setPressed($('op-prikaz'), 'data-prikaz', filter.prikaz);
    setPressed($('op-period'), 'data-period', filter.period);
    $('op-na-karti').setAttribute('aria-pressed', String(filter.naKarti));
    $('op-na-karti').textContent = filter.naKarti ? 'Na karti: prikazano' : 'Na karti: sakriveno';
    const list = (await filtered()).sort((a, b) => b.vrijeme - a.vrijeme);
    $('op-zbir').innerHTML = summarizeBySpecies(list)
      .map((s) => `<li>${escapeHtml(lookupNaziv(vrste, s.vrsta))}: <b>${s.grla}</b> grla u ${s.opazanja} opažanja</li>`).join('')
      || '<li>Nema opažanja u ovom periodu.</li>';
    $('opazanja-spisak').innerHTML = list.map((o) => `
      <li class="trag-red" data-id="${escapeHtml(o.id)}">
        <div class="trag-naslov"><b>${escapeHtml(lookupNaziv(vrste, o.vrsta))} × ${o.broj}</b>
        <span class="sitno">${escapeHtml(categoryName(vrste, o.vrsta, o.kategorija))} · ${escapeHtml(formatWhen(o.vrijeme))}</span>
        ${o.napomena ? `<span class="sitno">${escapeHtml(o.napomena)}</span>` : ''}
        <span class="sitno">${o.tudji ? `Podijelio: ${escapeHtml(memberName(o.vlasnik_id))}` : `Vidljivost: ${escapeHtml(VIDLJIVOST[o.vidljivost || 'privatno'])}`}</span></div>
        <div class="red-dugmadi">
          <button type="button" class="dugme" data-akcija="prikazi">Na karti</button>
          ${o.tudji ? '' : '<button type="button" class="dugme" data-akcija="dijeli">Dijeli</button><button type="button" class="dugme" data-akcija="obrisi">Obriši</button>'}
        </div>
      </li>`).join('');
    $('opazanja-spisak').querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        const id = b.closest('[data-id]').dataset.id;
        const o = await getRecord(STORE, id);
        for (const f of o?.fotografije || []) await deletePhoto(f);
        await deleteRecord(STORE, id);
        await renderOverview();
        await renderLayer();
      });
    });
  };

  const changeFilter = async (patch) => {
    filter = { ...filter, ...patch };
    saveFilter();
    await renderOverview();
    await renderLayer();
  };

  $('op-prikaz').addEventListener('click', (e) => { const b = e.target.closest('[data-prikaz]'); if (b) changeFilter({ prikaz: b.dataset.prikaz }); });
  $('op-period').addEventListener('click', (e) => { const b = e.target.closest('[data-period]'); if (b) changeFilter({ period: b.dataset.period }); });
  $('op-filter-vrsta').addEventListener('change', (e) => changeFilter({ vrsta: e.target.value }));
  $('op-na-karti').addEventListener('click', () => changeFilter({ naKarti: !filter.naKarti }));
  $('opazanja-spisak').addEventListener('click', async (e) => {
    const share = e.target.closest('[data-akcija="dijeli"]');
    if (share) { await shareDialog()?.open(STORE, share.closest('[data-id]').dataset.id); return; }
    const b = e.target.closest('[data-akcija="prikazi"]');
    if (!b) return;
    const o = await getRecord(STORE, b.closest('[data-id]').dataset.id);
    overview.hidden = true;
    if (!filter.naKarti || filter.prikaz !== 'tacke') await changeFilter({ naKarti: true, prikaz: 'tacke' });
    map.setView([o.lat, o.lon], Math.max(map.getZoom(), 16));
  });
  $('btn-opazanja').addEventListener('click', async () => {
    $('meni-spiskovi').hidden = true;
    await renderOverview();
    overview.hidden = false;
  });
  $('btn-opazanja-zatvori').addEventListener('click', () => { overview.hidden = true; });

  registerBackHandler(() => {
    if (!sheet.hidden) { closeForm(false); return true; }
    if (!overview.hidden) { overview.hidden = true; return true; }
    return false;
  });

  document.addEventListener('zapisi:promjena', () => {
    renderLayer().catch((err) => console.error('opažanja', err));
    if (!overview.hidden) renderOverview();
  });
  renderLayer().catch((err) => console.error('opažanja', err));
}
