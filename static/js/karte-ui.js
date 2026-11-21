// Offline karte (MBTiles / RMaps SQLiteDB) sa telefona: uvoz, prikaz iznad podloge, uklanjanje.
// Pločice servira native strana (WebViewAssetLoader /mbtiles/...), fajl se nikad ne učitava cijeli.

import { loadJSON, saveSoft } from './storage.js';
import { toast, escapeHtml, wireTwoTap } from './ui.js';

const ON_KEY = 'lovac.karte.prikazane';
const $ = (id) => document.getElementById(id);

export function mbtilesUrl(id) {
  return `https://appassets.androidplatform.net/mbtiles/${encodeURIComponent(id)}/{z}/{x}/{y}`;
}

// "lijevo,dole,desno,gore" (MBTiles) -> Leaflet bounds ili null.
export function parseBounds(s) {
  const p = String(s ?? '').split(',').map(Number);
  if (p.length !== 4 || !p.every(Number.isFinite)) return null;
  return [[p[1], p[0]], [p[3], p[2]]];
}

// Ispod najnižeg nivoa u fajlu sloj se ne prikazuje (inače stotine čitanja odjednom zamrznu telefon).
export function layerOptions(info) {
  const b = parseBounds(info.bounds);
  return {
    minZoom: info.minzoom,
    minNativeZoom: info.minzoom,
    maxNativeZoom: info.maxzoom,
    maxZoom: 19,
    zIndex: 5,
    ...(b ? { bounds: b } : {}),
  };
}

const mb = (n) => `${Math.round(n / 1048576)} MB`;

// ---- Teren: karta društva sa servera (MBTiles u GitHub Release-u "karte"), preuzima se u aplikaciji ----
export const TEREN_FILE = 'teren.mbtiles';
export const TEREN_TAG = 'karte';

export function terenUrl(repo) {
  return `https://github.com/${repo}/releases/download/${TEREN_TAG}/${TEREN_FILE}`;
}

export function splitMaps(list) {
  return { teren: list.find((m) => m.id === TEREN_FILE) || null, ostale: list.filter((m) => m.id !== TEREN_FILE) };
}

export function terenStatus(hasBridge, info) {
  if (!hasBridge) return { stanje: 'bez-aplikacije', tekst: 'Teren radi u aplikaciji na telefonu (preuzima se jednom, pa radi bez interneta).' };
  if (!info) return { stanje: 'nema', tekst: 'Teren nije preuzet. Preuzmi ga dok imaš dobar internet.' };
  return { stanje: 'preuzet', tekst: `Teren je na telefonu: ${mb(info.velicina || 0)}, zoom ${info.minzoom}–${info.maxzoom}.` };
}

