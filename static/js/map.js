// Karta: podloge, mjerilo, sjever i traka koordinata centra karte.

import { BASE_LAYERS, createCachedTileLayer } from './tiles.js';
import { COORD_MODES, nextCoordMode, formatCoordMode } from './geo.js';
import { loadJSON, saveSoft } from './storage.js';
import { wireMenu, toast } from './ui.js';

const VIEW_KEY = 'lovac.pogled';
const LAYER_KEY = 'lovac.podloga';
const COORD_KEY = 'lovac.koord';
let coordMode = 'wgs';

export const getCoordMode = () => coordMode;
const DEFAULT_VIEW = { lat: 44.88, lon: 16.15, z: 11 };

// Podloge na mapi: Topo, Satelit i Teren (karta društva sa servera, MBTiles koji se preuzme u aplikaciji).
export const BASE_CHOICES = ['topo', 'satelit', 'teren'];

// Teren bez preuzetog fajla se ne može prikazati; staro sačuvano (npr. OSM) pada na Topo.
export function resolveBase(id, { terenReady }) {
  if (id === 'teren') return terenReady ? 'teren' : 'topo';
  return BASE_CHOICES.includes(id) && id !== 'teren' ? id : 'topo';
}

export function initMap(L, elementId) {
  // pločice koje se ne učitaju ni poslije ponavljanja (spora veza ili server karte): lovac treba znati zašto je karta crna
  document.addEventListener('plocice:greska', () => toast('Dio karte se nije učitao: veza je slaba ili server karte ne odgovara. Preuzmi područje za rad bez interneta (Meni → Karte i offline).', 6000));
  const savedMode = loadJSON(COORD_KEY, 'wgs');
  coordMode = COORD_MODES.includes(savedMode) ? savedMode : 'wgs';
  const view = loadJSON(VIEW_KEY, DEFAULT_VIEW);
  const map = L.map(elementId, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: false,
  }).setView([view.lat, view.lon], view.z);

  const layers = new Map(BASE_LAYERS.map((b) => [b.id, createCachedTileLayer(L, b.url, b.options)]));
  let activeId = null;
  let activeLayer = null;
  let terenProvider = null; // () => L.TileLayer | null, registruje karte-ui kad je teren preuzet

  // persist/explicit: izbor lovca se pamti, a pokušaj bez preuzetog terena javlja događaj da se ponudi preuzimanje.
  const setBase = (id, { persist = true, explicit = true } = {}) => {
    const terenLayer = terenProvider?.() || null;
    const target = resolveBase(id, { terenReady: Boolean(terenLayer) });
    if (explicit && id === 'teren' && target !== 'teren') document.dispatchEvent(new CustomEvent('teren:trazen'));
    if (target !== activeId) {
      if (activeLayer) map.removeLayer(activeLayer);
      activeLayer = target === 'teren' ? terenLayer : layers.get(target);
      activeLayer.addTo(map);
      activeId = target;
    }
    if (persist && target === id) saveSoft(LAYER_KEY, id);
    document.querySelectorAll('[data-podloga]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.podloga === target));
    });
  };
  setBase(loadJSON(LAYER_KEY, 'topo'), { persist: false, explicit: false });

  // Teren stiže kasnije (fajl se čita/preuzima): primijeni sačuvani izbor, a ako je uklonjen vrati Topo.
  const registerTeren = (provider) => {
    terenProvider = provider;
    const saved = loadJSON(LAYER_KEY, 'topo');
    if (activeId === 'teren' && !provider()) setBase('topo', { persist: false, explicit: false });
    else if (saved === 'teren' && activeId !== 'teren') setBase('teren', { persist: false, explicit: false });
  };

  map.on('zoomend', () => updateCoordBar(map));
  map.on('moveend', () => {
    const c = map.getCenter();
    saveSoft(VIEW_KEY, { lat: c.lat, lon: c.lng, z: map.getZoom() });
    updateCoordBar(map);
  });
  updateCoordBar(map);
  wireMapControls(map, setBase);
  return { map, setBase, activeBase: () => activeId, registerTeren };
}

export function updateCoordBar(map) {
  const c = map.getCenter();
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const f = formatCoordMode(coordMode, c.lat, c.lng);
  set('koord-zona', f.oznaka);
  set('koord-gk', f.tekst);
}

function wireMapControls(map, setBase) {
  const menu = document.getElementById('meni-podloga');
  wireMenu('btn-podloga', 'meni-podloga');
  menu?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-podloga]');
    if (!btn) return;
    setBase(btn.dataset.podloga);
    menu.hidden = true;
  });
  // Dodir na kartu zatvara plutajuće ploče (podloge, "+").
  map.on('click', () => {
    for (const id of ['meni-podloga', 'meni-dodaj']) { const m = document.getElementById(id); if (m) m.hidden = true; }
  });
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => map.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => map.zoomOut());
  // Dodir na okvir mijenja sistem: WGS84 → MGI 5 → MGI 6 → WGS84. Kopiranje je u "Moja lokacija".
  document.getElementById('koord-traka')?.addEventListener('click', () => {
    coordMode = nextCoordMode(coordMode);
    saveSoft(COORD_KEY, coordMode);
    updateCoordBar(map);
  });
}
