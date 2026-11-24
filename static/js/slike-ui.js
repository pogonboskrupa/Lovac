// Slika na poziciji: dodaje se iz menija "+", čuva lokalno (IndexedDB) i prikazuje na karti kao sličica;
// dodir otvara veću sliku, opis, udaljenost i brisanje. Slike ostaju na telefonu (ne šalju se na server).

import { gateLayer } from './razmjer-prikaz.js';
import { openImageViewer } from './slika-pregled.js';
import { idbAll, idbPut, idbDelete } from './db.js';
import { savePhoto, deletePhoto, photoUrl, makeThumbnail } from './foto.js';
import { uuid } from './zapisi.js';
import { currentFix } from './gps.js';
import { rangeLabel } from './istrazivac.js';
import { formatCoordMode } from './geo.js';
import { getCoordMode } from './map.js';
import { SLIKA_KATEGORIJE, pictureCategoryName, validateSlika, newSlika, sortSlike } from './slike.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const STORE = 'slike';
const whenText = (t) => new Date(t).toLocaleString('bs-BA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function initSlike(L, map) {
  const layer = L.layerGroup();
  gateLayer(map, layer, 'slike');
  const sheet = $('slika-forma');
  const form = $('forma-slika');
  let draft = null; // { kategorija, foto, mala, lat, lon, izvor }

  const icon = (s) => L.divIcon({
    className: 'slika-ikona',
    html: `<div class="slika-marker" style="--boja:${SLIKA_KATEGORIJE[s.kategorija]?.boja || '#a16207'}"><img src="${s.mala}" alt=""></div>`,
    iconSize: [56, 64], iconAnchor: [28, 62], popupAnchor: [0, -58],
  });

  const popupHtml = (s) => `<div class="slika-popup" data-id="${escapeHtml(s.id)}">
    <img class="slika-popup-img" src="${s.mala}" alt="${escapeHtml(pictureCategoryName(s.kategorija))}">
    <b>${escapeHtml(pictureCategoryName(s.kategorija))}</b>
    <span class="sitno">${escapeHtml(whenText(s.vrijeme))}${currentFix() ? ` · ${escapeHtml(rangeLabel(currentFix(), s))}` : ''}</span>
    ${s.opis ? `<span>${escapeHtml(s.opis)}</span>` : ''}
    <div class="red-dugmadi"><button type="button" class="dugme glavno" data-akcija="velika">Veća slika</button>
    <button type="button" class="dugme" data-akcija="obrisi">Obriši</button></div></div>`;

  const POPUP_OPC = { minWidth: 190, autoPanPaddingTopLeft: [10, 90], autoPanPaddingBottomRight: [10, 100] };
  const renderLayer = async () => {
    layer.clearLayers();
    for (const s of sortSlike(await idbAll(STORE).catch(() => [])).reverse()) {
      // Dodir na sličicu odmah otvara veliku sliku; detalji i brisanje su dugme ispod nje.
      L.marker([s.lat, s.lon], { icon: icon(s), keyboard: false }).on('click', () => openViewer(s, true)).addTo(layer);
    }
  };

  // ---------- veća slika (zajednički pregled preko cijelog ekrana) ----------
  const openViewer = async (s, withDetails = false) => {
    const url = await photoUrl(s.foto).catch(() => null);
    openImageViewer({
      src: url || s.mala,
      revoke: Boolean(url),
      caption: `${pictureCategoryName(s.kategorija)}${s.opis ? ` — ${s.opis}` : ''} · ${whenText(s.vrijeme)}`,
      actions: withDetails ? [{ label: 'Detalji i brisanje', onClick: () => map.openPopup(L.popup(POPUP_OPC).setLatLng([s.lat, s.lon]).setContent(popupHtml(s))) }] : [],
    });
  };

  // popup: dugmad se vezuju kad se otvori (sadržaj nastaje tek tada)
  map.on('popupopen', (e) => {
    const root = e.popup.getElement()?.querySelector('.slika-popup');
    if (!root) return;
    const id = root.dataset.id;
    root.querySelector('[data-akcija="velika"]').addEventListener('click', async () => {
      const s = (await idbAll(STORE)).find((x) => x.id === id);
      if (s) await openViewer(s);
    });
    wireTwoTap(root.querySelector('[data-akcija="obrisi"]'), 'Dodirni ponovo za brisanje', async () => {
      const s = (await idbAll(STORE)).find((x) => x.id === id);
      map.closePopup();
      if (s) { await deletePhoto(s.foto); await idbDelete(STORE, id); }
      await renderLayer();
      toast('Slika obrisana');
    });
  });

  // ---------- forma ----------
  const setPressed = () => $('slika-kategorija').querySelectorAll('[data-kat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kat === draft.kategorija)));

  const renderPreview = async () => {
    const box = $('slika-pregled-mala');
    box.innerHTML = draft.mala ? `<figure class="foto"><img src="${draft.mala}" alt="Pregled"></figure>` : '';
  };

  const open = (tragId = null) => {
    const fix = currentFix();
    const c = map.getCenter();
    draft = { tragId, kategorija: tragId ? 'ostalo' : 'cekalo', foto: null, mala: null, ...(fix ? { lat: fix.lat, lon: fix.lon, izvor: `GPS ±${Math.round(fix.acc ?? 0)} m` } : { lat: c.lat, lon: c.lng, izvor: 'nema GPS-a — pozicija je odabrano na sredini karte' }) };
    $('slika-kategorija').innerHTML = Object.entries(SLIKA_KATEGORIJE).map(([k, v]) => `<button type="button" data-kat="${k}">${v.naziv}</button>`).join('');
    setPressed();
    $('slika-naslov').textContent = tragId ? 'Slika na tragu' : 'Slika na poziciji';
    const f = formatCoordMode(getCoordMode(), draft.lat, draft.lon);
    $('slika-pozicija').textContent = `Pozicija: ${f.oznaka} ${f.tekst} (${draft.izvor})`;
    form.reset();
    $('slika-status').textContent = '';
    renderPreview();
    $('meni-dodaj').hidden = true;
    sheet.hidden = false;
  };

  const close = async (saved) => {
    if (!saved && draft?.foto) await deletePhoto(draft.foto);
    draft = null;
    sheet.hidden = true;
  };

  $('btn-dodaj-sliku').addEventListener('click', () => open(null));
  // Tokom snimanja traga (dugme "Dodaj sliku" u panelu snimanja).
  document.addEventListener('slika:nova', (e) => open(e.detail?.tragId || null));
  $('btn-slika-odustani').addEventListener('click', () => close(false));
  $('slika-kategorija').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kat]');
    if (b) { draft.kategorija = b.dataset.kat; setPressed(); }
  });
  $('slika-ulaz').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (draft.foto) await deletePhoto(draft.foto);
      draft.mala = await makeThumbnail(file);
      draft.foto = await savePhoto(file);
      await renderPreview();
    } catch (err) {
      $('slika-status').textContent = err.message;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const opis = form.elements.opis.value;
    const err = validateSlika({ ...draft, opis });
    if (err) { $('slika-status').textContent = err; return; }
    try {
      await idbPut(STORE, newSlika({ id: uuid(), kategorija: draft.kategorija, foto: draft.foto, mala: draft.mala, lat: draft.lat, lon: draft.lon, opis, tragId: draft.tragId }));
    } catch (er) {
      $('slika-status').textContent = `Slika nije sačuvana: ${er.message}`;
      return;
    }
    const at = [draft.lat, draft.lon];
    await close(true);
    await renderLayer();
    map.setView(at, Math.max(map.getZoom(), 16), { animate: false });
    toast('Slika je na karti');
  });

  registerBackHandler(() => {
    if (!sheet.hidden) { close(false); return true; }
    return false;
  });

  renderLayer().catch((err) => console.error('slike', err));
}
