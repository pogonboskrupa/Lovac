// Lov iz arhive na karti: tragovi kretanja lovaca (lov-tragovi-ui) i slike lova sa lokacijom, uz bočnu kontrolu
// "Tragovi / Slike / Sakrij" — svaki sloj se prikazuje i sakriva posebno, karta ostaje slobodna.
import { photosOnMap } from './arhiva-kalendar.js';
import { shotLine } from './arhiva.js';
import { escapeHtml, registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);

export function initArhivaKarta(L, map) {
  const ctrl = $('arh-karta');
  if (!ctrl) return;
  const photos = L.layerGroup();
  const shots = L.layerGroup();
  let cur = null; // { lovId, naziv, slike, pogoci }
  let showTrails = true;
  let showPhotos = true;
  let showShots = true;

  // Pogodak: crveni krug sa metom; dodir pokazuje vrstu, lovca, vrijeme, težinu i stan.
  const shotMarkers = new Map();
  const drawShots = () => {
    shots.clearLayers();
    shotMarkers.clear();
    if (!cur) return;
    for (const s of cur.pogoci || []) {
      const icon = L.divIcon({ className: 'uc-ikona', html: '<span class="arh-pogodak" aria-hidden="true"><svg class="ic"><use href="#ic-target"/></svg></span>', iconSize: [34, 34], iconAnchor: [17, 17] });
      const m = L.marker([s.lat, s.lon], { icon, keyboard: false }).bindPopup(`<b>${escapeHtml(s.naziv)}</b><br>${escapeHtml(shotLine(s).split(' · ').slice(1).join(' · '))}`, { closeButton: true }).addTo(shots);
      shotMarkers.set(s.id, m);
    }
  };
  // Pogodak na karti sa otvorenom karticom (sloj mora već biti na karti, pa se zove poslije sync)
  const focusShot = (id) => {
    const m = shotMarkers.get(id);
    if (!m) return;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 17), { animate: false });
    m.openPopup();
  };

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
    const brojPogodaka = (cur?.pogoci || []).length;
    $('btn-arh-pogoci').setAttribute('aria-pressed', String(showShots));
    $('arh-karta-pogoci').textContent = `Pogoci ${brojPogodaka}`;
    $('btn-arh-pogoci').disabled = !brojPogodaka;
    if (showShots && brojPogodaka) shots.addTo(map); else shots.remove();
  };
  const hide = () => {
    if (cur) {
      document.dispatchEvent(new CustomEvent('lovtrag:sakrij', { detail: { lovId: cur.lovId } }));
      document.dispatchEvent(new CustomEvent('arhiva:zatvorena', { detail: { lovId: cur.lovId } }));
    }
    photos.clearLayers();
    photos.remove();
    shots.clearLayers();
    shots.remove();
    cur = null;
    ctrl.hidden = true;
  };

  document.addEventListener('arhiva:na-karti', (e) => {
    const { lovId, naziv, slike = [], pogoci = [], fokus = null, live = false } = e.detail;
    if (cur && cur.lovId !== lovId) hide();
    cur = { lovId, naziv, slike, pogoci, live };
    showTrails = true;
    showPhotos = true;
    showShots = true;
    $('arh-karta-naziv').textContent = naziv || 'Lov';
    ctrl.hidden = false;
    drawPhotos();
    drawShots();
    sync();
    if (fokus) focusShot(fokus);
    document.dispatchEvent(new CustomEvent('lovtrag:arhiva', { detail: { lovId, fit: !fokus, live } }));
    // bez traga: karta ide na pogotke i slike lova (a na pogodak je već postavljena)
    const tacke = [...pogoci.map((s) => [s.lat, s.lon]), ...photosOnMap(slike).sa.map((s) => [s.lat, s.lon])];
    if (tacke.length && !fokus) setTimeout(() => { if (!document.querySelector('#lov-trag-legenda:not([hidden])')) map.fitBounds(tacke, { padding: [60, 60], maxZoom: 16, animate: false }); }, 600);
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
    document.dispatchEvent(new CustomEvent(showTrails ? 'lovtrag:arhiva' : 'lovtrag:sakrij', { detail: { lovId: cur.lovId, fit: false, live: cur.live } }));
    sync();
  });
  $('btn-arh-slike').addEventListener('click', () => { if (cur) { showPhotos = !showPhotos; sync(); } });
  $('btn-arh-pogoci').addEventListener('click', () => { if (cur) { showShots = !showShots; sync(); } });
  $('btn-arh-karta-zatvori').addEventListener('click', hide);
  registerBackHandler(() => {
    // dok je otvoren neki ekran (npr. arhiva), Nazad zatvara njega, ne lov na karti
    if (ctrl.hidden || document.querySelector('.list-preko:not([hidden])')) return false;
    hide();
    return true;
  });
}
