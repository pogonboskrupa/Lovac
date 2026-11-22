// "Preuzmi područje za offline": pločice izabrane podloge + DEM za vidljivo područje karte.

import { BASE_LAYERS, PREDOWNLOAD_ALLOWED, MAX_PREDOWNLOAD_TILES, tilesForBounds, estimateDownload, tileUrl, predownloadTiles } from './tiles.js';
import { predownloadDem } from './dem.js';
import { toast, escapeHtml, wireTwoTap } from './ui.js';
import { loadJSON, saveSoft } from './storage.js';
import { PODRUCJA_KEY, addArea, removeArea, coveringArea, areaTitle, areaDetail, areasSummary, newAreaId } from './podrucja.js';

const $ = (id) => document.getElementById(id);

export function planDownload(bounds, zoomNow, zoomMax) {
  const zMin = Math.max(8, Math.min(Math.floor(zoomNow), zoomMax));
  return { zMin, zMax: zoomMax, tiles: tilesForBounds(bounds, zMin, zoomMax) };
}

export function initPreuzimanje(map, activeBase, L = globalThis.L) {
  let ctrl = null;
  let areas = loadJSON(PODRUCJA_KEY, []);
  let showCoverage = loadJSON('lovac.pred.prikaz', false) === true;
  const coverage = L ? L.layerGroup() : null;

  const drawCoverage = () => {
    coverage?.clearLayers();
    if (!coverage) return;
    if (!showCoverage) { map.removeLayer(coverage); return; }
    if (!map.hasLayer(coverage)) coverage.addTo(map);
    for (const a of areas) {
      L.rectangle([[a.bounds.south, a.bounds.west], [a.bounds.north, a.bounds.east]], { color: a.base === 'satelit' ? '#7c3aed' : '#2563eb', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false }).addTo(coverage);
    }
  };

  const renderAreas = () => {
    const sum = areasSummary(areas);
    $('podrucja-broj').textContent = sum.broj ? `(${sum.broj} · ${sum.plocica} pločica)` : '';
    $('podrucja-prazno').hidden = areas.length > 0;
    $('btn-podrucja-pokrivenost').setAttribute('aria-checked', String(showCoverage));
    $('podrucja-spisak').innerHTML = areas.map((a) => `<li class="trag-red tr-kartica" data-id="${escapeHtml(a.id)}">
      <div class="trag-naslov"><b>${escapeHtml(areaTitle(a))}</b><span class="sitno">${escapeHtml(areaDetail(a))}</span></div>
      <div class="red-dugmadi"><button type="button" class="dugme" data-akcija="na-karti">Na karti</button><button type="button" class="dugme" data-akcija="ukloni">Ukloni sa spiska</button></div></li>`).join('');
    $('podrucja-spisak').querySelectorAll('[data-akcija="ukloni"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', () => {
        areas = removeArea(areas, b.closest('[data-id]').dataset.id);
        saveSoft(PODRUCJA_KEY, areas);
        renderAreas();
        drawCoverage();
      });
    });
  };
  $('podrucja-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="na-karti"]');
    const a = b && areas.find((x) => x.id === b.closest('[data-id]').dataset.id);
    if (!a) return;
    $('karte').hidden = true;
    map.fitBounds([[a.bounds.south, a.bounds.west], [a.bounds.north, a.bounds.east]], { padding: [20, 20] });
  });
  $('btn-podrucja-pokrivenost').addEventListener('click', () => {
    showCoverage = !showCoverage;
    saveSoft('lovac.pred.prikaz', showCoverage);
    renderAreas();
    drawCoverage();
  });
  renderAreas();
  drawCoverage();

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
    const have = coveringArea(areas, base, boundsNow(), plan.zMax);
    $('pred-procjena').textContent = tooMany
      ? `Područje je preveliko: ${e.plocica} pločica (najviše ${MAX_PREDOWNLOAD_TILES}). Približi kartu ili smanji detalje.`
      : `Vidljivo područje, zoom ${plan.zMin}–${plan.zMax}: ${e.plocica} pločica (${e.velicina}).${have ? ` Ovo područje je već preuzeto ${areaDetail(have).split(' · ').pop()}` : ''}`;
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
    if (!aborted) {
      const area = { id: newAreaId(base.id, bounds, plan.zMax), base: base.id, bounds, zMin: plan.zMin, zMax: plan.zMax, plocica: res.done - res.errors, gresaka: res.errors, t: Date.now() };
      areas = addArea(areas, area);
      saveSoft(PODRUCJA_KEY, areas);
      renderAreas();
      drawCoverage();
    }
    toast(aborted ? 'Preuzimanje prekinuto' : `Područje preuzeto (${res.done - res.errors} pločica${res.errors ? `, ${res.errors} grešaka` : ''})`);
    document.dispatchEvent(new CustomEvent('karte:otvorene'));
  });
  $('btn-pred-prekini').addEventListener('click', () => ctrl?.abort());
}