export function initKarte(L, map, registerTeren, repo) {
  const bridge = globalThis.AndroidKarte;
  const layers = new Map();
  const listEl = $('karte-spisak');
  let terenInfo = null;
  let terenLayer = null;
  let transfer = null; // 'teren' | 'uvoz' — šta se trenutno kopira (za tekst napretka)

  const renderTeren = () => {
    const st = terenStatus(Boolean(bridge), terenInfo);
    $('teren-status').textContent = st.tekst;
    $('teren-status').dataset.stanje = st.stanje;
    $('btn-teren-preuzmi').hidden = st.stanje === 'bez-aplikacije';
    $('btn-teren-preuzmi').textContent = st.stanje === 'preuzet' ? 'Preuzmi ponovo (ažuriraj)' : 'Preuzmi teren';
    $('btn-teren-ukloni').hidden = st.stanje !== 'preuzet';
  };

  // Provajder za podlogu "Teren": isti sloj se koristi dok je fajl isti.
  const provider = () => {
    if (!terenInfo) return null;
    if (!terenLayer) {
      terenLayer = L.tileLayer(mbtilesUrl(TEREN_FILE), { ...layerOptions(terenInfo), zIndex: 1 });
    }
    return terenLayer;
  };
  registerTeren?.(provider);
  renderTeren();

  // Izbor "Teren" na mapi bez preuzetog fajla: objasni i vodi na preuzimanje.
  document.addEventListener('teren:trazen', () => {
    if (!bridge) { toast('Teren radi u aplikaciji na telefonu'); return; }
    toast('Teren još nije preuzet — preuzmi ga u Karte i offline');
    document.dispatchEvent(new CustomEvent('karte:otvori'));
  });

  if (!bridge) {
    $('karte-podrska').textContent = 'Uvoz offline karte (MBTiles/SQLiteDB) radi u aplikaciji na telefonu.';
    $('btn-karte-uvoz').hidden = true;
    return;
  }

  const shownIds = () => new Set(loadJSON(ON_KEY, []));
  const setShown = (id, on) => {
    const s = shownIds();
    if (on) s.add(id); else s.delete(id);
    saveSoft(ON_KEY, [...s]);
  };

  const sync = (maps) => {
    const on = shownIds();
    for (const [id, l] of layers) if (!on.has(id) || !maps.some((m) => m.id === id)) { map.removeLayer(l); layers.delete(id); }
    for (const m of maps) {
      if (on.has(m.id) && !layers.has(m.id)) layers.set(m.id, L.tileLayer(mbtilesUrl(m.id), layerOptions(m)).addTo(map));
    }
  };

  const render = () => {
    let all = [];
    try { all = JSON.parse(bridge.spisak()); } catch (err) { console.error('karte', err); }
    const { teren, ostale: maps } = splitMaps(all);
    const changed = JSON.stringify(teren) !== JSON.stringify(terenInfo);
    terenInfo = teren;
    if (changed) { terenLayer = null; registerTeren?.(provider); }
    renderTeren();
    const on = shownIds();
    listEl.innerHTML = maps.map((m) => `
      <li class="trag-red" data-id="${escapeHtml(m.id)}">
        <div class="trag-naslov"><b>${escapeHtml(m.naziv)}</b>
        <span class="sitno">${escapeHtml(m.format)} · zoom ${m.minzoom}–${m.maxzoom} · ${mb(m.velicina || 0)}</span></div>
        <div class="red-dugmadi">
          <label class="red-check"><input type="checkbox" data-akcija="prikazi" ${on.has(m.id) ? 'checked' : ''}> Prikaži na karti</label>
          <button type="button" class="dugme" data-akcija="pogled">Idi na kartu</button>
          <button type="button" class="dugme" data-akcija="ukloni">Ukloni</button>
        </div>
      </li>`).join('') || '<li class="sitno">Nema drugih offline karata na telefonu.</li>';
    listEl.querySelectorAll('[data-akcija="ukloni"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        const id = b.closest('[data-id]').dataset.id;
        setShown(id, false);
        bridge.ukloni(id);
        render();
      });
    });
    sync(maps);
    return maps;
  };

  listEl.addEventListener('change', (e) => {
    if (e.target.dataset.akcija !== 'prikazi') return;
    setShown(e.target.closest('[data-id]').dataset.id, e.target.checked);
    render();
  });
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="pogled"]');
    if (!b) return;
    const m = render().find((x) => x.id === b.closest('[data-id]').dataset.id);
    const bounds = parseBounds(m?.bounds);
    $('karte').hidden = true;
    if (bounds) map.fitBounds(bounds);
    if (m && map.getZoom() < m.minzoom) map.setZoom(m.minzoom);
  });
  $('btn-karte-uvoz').addEventListener('click', () => { transfer = 'uvoz'; bridge.uvezi(); });

  $('btn-teren-preuzmi').addEventListener('click', () => {
    transfer = 'teren';
    $('karte-status').textContent = 'Preuzimam teren… 0 %';
    bridge.preuzmi(terenUrl(repo), TEREN_FILE);
  });
  wireTwoTap($('btn-teren-ukloni'), 'Dodirni ponovo za uklanjanje', () => {
    bridge.ukloni(TEREN_FILE);
    render();
    toast('Teren uklonjen sa telefona');
  });

  globalThis.__karteNapredak = (pct) => {
    $('karte-status').textContent = transfer === 'teren' ? `Preuzimam teren… ${pct} %` : `Kopiram kartu na telefon… ${pct} %`;
  };
  globalThis.__karteGreska = (msg) => { $('karte-status').textContent = msg; };
  globalThis.__karteUvoz = (json) => {
    const m = JSON.parse(json);
    $('karte-status').textContent = '';
    if (m.id === TEREN_FILE) {
      render();
      document.querySelector('[data-podloga="teren"]')?.click();
      toast(`Teren je preuzet (zoom ${m.minzoom}–${m.maxzoom}) i radi bez interneta`);
      return;
    }
    setShown(m.id, true);
    render();
    toast(`Offline karta "${m.naziv}" je spremna (zoom ${m.minzoom}–${m.maxzoom})`);
  };
  document.addEventListener('karte:otvorene', render);
  render();
}

// CI emulator test: lista karata i jedna pločica kroz native handler.
export async function runKarteAutotest() {
  const maps = JSON.parse(globalThis.AndroidKarte?.spisak() || '[]');
  console.info(`KARTE_SPISAK ${maps.length} ${maps.map((m) => `${m.id}:${m.minzoom}-${m.maxzoom}`).join(',')}`);
  const m = maps[0];
  if (!m) return;
  const res = await fetch(mbtilesUrl(m.id).replace('{z}', '12').replace('{x}', '2231').replace('{y}', '1475'));
  const buf = await res.arrayBuffer();
  console.info(`KARTE_PLOCICA ${res.status} ${res.headers.get('content-type')} ${buf.byteLength}`);
}
