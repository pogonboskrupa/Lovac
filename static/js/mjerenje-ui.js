// Alat za mjerenje na karti: dodir ili nišan dodaje tačku; udaljenost, površina u ha, nagib.

import { pathLength, polygonAreaM2, formatArea, slopeBetween, formatSlope } from './mjerenje.js';
import { formatDistance } from './trag.js';
import { terrainAt } from './dem.js';
import { connectionQuality } from './net.js';
import { registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);
const STYLE = { color: '#d9a441', weight: 3, dashArray: '6 6', interactive: false, fillOpacity: 0.15 };

export function initMjerenje(L, map) {
  const panel = $('mjerenje');
  const layer = L.layerGroup();
  let points = [];
  let mode = 'duzina';
  let active = false;

  const elevations = new Map();
  const elevation = async (p) => {
    const key = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
    if (!elevations.has(key)) {
      try {
        const t = await terrainAt(p.lat, p.lon, { allowNetwork: connectionQuality() !== 'nema' });
        elevations.set(key, t ? t.visina : null);
      } catch {
        elevations.set(key, null);
      }
    }
    return elevations.get(key);
  };

  const render = async () => {
    layer.clearLayers();
    const ll = points.map((p) => [p.lat, p.lon]);
    if (mode === 'povrsina' && points.length >= 3) L.polygon(ll, STYLE).addTo(layer);
    else if (points.length >= 2) L.polyline(ll, STYLE).addTo(layer);
    for (const p of points) L.circleMarker([p.lat, p.lon], { radius: 5, color: '#fff', weight: 2, fillColor: '#d9a441', fillOpacity: 1, interactive: false }).addTo(layer);
    $('mj-tacke').textContent = String(points.length);
    if (mode === 'povrsina') {
      $('mj-rezultat').textContent = points.length >= 3
        ? `Površina ${formatArea(polygonAreaM2(points))} · obim ${formatDistance(pathLength([...points, points[0]]))}`
        : 'Dodaj bar 3 tačke';
    } else {
      $('mj-rezultat').textContent = points.length >= 2 ? `Udaljenost ${formatDistance(pathLength(points))}` : 'Dodaj bar 2 tačke';
    }
    const nagib = $('mj-nagib');
    nagib.textContent = '';
    if (points.length >= 2) {
      const a = points[points.length - 2];
      const b = points[points.length - 1];
      const s = slopeBetween({ ...a, visina: await elevation(a) }, { ...b, visina: await elevation(b) });
      nagib.textContent = s ? `Nagib zadnjeg dijela: ${formatSlope(s)}` : 'Nagib: nema podataka o terenu (potreban internet za prvo preuzimanje)';
    }
  };

  const add = (lat, lon) => { points.push({ lat, lon }); render(); };
  const onClick = (e) => { if (active) add(e.latlng.lat, e.latlng.lng); };

  const start = () => {
    $('meni-dodaj').hidden = true;
    active = true;
    points = [];
    layer.addTo(map);
    map.on('click', onClick);
    panel.hidden = false;
    render();
  };
  const stop = () => {
    active = false;
    map.off('click', onClick);
    map.removeLayer(layer);
    layer.clearLayers();
    panel.hidden = true;
  };

  $('btn-mjerenje').addEventListener('click', start);
  $('btn-mj-kraj').addEventListener('click', stop);
  $('btn-mj-nisan').addEventListener('click', () => { const c = map.getCenter(); add(c.lat, c.lng); });
  $('btn-mj-ponisti').addEventListener('click', () => { points.pop(); render(); });
  $('mj-nacin').addEventListener('click', (e) => {
    const b = e.target.closest('[data-nacin]');
    if (!b) return;
    mode = b.dataset.nacin;
    $('mj-nacin').querySelectorAll('[data-nacin]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  });
  registerBackHandler(() => {
    if (!active) return false;
    stop();
    return true;
  });
}
