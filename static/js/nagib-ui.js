// Sloj "Nagib terena" u Granicama lovišta: boji dijelove strmije od praga (zadano 30°) iz Terrarium DEM pločica.
// Radi bez interneta za područja čije su DEM pločice preuzete (Karte i offline → Preuzmi područje).
import { demTileRgba } from './dem.js';
import { connectionQuality } from './net.js';
import { loadJSON, saveSoft } from './storage.js';
import { toast } from './ui.js';
import {
  NAGIB_PRAGOVI, NAGIB_MIN_ZOOM, NAGIB_KLASE, DEM_Z, normalizeSlopeSettings, slopeGrid, slopeClass, demRegion,
  cellSizeM, tileCenterLat, elevationsFromRgba, legendRows,
} from './nagib.js';

const KEY = 'lovac.nagib';
const PANE = 'nagib';
const $ = (id) => document.getElementById(id);

export function initNagib(L, map) {
  if (!$('nagib-kartica')) return;
  map.createPane(PANE);
  const pane = map.getPane(PANE);
  pane.style.zIndex = 300; // iznad podloge, ispod granica, tragova i markera
  pane.style.pointerEvents = 'none';

  let settings = normalizeSlopeSettings(loadJSON(KEY, null));
  let missing = 0;

  const slopes = new Map();
  const pending = new Map();
  const loadSlope = (x, y) => {
    const key = `${x}/${y}`;
    if (slopes.has(key)) { const v = slopes.get(key); slopes.delete(key); slopes.set(key, v); return Promise.resolve(v); }
    if (pending.has(key)) return pending.get(key);
    const p = demTileRgba(x, y, connectionQuality() !== 'nema')
      .then((rgba) => {
        if (!rgba) return null;
        const grid = slopeGrid(elevationsFromRgba(rgba), cellSizeM(tileCenterLat(y)));
        slopes.set(key, grid);
        while (slopes.size > 24) slopes.delete(slopes.keys().next().value);
        return grid;
      })
      .catch((err) => { console.warn('nagib', err.message); return null; })
      .finally(() => pending.delete(key));
    pending.set(key, p);
    return p;
  };

  const paint = (canvas, grid, region, z) => {
    const sw = region.sw;
    const small = document.createElement('canvas');
    small.width = sw;
    small.height = sw;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(sw, sw);
    let any = false;
    for (let y = 0; y < sw; y++) {
      for (let x = 0; x < sw; x++) {
        const cls = slopeClass(grid[(region.sy + y) * 256 + region.sx + x], settings.prag);
        if (!cls) continue;
        any = true;
        const c = NAGIB_KLASE[cls];
        const o = (y * sw + x) * 4;
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3];
      }
    }
    if (!any) return;
    sctx.putImageData(img, 0, 0);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = z > DEM_Z; // pri većem zumu ćelije od ~14 m se ublaže umjesto da budu kocke
    ctx.drawImage(small, 0, 0, sw, sw, 0, 0, 256, 256);
  };

  const NagibLayer = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = L.DomUtil.create('canvas', 'leaflet-tile');
      canvas.width = 256;
      canvas.height = 256;
      const region = demRegion(coords.z, coords.x, coords.y);
      loadSlope(region.dx, region.dy).then((grid) => {
        if (grid) paint(canvas, grid, region, coords.z); else { missing++; renderStatus(); }
        done(null, canvas);
      }).catch(() => done(null, canvas));
      return canvas;
    },
  });
  const layer = new NagibLayer({ pane: PANE, minZoom: NAGIB_MIN_ZOOM, tileSize: 256, keepBuffer: 1, updateWhenIdle: true });

  function renderStatus() {
    const st = $('nagib-status');
    if (!settings.on) { st.textContent = 'Isključeno'; return; }
    if (map.getZoom() < NAGIB_MIN_ZOOM) { st.textContent = 'Uvećaj kartu (razmjera 1:50 000 i bliže) da se nagib vidi'; return; }
    st.textContent = missing
      ? `Uključeno (≥ ${settings.prag}°). Za dio karte nema podataka o terenu — preuzmi područje uz internet.`
      : `Uključeno: boji se teren strmiji od ${settings.prag}°`;
  }

  const renderControls = () => {
    $('btn-nagib-prikazi').setAttribute('aria-checked', String(settings.on));
    $('nagib-prag').innerHTML = NAGIB_PRAGOVI.map((p) => `<button type="button" data-prag="${p}" aria-pressed="${settings.prag === p}">${p}°</button>`).join('');
    $('nagib-legenda').innerHTML = legendRows(settings.prag).map((r) => `<span class="nagib-stavka"><i style="background:${r.boja}"></i>${r.do == null ? `${r.od}° i više` : `${r.od}–${r.do}°`}</span>`).join('');
    renderStatus();
  };

  const apply = () => {
    if (settings.on && !map.hasLayer(layer)) layer.addTo(map);
    else if (!settings.on && map.hasLayer(layer)) map.removeLayer(layer);
    saveSoft(KEY, settings);
    renderControls();
  };

  $('btn-nagib-prikazi').addEventListener('click', () => {
    settings = { ...settings, on: !settings.on };
    missing = 0;
    apply();
    if (settings.on && map.getZoom() < NAGIB_MIN_ZOOM) toast('Nagib se vidi kad uvećaš kartu (razmjera 1:50 000 i bliže)');
  });
  $('nagib-prag').addEventListener('click', (e) => {
    const b = e.target.closest('[data-prag]');
    if (!b) return;
    settings = { ...settings, prag: Number(b.dataset.prag) };
    missing = 0;
    saveSoft(KEY, settings);
    if (map.hasLayer(layer)) layer.redraw();
    renderControls();
  });
  map.on('zoomend', renderStatus);
  apply();
}
