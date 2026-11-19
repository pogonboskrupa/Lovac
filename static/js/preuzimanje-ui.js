// "Preuzmi područje za offline": pločice izabrane podloge + DEM za vidljivo područje karte.

import { BASE_LAYERS, PREDOWNLOAD_ALLOWED, MAX_PREDOWNLOAD_TILES, tilesForBounds, estimateDownload, tileUrl, predownloadTiles } from './tiles.js';
import { predownloadDem } from './dem.js';
import { toast } from './ui.js';

const $ = (id) => document.getElementById(id);

export function planDownload(bounds, zoomNow, zoomMax) {
  const zMin = Math.max(8, Math.min(Math.floor(zoomNow), zoomMax));
  return { zMin, zMax: zoomMax, tiles: tilesForBounds(bounds, zMin, zoomMax) };
}

export function initPreuzimanje(map, activeBase) {
  let ctrl = null;
  const boundsNow = () => {
    const b = map.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  };

  const refresh = () => {
    const base = activeBase();
    const btn = $('btn-pred-preuzmi');
    if (!PREDOWNLOAD_ALLOWED.includes(base)) {
      $('pred-procjena').textContent = 'Za OSM podlogu preuzimanje nije dozvoljeno (pravila OSM servera). Izaberi topografsku ili satelit.';
      btn.disabled = true;
      return;
    }
    const plan = planDownload(boundsNow(), map.getZoom(), Number($('pred-zoom').value));
    const e = estimateDownload(plan.tiles.length);
    const tooMany = plan.tiles.length > MAX_PREDOWNLOAD_TILES;
    $('pred-procjena').textContent = tooMany
      ? `Područje je preveliko: ${e.plocica} pločica (najviše ${MAX_PREDOWNLOAD_TILES}). Približi kartu ili smanji detalje.`
      : `Vidljivo područje, zoom ${plan.zMin}–${plan.zMax}: ${e.plocica} pločica (${e.velicina}).`;
    btn.disabled = tooMany;
  };

  $('pred-zoom').addEventListener('change', refresh);
  map.on('moveend zoomend', () => { if (!$('karte').hidden) refresh(); });
  document.addEventListener('karte:otvorene', refresh);

  $('btn-pred-preuzmi').addEventListener('click', async () => {
    const base = BASE_LAYERS.find((b) => b.id === activeBase());
    const bounds = boundsNow();
    const plan = planDownload(bounds, map.getZoom(), Number($('pred-zoom').value));
    if (plan.tiles.length > MAX_PREDOWNLOAD_TILES) return;
    const urls = plan.tiles.map((t) => tileUrl(base.url, t, base.options.subdomains));
    ctrl = new AbortController();
    const bar = $('pred-napredak');
    bar.hidden = false;
    bar.value = 0;
    $('btn-pred-prekini').hidden = false;
    $('btn-pred-preuzmi').disabled = true;
    const res = await predownloadTiles(urls, {
      signal: ctrl.signal,
      onProgress: (d, n, err) => { bar.value = Math.round((d / n) * 100); $('pred-procjena').textContent = `Preuzeto ${d} / ${n}${err ? ` (greške: ${err})` : ''}`; },
    });
    if (!ctrl.signal.aborted) await predownloadDem(bounds, ctrl.signal);
    const aborted = ctrl.signal.aborted;
    ctrl = null;
    $('btn-pred-prekini').hidden = true;
    $('btn-pred-preuzmi').disabled = false;
    bar.hidden = true;
    toast(aborted ? 'Preuzimanje prekinuto' : `Područje preuzeto (${res.done - res.errors} pločica${res.errors ? `, ${res.errors} grešaka` : ''})`);
    document.dispatchEvent(new CustomEvent('karte:otvorene'));
  });
  $('btn-pred-prekini').addEventListener('click', () => ctrl?.abort());
}
