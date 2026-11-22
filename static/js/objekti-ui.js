// UI lovačkih objekata: markeri, forma (nov/izmjena), detalji, spisak i "Vodi me do".

import { getSpisak, getSpisakAll, lookupNaziv } from './spiskovi.js';
import { matchesQuery } from './pretraga.js';
import { newRecord, saveRecord, updateRecord, getRecord, listRecords, deleteRecord } from './zapisi.js';
import { STANJA, sortByDistance, todayIso, formatDateBs, visitStatus, visitText, filterObjects, sortObjects, typeCounts, OBJEKTI_SORT } from './objekti.js';
import { savePhoto, deletePhoto, createPhotoStrip } from './foto.js';
import { currentFix } from './gps.js';
import { formatDistance } from './trag.js';
import { startNavigation } from './navigacija.js';
import { initVjetar } from './vjetar-ui.js';
import { isStandType, SEKTORI } from './vjetar.js';
import { shareDialog, memberName } from './dijeljenje-ui.js';
import { VIDLJIVOST } from './zapisi.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const STORE = 'objekti';
const $ = (id) => document.getElementById(id);

function iconFor(vrste, kod) {
  return vrste.find((v) => v.kod === kod)?.ikona || 'pin';
}

function markerHtml(vrste, o) {
  return `<div class="obj-ikona" data-vrsta="${escapeHtml(o.vrsta)}" data-stanje="${escapeHtml(o.stanje)}" data-id="${escapeHtml(o.id)}" data-tudji="${Boolean(o.tudji)}">`
    + `<svg class="ic"><use href="#ic-obj-${escapeHtml(iconFor(vrste, o.vrsta))}"/></svg></div>`;
}

const photos = createPhotoStrip();
const renderPhotos = (container, ids, removable) => photos.render(container, ids, removable);
const releaseUrls = () => photos.release();

