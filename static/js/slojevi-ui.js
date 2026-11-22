// Slojevi na karti: uvoz fajla, stil po sloju, "Sa servera" (objavio admin), objava društvu (admin).
// Slojevi se čuvaju u IndexedDB i rade offline.

import { layersSummary, layerSource } from './pregled-karata.js';
import { importFiles, bboxOf, countFeatures } from './slojevi.js';
import { idbPut, idbAll, idbDelete, idbGet } from './db.js';
import { getClient, cachedProfile } from './auth.js';
import { uuid } from './zapisi.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const STORE = 'slojevi';
const PANE = 'slojevi';
const DEFAULT_STIL = { boja: '#ff7a00', debljina: 3, popuna: false, vidljiv: true };
const $ = (id) => document.getElementById(id);

// Server: lista bez geojson-a (može biti više MB); kolone postoje od migracije 005.
const LIST_COLUMNS = 'id,naziv,opis,verzija,aktivno,promijenjeno';

export function initSlojevi(L, map) {
  map.createPane(PANE);
  map.getPane(PANE).style.zIndex = 350; // ispod tragova i markera
  const renderer = L.svg({ pane: PANE });
  let rendererOn = false;
  const drawn = new Map();
  const panel = $('slojevi');

  const styleFor = (stil) => (f) => {
    const ks = f.properties?._stil;
    return {
      pane: PANE,
      renderer,
      color: stil.boja || ks?.line?.color || DEFAULT_STIL.boja,
      weight: stil.debljina || ks?.weight || DEFAULT_STIL.debljina,
      fillColor: stil.boja || ks?.fill?.color || DEFAULT_STIL.boja,
      fillOpacity: stil.popuna ? 0.18 : 0,
    };
  };

  const draw = async () => {
    for (const l of drawn.values()) map.removeLayer(l);
    drawn.clear();
    const layers = (await idbAll(STORE)).filter((s) => s.stil?.vidljiv !== false);
    // Prazan SVG renderer se uklanja (Leaflet ga sam nikad ne ukloni).
    if (layers.length && !rendererOn) { renderer.addTo(map); rendererOn = true; }
    if (!layers.length && rendererOn) { map.removeLayer(renderer); rendererOn = false; }
    for (const s of layers) {
      const stil = { ...DEFAULT_STIL, ...s.stil };
      const gl = L.geoJSON(s.geojson, {
        style: styleFor(stil),
        pointToLayer: (f, ll) => L.circleMarker(ll, { pane: PANE, renderer, radius: 5, color: '#fff', weight: 1, fillColor: stil.boja, fillOpacity: 0.95 }),
        onEachFeature: (f, layer) => {
          const n = f.properties?.name;
          if (n) layer.bindPopup(`<b>${escapeHtml(n)}</b><br><span class="sitno">${escapeHtml(s.naziv)}</span>`);
        },
      }).addTo(map);
      gl.getLayers().forEach((l) => l.getElement?.()?.classList.add('sloj-oblik'));
      drawn.set(s.id, gl);
    }
  };

  const updateStil = async (id, patch) => {
    const s = await idbGet(STORE, id);
    await idbPut(STORE, { ...s, stil: { ...DEFAULT_STIL, ...s.stil, ...patch } });
    await draw();
  };

  const render = async () => {
    const isAdmin = Boolean(cachedProfile()?.is_admin);
    const layers = (await idbAll(STORE)).sort((a, b) => String(a.naziv).localeCompare(String(b.naziv), 'bs'));
    $('slojevi-prazno').hidden = layers.length > 0;
    $('slojevi-sve').hidden = layers.length < 2;
    const sum = layersSummary(layers, countFeatures);
    $('sl-hero-broj').textContent = String(sum.broj);
    $('sl-hero-prikazanih').textContent = String(sum.prikazanih);
    $('sl-hero-elemenata').textContent = String(sum.elemenata);
    $('slojevi-spisak').innerHTML = layers.map((s) => {
      const st = { ...DEFAULT_STIL, ...s.stil };
      return `<li class="trag-red tr-kartica" data-id="${escapeHtml(s.id)}">
        <div class="trag-naslov"><b><span class="sloj-boja" style="background:${escapeHtml(st.boja)}"></span>${escapeHtml(s.naziv)}</b>
        <span class="sitno">${countFeatures(s.geojson)} elemenata · ${escapeHtml(layerSource(s))}</span></div>
        <div class="red-dugmadi">
          <label class="red-check"><input type="checkbox" data-akcija="vidljiv" ${st.vidljiv ? 'checked' : ''}> Prikaži</label>
          <label class="red-check"><input type="checkbox" data-akcija="popuna" ${st.popuna ? 'checked' : ''}> Popuna</label>
          <input type="color" class="boja" data-akcija="boja" value="${escapeHtml(st.boja)}" aria-label="Boja sloja">
          <select data-akcija="debljina" aria-label="Debljina linije">${[2, 3, 5].map((d) => `<option value="${d}" ${d === st.debljina ? 'selected' : ''}>linija ${d}</option>`).join('')}</select>
        </div>
        <div class="red-dugmadi">
          <button type="button" class="dugme" data-akcija="prikazi">Na karti</button>
          ${isAdmin && s.izvor !== 'server' ? '<button type="button" class="dugme" data-akcija="objavi">Objavi društvu</button>' : ''}
          <button type="button" class="dugme" data-akcija="obrisi">Ukloni sa telefona</button>
        </div>
      </li>`;
    }).join('');
    $('slojevi-spisak').querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        await idbDelete(STORE, b.closest('[data-id]').dataset.id);
        await draw();
        await render();
      });
    });
  };

  $('slojevi-spisak').addEventListener('change', async (e) => {
    const t = e.target;
    const id = t.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (t.dataset.akcija === 'vidljiv') await updateStil(id, { vidljiv: t.checked });
    if (t.dataset.akcija === 'popuna') await updateStil(id, { popuna: t.checked });
    if (t.dataset.akcija === 'boja') await updateStil(id, { boja: t.value });
    if (t.dataset.akcija === 'debljina') await updateStil(id, { debljina: Number(t.value) });
  });
  $('slojevi-spisak').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-akcija]');
    if (!b || b.dataset.akcija === 'obrisi') return;
    const s = await idbGet(STORE, b.closest('[data-id]').dataset.id);
    if (b.dataset.akcija === 'prikazi') {
      const [w, so, ea, n] = bboxOf(s.geojson);
      if (Number.isFinite(w)) { panel.hidden = true; map.fitBounds([[so, w], [n, ea]], { padding: [30, 30] }); }
    }
    if (b.dataset.akcija === 'objavi') {
      const sb = getClient();
      if (!sb) { toast('Server nije podešen'); return; }
      $('slojevi-status').textContent = 'Objavljujem…';
      const { data, error } = await sb.from(STORE).insert({ naziv: s.naziv, geojson: s.geojson, stil: s.stil || {} }).select('*');
      if (error) { $('slojevi-status').textContent = `Server odbio: ${error.message}`; return; }
      const row = data?.[0];
      await idbDelete(STORE, s.id);
      await idbPut(STORE, { ...s, id: `srv-${row.id}`, izvor: 'server', server_id: row.id, verzija: row.verzija });
      $('slojevi-status').textContent = '';
      toast('Sloj objavljen društvu');
      await render();
    }
  });

  const setAll = async (vidljiv) => {
    for (const s of await idbAll(STORE)) await idbPut(STORE, { ...s, stil: { ...DEFAULT_STIL, ...s.stil, vidljiv } });
    await draw();
    await render();
  };
  $('btn-slojevi-prikazi-sve').addEventListener('click', () => setAll(true));
  $('btn-slojevi-sakrij-sve').addEventListener('click', () => setAll(false));

  $('slojevi-uvoz').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    $('slojevi-status').textContent = 'Čitam fajl…';
    try {
      const { naziv, geojson } = await importFiles(files);
      if (!countFeatures(geojson)) throw new Error('U fajlu nema geometrije');
      await idbPut(STORE, { id: uuid(), naziv, geojson, stil: { ...DEFAULT_STIL }, izvor: 'fajl', uvezeno: Date.now() });
      $('slojevi-status').textContent = '';
      toast(`Uvezen sloj "${naziv}" (${countFeatures(geojson)} elemenata)`);
      await draw();
      await render();
    } catch (err) {
      $('slojevi-status').textContent = `Uvoz nije uspio: ${err.message}`;
    }
  });

  // ---- sa servera ----
  $('btn-slojevi-server').addEventListener('click', async () => {
    const sb = getClient();
    const box = $('slojevi-server');
    if (!sb) { box.innerHTML = '<p class="sitno">Server nije podešen.</p>'; return; }
    box.innerHTML = '<p class="sitno">Učitavam…</p>';
    const { data, error } = await sb.from(STORE).select(LIST_COLUMNS);
    if (error) { box.innerHTML = `<p class="status">Nema veze sa serverom (${escapeHtml(error.message)})</p>`; return; }
    const local = new Map((await idbAll(STORE)).filter((s) => s.server_id).map((s) => [s.server_id, s]));
    const rows = (data || []).filter((r) => r.aktivno !== false);
    box.innerHTML = rows.length ? rows.map((r) => {
      const have = local.get(r.id);
      const label = !have ? 'Preuzmi' : have.verzija < r.verzija ? `Ažuriraj (v${r.verzija})` : 'Preuzeto';
      return `<div class="trag-red" data-server="${escapeHtml(r.id)}"><b>${escapeHtml(r.naziv)}</b>
        ${r.opis ? `<span class="sitno">${escapeHtml(r.opis)}</span>` : ''}
        <button type="button" class="dugme" data-akcija="preuzmi" ${have && have.verzija >= r.verzija ? 'disabled' : ''}>${label}</button></div>`;
    }).join('') : '<p class="sitno">Administrator još nije objavio nijedan sloj.</p>';
  });
  $('slojevi-server').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-akcija="preuzmi"]');
    if (!b) return;
    const id = b.closest('[data-server]').dataset.server;
    b.disabled = true;
    b.textContent = 'Preuzimam…';
    const { data, error } = await getClient().from(STORE).select('*').eq('id', id).maybeSingle();
    if (error || !data) { b.disabled = false; b.textContent = 'Pokušaj ponovo'; toast('Preuzimanje nije uspjelo'); return; }
    const prev = await idbGet(STORE, `srv-${id}`);
    await idbPut(STORE, {
      id: `srv-${id}`, server_id: id, naziv: data.naziv, geojson: data.geojson, verzija: data.verzija, izvor: 'server',
      stil: { ...DEFAULT_STIL, ...data.stil, ...(prev?.stil || {}) }, preuzeto: Date.now(),
    });
    b.textContent = 'Preuzeto';
    toast(`Sloj "${data.naziv}" je na telefonu i radi bez interneta`);
    await draw();
    await render();
  });

  $('btn-slojevi').addEventListener('click', async () => {
    $('meni-spiskovi').hidden = true;
    await render();
    panel.hidden = false;
  });
  $('btn-slojevi-zatvori').addEventListener('click', () => { panel.hidden = true; });
  registerBackHandler(() => {
    if (panel.hidden) return false;
    panel.hidden = true;
    return true;
  });

  draw().catch((err) => console.error('slojevi', err));
}
