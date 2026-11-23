// Lov iz arhive na karti: tragovi kretanja lovaca (lov-tragovi-ui) i slike lova sa lokacijom, uz bočnu kontrolu
// "Tragovi / Slike / Sakrij" — svaki sloj se prikazuje i sakriva posebno, karta ostaje slobodna.
import { photosOnMap } from './arhiva-kalendar.js';
import { escapeHtml, registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);

export function initArhivaKarta(L, map) {
  const ctrl = $('arh-karta');
  if (!ctrl) return;
  const photos = L.layerGroup();
  let cur = null; // { lovId, naziv, slike }
  let showTrails = true;
  let showPhotos = true;

  const drawPhotos = () => {
    photos.clearLayers();
    if (!cur) return;
    for (const s of photosOnMap(cur.slike).sa) {
      const icon = L.divIcon({ className: 'arh-slika-wrap', html: `<span class="arh-slika-marker"><img src="${escapeHtml(s.mala || '')}" alt=""></span>`, iconSize: [44, 44], iconAnchor: [22, 22] });
      L.marker([s.lat, s.lon], { icon, keyboard: false })
        .on('click', () => document.dispatchEvent(new CustomEvent('lov:slika-otvori', { detail: { lovId: cur.lovId, id: s.id } })))
        .addTo(photos);
    }
  };
  const sync = () => {
    $('btn-arh-tragovi').setAttribute('aria-pressed', String(showTrails));
    $('btn-arh-slike').setAttribute('aria-pressed', String(showPhotos));
    const { sa, bez } = photosOnMap(cur?.slike || []);
    $('arh-karta-slike').textContent = `Slike ${sa.length}${bez ? ` (+${bez})` : ''}`;
    $('btn-arh-slike').disabled = !sa.length;
    if (showPhotos && sa.length) photos.addTo(map); else photos.remove();
  };
  const hide = () => {
    if (cur) document.dispatchEvent(new CustomEvent('lovtrag:sakrij', { detail: { lovId: cur.lovId } }));
    photos.clearLayers();
    photos.remove();
    cur = null;
    ctrl.hidden = true;
  };

  document.addEventListener('arhiva:na-karti', (e) => {
    const { lovId, naziv, slike = [] } = e.detail;
    if (cur && cur.lovId !== lovId) hide();
    cur = { lovId, naziv, slike };
    showTrails = true;
    showPhotos = true;
    $('arh-karta-naziv').textContent = naziv || 'Lov';
    ctrl.hidden = false;
    drawPhotos();
    sync();
    document.dispatchEvent(new CustomEvent('lovtrag:arhiva', { detail: { lovId } }));
    // bez traga: karta ide na slike lova
    const { sa } = photosOnMap(slike);
    if (sa.length) setTimeout(() => { if (!document.querySelector('#lov-trag-legenda:not([hidden])')) map.fitBounds(sa.map((s) => [s.lat, s.lon]), { padding: [60, 60], maxZoom: 16, animate: false }); }, 600);
  });
  // svježe slike lova (dodane ili preuzete dok je lov na karti)
  document.addEventListener('lov:slike-promjena', (e) => {
    if (!cur || e.detail?.lovId !== cur.lovId || !e.detail.slike) return;
    cur.slike = e.detail.slike;
    drawPhotos();
    sync();
  });
  $('btn-arh-tragovi').addEventListener('click', () => {
    if (!cur) return;
    showTrails = !showTrails;
    document.dispatchEvent(new CustomEvent(showTrails ? 'lovtrag:arhiva' : 'lovtrag:sakrij', { detail: { lovId: cur.lovId, fit: false } }));
    sync();
  });
  $('btn-arh-slike').addEventListener('click', () => { if (cur) { showPhotos = !showPhotos; sync(); } });
  $('btn-arh-karta-zatvori').addEventListener('click', hide);
  registerBackHandler(() => {
    // dok je otvoren neki ekran (npr. arhiva), Nazad zatvara njega, ne lov na karti
    if (ctrl.hidden || document.querySelector('.list-preko:not([hidden])')) return false;
    hide();
    return true;
  });
}