export function initObjekti(L, map) {
  const layer = L.layerGroup().addTo(map);
  const vjetar = initVjetar(L, map);
  const form = $('forma-objekt');
  const sheet = $('objekt-forma');
  const detail = $('objekt-detalj');
  const list = $('objekti');
  let vrsteAll = [];
  let editing = null; // { rec|null, vrsta, stanje, foto[], removed[], lat, lon }
  let detailId = null;
  let listFilter = 'svi';
  let searchText = '';

  const renderMarkers = async () => {
    vrsteAll = await getSpisakAll('objekat_vrste');
    layer.clearLayers();
    for (const o of await listRecords(STORE)) {
      const icon = L.divIcon({ className: 'obj-marker', html: markerHtml(vrsteAll, o), iconSize: [40, 40], iconAnchor: [20, 20] });
      L.marker([o.lat, o.lon], { icon, title: o.naziv, keyboard: false })
        .on('click', () => openDetail(o.id))
        .addTo(layer);
    }
  };

  // ---- forma ----
  const setPressed = (container, attr, value) => {
    container.querySelectorAll(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value)));
  };

  const updatePositionText = () => {
    $('objekt-pozicija').textContent = `Pozicija: ${editing.lat.toFixed(6)}, ${editing.lon.toFixed(6)} (${editing.izvorPozicije})`;
  };

  // Dozvoljeni smjerovi vjetra (odakle duva) samo za čeke i zaklone.
  const renderWindSectors = () => {
    const show = isStandType(editing.vrsta);
    $('objekt-vjetar-blok').hidden = !show;
    $('objekt-vjetar').innerHTML = SEKTORI.map((n, i) => `<button type="button" data-sektor="${i}" aria-pressed="${editing.vjetar.includes(i)}">${n}</button>`).join('');
  };

  const openForm = async (rec = null) => {
    const vrste = await getSpisak('objekat_vrste');
    const c = map.getCenter();
    editing = {
      rec,
      vrsta: rec?.vrsta || vrste[0]?.kod,
      stanje: rec?.stanje || 'ispravno',
      foto: [...(rec?.fotografije || [])],
      removed: [],
      lat: rec?.lat ?? c.lat,
      lon: rec?.lon ?? c.lng,
      izvorPozicije: rec ? 'sačuvana' : 'nišan na sredini karte',
    };
    $('objekt-forma-naslov').textContent = rec ? 'Izmjena objekta' : 'Nov lovački objekat';
    $('objekt-vrste').innerHTML = vrste.map((v) => `<button type="button" data-kod="${escapeHtml(v.kod)}" aria-pressed="false">`
      + `<svg class="ic"><use href="#ic-obj-${escapeHtml(v.ikona || 'pin')}"/></svg><span>${escapeHtml(v.naziv)}</span></button>`).join('');
    setPressed($('objekt-vrste'), 'data-kod', editing.vrsta);
    setPressed($('objekt-stanje'), 'data-stanje', editing.stanje);
    editing.vjetar = [...(rec?.dozvoljeni_vjetar || [])];
    renderWindSectors();
    form.naziv.value = rec?.naziv || '';
    form.zadnji_obilazak.value = rec?.zadnji_obilazak || todayIso();
    form.napomena.value = rec?.napomena || '';
    await renderPhotos($('objekt-foto'), editing.foto, true);
    updatePositionText();
    detail.hidden = true;
    sheet.hidden = false;
  };

  const closeForm = async (saved) => {
    if (!saved && editing) {
      // Nove slike iz nesačuvane forme se brišu, a postojeće ostaju.
      const original = new Set(editing.rec?.fotografije || []);
      for (const id of editing.foto) if (!original.has(id)) await deletePhoto(id);
    }
    editing = null;
    releaseUrls();
    sheet.hidden = true;
  };

  $('objekt-vrste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kod]');
    if (!b) return;
    editing.vrsta = b.dataset.kod;
    setPressed($('objekt-vrste'), 'data-kod', editing.vrsta);
    renderWindSectors();
  });
  $('objekt-vjetar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sektor]');
    if (!b) return;
    const s = Number(b.dataset.sektor);
    editing.vjetar = editing.vjetar.includes(s) ? editing.vjetar.filter((x) => x !== s) : [...editing.vjetar, s].sort();
    renderWindSectors();
  });
  $('objekt-stanje').addEventListener('click', (e) => {
    const b = e.target.closest('[data-stanje]');
    if (!b) return;
    editing.stanje = b.dataset.stanje;
    setPressed($('objekt-stanje'), 'data-stanje', editing.stanje);
  });
  $('objekt-foto-input').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      try {
        editing.foto.push(await savePhoto(f));
      } catch (err) {
        toast(err.message);
      }
    }
    await renderPhotos($('objekt-foto'), editing.foto, true);
  });
  $('objekt-foto').addEventListener('click', async (e) => {
    const b = e.target.closest('.foto-ukloni');
    if (!b) return;
    const id = b.closest('[data-foto]').dataset.foto;
    editing.foto = editing.foto.filter((x) => x !== id);
    editing.removed.push(id);
    await renderPhotos($('objekt-foto'), editing.foto, true);
  });
  $('btn-objekt-moja-lokacija').addEventListener('click', () => {
    const fix = currentFix();
    if (!fix) { toast('Čekam GPS…'); return; }
    Object.assign(editing, { lat: fix.lat, lon: fix.lon, izvorPozicije: `GPS ±${Math.round(fix.acc)} m` });
    updatePositionText();
  });
  $('btn-objekt-nisan').addEventListener('click', () => {
    const c = map.getCenter();
    Object.assign(editing, { lat: c.lat, lon: c.lng, izvorPozicije: 'nišan na sredini karte' });
    updatePositionText();
  });
  $('btn-objekt-odustani').addEventListener('click', () => closeForm(false));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vrste = await getSpisakAll('objekat_vrste');
    const fields = {
      vrsta: editing.vrsta,
      naziv: form.naziv.value.trim() || lookupNaziv(vrste, editing.vrsta),
      stanje: editing.stanje,
      zadnji_obilazak: form.zadnji_obilazak.value || null,
      napomena: form.napomena.value.trim(),
      fotografije: editing.foto,
      dozvoljeni_vjetar: isStandType(editing.vrsta) ? editing.vjetar : [],
      lat: editing.lat,
      lon: editing.lon,
    };
    try {
      if (editing.rec) await updateRecord(STORE, editing.rec.id, fields);
      else await saveRecord(STORE, newRecord(fields));
      for (const id of editing.removed) await deletePhoto(id);
    } catch {
      return; // saveRecord je već glasno javio grešku; forma ostaje otvorena
    }
    await closeForm(true);
    await renderMarkers();
    toast('Objekat sačuvan');
  });

  // ---- detalji ----
  const openDetail = async (id) => {
    const o = await getRecord(STORE, id);
    if (!o) return;
    detailId = id;
    $('od-naziv').textContent = o.naziv;
    $('od-info').textContent = `${lookupNaziv(vrsteAll, o.vrsta)} · ${STANJA[o.stanje] || o.stanje} · zadnji obilazak ${formatDateBs(o.zadnji_obilazak)}`;
    $('od-napomena').textContent = o.napomena || '';
    $('od-vlasnik').textContent = o.tudji ? `Podijelio: ${memberName(o.vlasnik_id)}` : `Vidljivost: ${VIDLJIVOST[o.vidljivost || 'privatno']}`;
    detail.dataset.tudji = String(Boolean(o.tudji));
    ['btn-od-uredi', 'btn-od-obidjeno', 'btn-od-obrisi', 'btn-od-dijeli'].forEach((b) => { $(b).hidden = Boolean(o.tudji); });
    await renderPhotos($('od-foto'), o.fotografije || [], false);
    detail.dataset.stanje = o.stanje;
    detail.hidden = false;
    if (isStandType(o.vrsta)) vjetar.show(o);
    else { $('od-vjetar').hidden = true; vjetar.hide(); }
  };
  const closeDetail = () => { detail.hidden = true; detailId = null; releaseUrls(); vjetar.hide(); };
  $('btn-od-zatvori').addEventListener('click', closeDetail);
  $('btn-od-dijeli').addEventListener('click', async () => {
    const id = detailId;
    closeDetail();
    await shareDialog()?.open(STORE, id);
  });
  $('btn-od-uredi').addEventListener('click', async () => openForm(await getRecord(STORE, detailId)));
  $('btn-od-obidjeno').addEventListener('click', async () => {
    await updateRecord(STORE, detailId, { zadnji_obilazak: todayIso() });
    await openDetail(detailId);
    toast('Upisan obilazak danas');
  });
  $('btn-od-vodi').addEventListener('click', async () => {
    const o = await getRecord(STORE, detailId);
    closeDetail();
    startNavigation(o);
  });
  wireTwoTap($('btn-od-obrisi'), 'Dodirni ponovo', async () => {
    const o = await getRecord(STORE, detailId);
    for (const f of o?.fotografije || []) await deletePhoto(f);
    await deleteRecord(STORE, detailId);
    closeDetail();
    await renderMarkers();
    toast('Objekat obrisan');
  });

  // ---- spisak ----
  let typeFilter = '';
  let sortMode = 'blizu';
  $('objekti-sort').innerHTML = OBJEKTI_SORT.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  const renderList = async () => {
    const fix = currentFix();
    const from = fix || { lat: map.getCenter().lat, lon: map.getCenter().lng };
    const all = await listRecords(STORE);
    $('obj-stat-ukupno').textContent = String(all.length);
    $('obj-stat-popravka').textContent = String(all.filter((o) => o.stanje === 'popravka').length);
    $('obj-stat-sruseno').textContent = String(all.filter((o) => o.stanje === 'sruseno').length);
    $('obj-stat-kasni').textContent = String(all.filter((o) => visitStatus(o).kasni).length);
    // filteri po vrsti: samo vrste kojih ima, sa brojem
    const counts = typeCounts(all);
    if (typeFilter && !counts.some((c) => c.vrsta === typeFilter)) typeFilter = '';
    $('objekti-vrste').innerHTML = [{ vrsta: '', komada: all.length }, ...counts].map((c) => `<button type="button" data-vrsta-filter="${escapeHtml(c.vrsta)}" aria-pressed="${c.vrsta === typeFilter}">${escapeHtml(c.vrsta ? lookupNaziv(vrsteAll, c.vrsta) : 'Sve vrste')} <span class="sitno">${c.komada}</span></button>`).join('');
    $('objekti-vrste').hidden = counts.length < 2;
    let items = filterObjects(all, { filter: listFilter, vrsta: typeFilter });
    items = items.filter((o) => matchesQuery([o.naziv, o.napomena, STANJA[o.stanje], lookupNaziv(vrsteAll, o.vrsta)], searchText));
    items = sortObjects(sortByDistance(items, from), sortMode);
    setPressed($('objekti-filter'), 'data-filter', listFilter);
    $('objekti-sort').value = sortMode;
    $('objekti-prazno').hidden = items.length > 0;
    $('objekti-spisak').innerHTML = items.map((o) => {
      const v = visitStatus(o);
      return `
      <li class="trag-red obj-red tr-kartica ev-kartica" data-id="${escapeHtml(o.id)}" data-stanje="${escapeHtml(o.stanje)}" data-kasni="${v.kasni}">
        <div class="obj-chipovi">
          <span class="tr-chip" data-stanje="${escapeHtml(o.stanje)}">${escapeHtml(STANJA[o.stanje] || o.stanje)}</span>
          ${v.kasni ? `<span class="tr-chip" data-kasni="true">${v.dana == null ? 'Nije obilažen' : 'Dugo bez obilaska'}</span>` : ''}
        </div>
        <button type="button" class="obj-red-dugme">
          <span class="obj-ikona-krug" data-stanje="${escapeHtml(o.stanje)}"><svg class="ic"><use href="#ic-obj-${escapeHtml(iconFor(vrsteAll, o.vrsta))}"/></svg></span>
          <span class="trag-naslov"><b>${escapeHtml(o.naziv)}</b>
          <span class="sitno">${escapeHtml(lookupNaziv(vrsteAll, o.vrsta))} · ${escapeHtml(formatDistance(o.udaljenost))}</span>
          <span class="sitno">${escapeHtml(visitText(o))}${o.zadnji_obilazak ? ` (${escapeHtml(formatDateBs(o.zadnji_obilazak))})` : ''}</span></span>
        </button>
        <div class="obj-akcije">
          <button type="button" class="dugme" data-akcija="vodi">Vodi me</button>
          ${o.tudji ? '' : '<button type="button" class="dugme" data-akcija="obidjeno">Obiđen danas</button>'}
        </div>
      </li>`;
    }).join('');
  };
  $('objekti-trazi').addEventListener('input', (e) => { searchText = e.target.value; renderList(); });
  $('objekti-filter').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    listFilter = b.dataset.filter;
    await renderList();
  });
  $('objekti-vrste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vrsta-filter]');
    if (b) { typeFilter = b.dataset.vrstaFilter; renderList(); }
  });
  $('objekti-sort').addEventListener('change', (e) => { sortMode = e.target.value; renderList(); });
  $('objekti-spisak').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const o = await getRecord(STORE, row.dataset.id);
    if (!o) return;
    const akcija = e.target.closest('[data-akcija]')?.dataset.akcija;
    if (akcija === 'vodi') { list.hidden = true; startNavigation(o); return; }
    if (akcija === 'obidjeno') {
      await updateRecord(STORE, o.id, { zadnji_obilazak: todayIso() });
      toast('Upisan obilazak danas');
      await renderList();
      return;
    }
    list.hidden = true;
    map.setView([o.lat, o.lon], Math.max(map.getZoom(), 16));
    await openDetail(o.id);
  });
  $('btn-objekti').addEventListener('click', async () => {
    $('meni-spiskovi').hidden = true;
    await renderMarkers();
    await renderList();
    list.hidden = false;
  });
  $('btn-objekti-zatvori').addEventListener('click', () => { list.hidden = true; });
  $('btn-dodaj-objekat').addEventListener('click', () => { $('meni-dodaj').hidden = true; openForm(null); });

  registerBackHandler(() => {
    if (!sheet.hidden) { closeForm(false); return true; }
    if (!detail.hidden) { closeDetail(); return true; }
    if (!list.hidden) { list.hidden = true; return true; }
    return false;
  });

  document.addEventListener('zapisi:promjena', () => renderMarkers().catch((err) => console.error('objekti', err)));
  renderMarkers().catch((err) => console.error('objekti', err));
  return { renderMarkers };
}
