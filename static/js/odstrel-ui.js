// UI evidencije odstrela: unos (uz upozorenja), spisak sa zbirom, izvoz CSV i PDF.

import { getSpisak, getSpisakAll, lookupNaziv } from './spiskovi.js';
import { newRecord, saveRecord, listRecords, deleteRecord, getRecord, VIDLJIVOST } from './zapisi.js';
import { toCsv, reportHtml, summarizeHarvest, harvestWarnings, parseDecimalBs, formatDecimalBs, NAPOMENA_DNEVNIK } from './odstrel.js';
import { filterObservations, periodRange } from './opazanja.js';
import { pickRule, huntingWindow } from './propisi.js';
import { sunTimes } from './sunce.js';
import { savePhoto, deletePhoto, createPhotoStrip } from './foto.js';
import { currentFix } from './gps.js';
import { cachedProfile } from './auth.js';
import { shareFile } from './dijeljenje.js';
import { shareDialog, memberName } from './dijeljenje-ui.js';
import { formatWhen } from './opazanja-ui.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const STORE = 'odstrel';
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function myName() {
  const p = cachedProfile();
  return p ? `${p.ime} ${p.prezime}` : '';
}

// Štampa / PDF: APK ide kroz AndroidPrint (WebView nema pouzdan window.print), browser kroz iframe.
export function printHtml(html, job) {
  const bridge = globalThis.AndroidPrint;
  if (bridge?.printHtml) { bridge.printHtml(html, job); return 'android'; }
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0';
  document.body.appendChild(f);
  f.srcdoc = html;
  f.onload = () => { f.contentWindow.print(); setTimeout(() => f.remove(), 60000); };
  return 'iframe';
}

function harvestCategoryName(vrste, vrsta, kat) {
  if (!kat || kat === 'nepoznato') return '';
  return vrste.find((v) => v.kod === vrsta)?.kategorije?.find((k) => k.kod === kat)?.naziv || kat;
}

