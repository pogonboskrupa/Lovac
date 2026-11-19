// Karta: podloge, mjerilo, sjever i traka koordinata centra karte.

import { BASE_LAYERS, createCachedTileLayer } from './tiles.js';
import { formatWgs84, formatGk, scaleRatio, formatScale } from './geo.js';
import { loadJSON, saveSoft } from './storage.js';
import { toast, copyText, wireMenu } from './ui.js';

const VIEW_KEY = 'lovac.pogled';
const LAYER_KEY = 'lovac.podloga';
const DEFAULT_VIEW = { lat: 44.88, lon: 16.15, z: 11 };

export function initMap(L, elementId) {
  const view = loadJSON(VIEW_KEY, DEFAULT_VIEW);
  const map = L.map(elementId, {
    zoomControl: false,
    attributionControl: true,
    preferCanvas: false,
  }).setView([view.lat, view.lon], view.z);

  const layers = new Map(BASE_LAYERS.map((b) => [b.id, createCachedTileLayer(L, b.url, b.options)]));
  let activeId = null;
  const setBase = (id) => {
    if (!layers.has(id)) id = BASE_LAYERS[0].id;
    if (activeId) map.removeLayer(layers.get(activeId));
    layers.get(id).addTo(map);
    activeId = id;
    saveSoft(LAYER_KEY, id);
    document.querySelectorAll('[data-podloga]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.podloga === id));
    });
  };
  setBase(loadJSON(LAYER_KEY, BASE_LAYERS[0].id));

  map.on('zoomend', () => updateCoordBar(map));
  map.on('moveend', () => {
    const c = map.getCenter();
    saveSoft(VIEW_KEY, { lat: c.lat, lon: c.lng, z: map.getZoom() });
    updateCoordBar(map);
  });
  updateCoordBar(map);
  wireMapControls(map, setBase);
  return { map, setBase, activeBase: () => activeId };
}

export function updateCoordBar(map) {
  const c = map.getCenter();
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const gk = formatGk(c.lat, c.lng);
  set('koord-wgs', formatWgs84(c.lat, c.lng));
  set('koord-zona', gk.oznaka);
  set('koord-gk', gk.tekst);
  set('koord-razmjer', formatScale(scaleRatio(c.lat, map.getZoom())));
  set('zoom-nivo', String(Math.round(map.getZoom())));
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
  document.getElementById('btn-zoom-in')?.addEventListener('click', () => map.zoomIn());
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => map.zoomOut());
  document.getElementById('koord-traka')?.addEventListener('click', async () => {
    const c = map.getCenter();
    const gk = formatGk(c.lat, c.lng);
    const text = `${gk.oznaka} ${gk.tekst} | WGS84 ${formatWgs84(c.lat, c.lng)}`;
    toast(await copyText(text) ? 'Koordinate kopirane' : text);
  });
}
