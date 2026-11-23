// Prikaz na karti po razmjeri: slike, tragovi i tačke se crtaju tek kad je karta dovoljno uvećana
// (zadano do 1:12 500), da sitni markeri ne prekriju kartu pri pregledu cijelog lovišta. Lovac podešava u Postavkama.
import { loadJSON, saveSoft } from './storage.js';

export const PRIKAZ_KARTA_KEY = 'lovac.prikaz.karta';
export const RAZMJER_ZADANO = 12500;
export const RAZMJER_IZBORI = [5000, 12500, 25000, 50000, 0]; // 0 = uvijek
export const VRSTE_PRIKAZA = [['slike', 'Slike'], ['tragovi', 'Tragovi'], ['tacke', 'Tačke']];
// Leaflet ima cijele nivoe zuma: na našoj širini zoom 15 je ~1:12 800, pa granica ima 5 % tolerancije
// (inače bi "do 1:12 500" značilo tek zoom 16, 1:6 400).
const TOLERANCIJA = 1.05;

export function normalizeMapDisplay(v) {
  const s = v && typeof v === 'object' ? v : {};
  const razmjer = RAZMJER_IZBORI.includes(s.razmjer) ? s.razmjer : RAZMJER_ZADANO;
  const out = { razmjer };
  for (const [k] of VRSTE_PRIKAZA) out[k] = s[k] !== false;
  return out;
}

export const getMapDisplay = () => normalizeMapDisplay(loadJSON(PRIKAZ_KARTA_KEY, null));

export function setMapDisplay(patch) {
  const next = normalizeMapDisplay({ ...getMapDisplay(), ...patch });
  saveSoft(PRIKAZ_KARTA_KEY, next);
  document.dispatchEvent(new CustomEvent('prikaz:razmjer', { detail: next }));
  return next;
}

// Nezaokružen razmjer 1:N za 96 dpi (isto kao geo.js scaleRatio, bez zaokruživanja).
export function rawScale(lat, zoom) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom / 0.000264583;
}

export function detailVisible(kind, lat, zoom, settings = normalizeMapDisplay(null)) {
  const s = normalizeMapDisplay(settings);
  if (!s[kind] || !s.razmjer) return true;
  return rawScale(lat, zoom) <= s.razmjer * TOLERANCIJA;
}

export function scaleChoiceLabel(n) {
  return n ? `1:${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}` : 'Uvijek';
}

// Sloj koji se skida sa karte kad je razmjer veći od granice. `active()` može isključiti ograničenje
// (npr. gustina opažanja je pregled za cijelo lovište). Vraća funkciju za ponovnu provjeru.
export function gateLayer(map, layer, kind, active = () => true) {
  const sync = () => {
    const c = map.getCenter();
    const show = !active() || detailVisible(kind, c.lat, map.getZoom(), getMapDisplay());
    if (show && !map.hasLayer(layer)) layer.addTo(map);
    else if (!show && map.hasLayer(layer)) map.removeLayer(layer);
    return show;
  };
  map.on('zoomend', sync);
  document.addEventListener('prikaz:razmjer', sync);
  sync();
  return sync;
}

export function initMapDisplaySettings() {
  const box = document.getElementById('p-razmjer');
  const kinds = document.getElementById('p-razmjer-vrste');
  if (!box || !kinds) return;
  const render = () => {
    const s = getMapDisplay();
    box.innerHTML = RAZMJER_IZBORI.map((n) => `<button type="button" data-razmjer="${n}" aria-pressed="${s.razmjer === n}">${scaleChoiceLabel(n)}</button>`).join('');
    kinds.innerHTML = VRSTE_PRIKAZA.map(([k, naziv]) => `<button type="button" data-vrsta-prikaza="${k}" aria-pressed="${s[k]}">${naziv}</button>`).join('');
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-razmjer]');
    if (b) { setMapDisplay({ razmjer: Number(b.dataset.razmjer) }); render(); }
  });
  kinds.addEventListener('click', (e) => {
    const b = e.target.closest('[data-vrsta-prikaza]');
    if (b) { const k = b.dataset.vrstaPrikaza; setMapDisplay({ [k]: !getMapDisplay()[k] }); render(); }
  });
  render();
}