export function initOdstrel(L, map) {
  const layer = L.layerGroup().addTo(map);
  const photos = createPhotoStrip();
  const sheet = $('odstrel-forma');
  const form = $('forma-odstrel');
  const list = $('odstrel');
  let draft = null;
  let filter = { period: 'godina', vrsta: '' };

  const setPressed = (container, attr, value) => {
    container.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
  };

  const renderLayer = async () => {
    layer.clearLayers();
    const vrste = await getSpisakAll('vrste');
    for (const o of await listRecords(STORE)) {
      L.circleMarker([o.lat, o.lon], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#7c3aed', fillOpacity: 0.95, className: 'ods-tacka' })
        .bindPopup(`<b>Odstrel: ${escapeHtml(lookupNaziv(vrste, o.vrsta))}</b> ${escapeHtml(harvestCategoryName(vrste, o.vrsta, o.kategorija))}<br>${escapeHtml(formatWhen(o.vrijeme))}`
          + `${o.tezina != null ? `<br>${escapeHtml(formatDecimalBs(o.tezina))} kg` : ''}<br>${escapeHtml(o.lovac || '')}`)
        .addTo(layer);
    }
  };

  const currentWarnings = async () => {
    const vrijeme = new Date(form.vrijeme.value).getTime() || Date.now();
    const rule = pickRule(await getSpisakAll('lovno_vrijeme'), draft.vrsta);
    const d = new Date(vrijeme);
    const sun = sunTimes(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), draft.lat, draft.lon);
    return harvestWarnings({ vrsta: draft.vrsta, kategorija: draft.kategorija, vrijeme }, await getSpisakAll('lovostaj'), rule && huntingWindow(sun, rule));
  };

  const showWarnings = async () => {
    const w = await currentWarnings();
    const el = $('ods-upozorenja');
    el.hidden = !w.length;
    el.innerHTML = w.map((x) => `<span>${escapeHtml(x)}</span>`).join('<br>');
    draft.potvrdjeno = false;
    $('btn-ods-sacuvaj').textContent = 'Sačuvaj';
    return w;
  };

  const renderCategories = async () => {
    const v = (await getSpisakAll('vrste')).find((x) => x.kod === draft.vrsta);
    const kats = [...(v?.kategorije || []), { kod: 'nepoznato', naziv: 'Nije navedeno' }];
    if (!kats.some((k) => k.kod === draft.kategorija)) draft.kategorija = kats[0].kod;
    $('ods-kategorija').innerHTML = kats.map((k) => `<button type="button" data-kat="${escapeHtml(k.kod)}">${escapeHtml(k.naziv)}</button>`).join('');
    setPressed($('ods-kategorija'), 'data-kat', draft.kategorija);
  };

  const openForm = async () => {
    const vrste = await getSpisak('vrste');
    const fix = currentFix();
    const c = map.getCenter();
    draft = {
      vrsta: vrste[0]?.kod, kategorija: null, foto: [], potvrdjeno: false,
      ...(fix ? { lat: fix.lat, lon: fix.lon, izvor: `GPS ±${Math.round(fix.acc)} m` } : { lat: c.lat, lon: c.lng, izvor: 'nema GPS-a — nišan na sredini karte' }),
    };
    $('ods-vrste').innerHTML = vrste.map((v) => `<button type="button" data-kod="${escapeHtml(v.kod)}">${escapeHtml(v.naziv)}</button>`).join('');
    setPressed($('ods-vrste'), 'data-kod', draft.vrsta);
    form.vrijeme.value = toLocalInput(Date.now());
    form.tezina.value = '';
    form.trofej.value = '';
    form.lovac.value = myName();
    form.napomena.value = '';
    $('ods-pozicija').textContent = `Pozicija: ${draft.izvor}`;
    await renderCategories();
    await photos.render($('ods-foto'), [], true);
    await showWarnings();
    $('meni-dodaj').hidden = true;
    sheet.hidden = false;
  };

  const closeForm = async (saved) => {
    if (!saved && draft) for (const id of draft.foto) await deletePhoto(id);
    draft = null;
    photos.release();
    sheet.hidden = true;
  };

  $('ods-vrste').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-kod]');
    if (!b) return;
    draft.vrsta = b.dataset.kod;
    setPressed($('ods-vrste'), 'data-kod', draft.vrsta);
    await renderCategories();
    await showWarnings();
  });
  $('ods-kategorija').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-kat]');
    if (!b) return;
    draft.kategorija = b.dataset.kat;
    setPressed($('ods-kategorija'), 'data-kat', draft.kategorija);
    await showWarnings();
  });
  form.vrijeme.addEventListener('change', showWarnings);
  $('ods-foto-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      try { draft.foto.push(await savePhoto(f)); } catch (err) { toast(err.message); }
    }
    await photos.render($('ods-foto'), draft.foto, true);
  });
  $('ods-foto').addEventListener('click', async (e) => {
    const b = e.target.closest('.foto-ukloni');
    if (!b) return;
    const id = b.closest('[data-foto]').dataset.foto;
    draft.foto = draft.foto.filter((x) => x !== id);
    await deletePhoto(id);
    await photos.render($('ods-foto'), draft.foto, true);
  });
  $('btn-ods-odustani').addEventListener('click', () => closeForm(false));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tezina = parseDecimalBs(form.tezina.value);
    if (form.tezina.value.trim() && (tezina == null || tezina <= 0 || tezina > 1000)) {
      $('ods-status').textContent = 'Težina: broj u kg (npr. 18,5)';
      return;
    }
    // Upozorenje (lovostaj / van lovnog vremena) traži svjesnu potvrdu drugim dodirom.
    const warnings = await currentWarnings();
    if (warnings.length && !draft.potvrdjeno) {
      draft.potvrdjeno = true;
      $('btn-ods-sacuvaj').textContent = 'Sačuvaj uprkos upozorenju';
      $('ods-upozorenja').hidden = false;
      return;
    }
    const rec = newRecord({
      vrsta: draft.vrsta,
      kategorija: draft.kategorija,
      vrijeme: new Date(form.vrijeme.value).getTime() || Date.now(),
      tezina,
      trofej: form.trofej.value.trim(),
      lovac: form.lovac.value.trim() || myName(),
      napomena: form.napomena.value.trim(),
      upozorenja: warnings,
      fotografije: draft.foto,
      lat: draft.lat,
      lon: draft.lon,
    });
    try { await saveRecord(STORE, rec); } catch { return; }
    $('ods-status').textContent = '';
    await closeForm(true);
    await renderLayer();
    toast('Odstrel upisan');
  });

  $('btn-dodaj-odstrel').addEventListener('click', openForm);

  // ---- spisak, zbir, izvoz ----
  const filtered = async () => {
    const { od, do: doT } = periodRange(filter.period);
    return filterObservations(await listRecords(STORE), { vrsta: filter.vrsta || null, od, do: doT }).sort((a, b) => b.vrijeme - a.vrijeme);
  };

  const exportRows = async () => {
    const vrste = await getSpisakAll('vrste');
    return (await filtered()).map((o) => ({
      datum: formatWhen(o.vrijeme),
      vrsta: lookupNaziv(vrste, o.vrsta),
      kategorija: harvestCategoryName(vrste, o.vrsta, o.kategorija),
      tezina: o.tezina,
      trofej: o.trofej || '',
      lovac: o.tudji ? memberName(o.vlasnik_id) : (o.lovac || ''),
      lat: o.lat?.toFixed(6),
      lon: o.lon?.toFixed(6),
      napomena: o.napomena || '',
    }));
  };
  const KOLONE = [
    { key: 'datum', label: 'Datum i vrijeme' }, { key: 'vrsta', label: 'Vrsta' }, { key: 'kategorija', label: 'Spol/dob' },
    { key: 'tezina', label: 'Težina (kg)', type: 'decimal' }, { key: 'trofej', label: 'Trofej / ocjena' },
    { key: 'lovac', label: 'Odstrijelio' }, { key: 'lat', label: 'Širina' }, { key: 'lon', label: 'Dužina' }, { key: 'napomena', label: 'Napomena' },
  ];

  const render = async () => {
    const vrste = await getSpisakAll('vrste');
    const sel = $('ods-filter-vrsta');
    sel.innerHTML = `<option value="">Sve vrste</option>${(await getSpisak('vrste')).map((v) => `<option value="${escapeHtml(v.kod)}">${escapeHtml(v.naziv)}</option>`).join('')}`;
    sel.value = filter.vrsta;
    setPressed($('ods-period'), 'data-period', filter.period);
    const items = await filtered();
    $('ods-zbir').innerHTML = summarizeHarvest(items)
      .map((s) => `<li>${escapeHtml(lookupNaziv(vrste, s.vrsta))}: <b>${s.komada}</b> kom., ${escapeHtml(formatDecimalBs(Math.round(s.tezina * 10) / 10))} kg</li>`).join('')
      || '<li>Nema upisanog odstrela u ovom periodu.</li>';
    $('odstrel-spisak').innerHTML = items.map((o) => `
      <li class="trag-red" data-id="${escapeHtml(o.id)}">
        <div class="trag-naslov"><b>${escapeHtml(lookupNaziv(vrste, o.vrsta))} ${escapeHtml(harvestCategoryName(vrste, o.vrsta, o.kategorija))}</b>
        <span class="sitno">${escapeHtml(formatWhen(o.vrijeme))}${o.tezina != null ? ` · ${escapeHtml(formatDecimalBs(o.tezina))} kg` : ''} · ${escapeHtml(o.tudji ? memberName(o.vlasnik_id) : o.lovac || '')}</span>
        ${o.upozorenja?.length ? `<span class="sitno upozorenje-tekst">${escapeHtml(o.upozorenja.join(' '))}</span>` : ''}
        <span class="sitno">${o.tudji ? 'Podijeljeno sa tobom' : `Vidljivost: ${escapeHtml(VIDLJIVOST[o.vidljivost || 'privatno'])}`}</span></div>
        ${o.tudji ? '' : `<div class="red-dugmadi"><button type="button" class="dugme" data-akcija="dijeli">Dijeli</button>
          <button type="button" class="dugme" data-akcija="obrisi">Obriši</button></div>`}
      </li>`).join('');
    $('odstrel-spisak').querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        const id = b.closest('[data-id]').dataset.id;
        const o = await getRecord(STORE, id);
        for (const f of o?.fotografije || []) await deletePhoto(f);
        await deleteRecord(STORE, id);
        await render();
        await renderLayer();
      });
    });
  };

  $('odstrel-spisak').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-akcija="dijeli"]');
    if (b) await shareDialog()?.open(STORE, b.closest('[data-id]').dataset.id);
  });
  $('ods-period').addEventListener('click', (e) => { const b = e.target.closest('[data-period]'); if (b) { filter.period = b.dataset.period; render(); } });
  $('ods-filter-vrsta').addEventListener('change', (e) => { filter.vrsta = e.target.value; render(); });
  $('btn-ods-csv').addEventListener('click', async () => {
    const d = new Date();
    shareFile(`odstrel-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.csv`, 'text/csv', toCsv(await exportRows(), KOLONE));
  });
  $('btn-ods-pdf').addEventListener('click', async () => {
    const vrste = await getSpisakAll('vrste');
    const items = await filtered();
    const html = reportHtml({
      naslov: 'Evidencija odstrela — Lovačko društvo "Grmeč"',
      podnaslov: `Ispisano ${formatWhen(Date.now())}${filter.vrsta ? ` · ${lookupNaziv(vrste, filter.vrsta)}` : ''}`,
      redovi: await exportRows(),
      kolone: KOLONE.filter((k) => k.key !== 'lat' && k.key !== 'lon'),
      zbir: summarizeHarvest(items).map((s) => `${lookupNaziv(vrste, s.vrsta)}: ${s.komada} kom., ${formatDecimalBs(Math.round(s.tezina * 10) / 10)} kg`),
      napomena: NAPOMENA_DNEVNIK,
    });
    printHtml(html, 'Evidencija odstrela');
  });
  $('btn-odstrel-spisak').addEventListener('click', async () => {
    $('meni-spiskovi').hidden = true;
    await render();
    list.hidden = false;
  });
  $('btn-odstrel-zatvori').addEventListener('click', () => { list.hidden = true; });

  registerBackHandler(() => {
    if (!sheet.hidden) { closeForm(false); return true; }
    if (!list.hidden) { list.hidden = true; return true; }
    return false;
  });
  document.addEventListener('zapisi:promjena', () => { renderLayer(); if (!list.hidden) render(); });
  renderLayer().catch((err) => console.error('odstrel', err));
}
