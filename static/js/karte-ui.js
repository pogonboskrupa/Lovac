// Offline karte (MBTiles / RMaps SQLiteDB) sa telefona: uvoz, prikaz iznad podloge, uklanjanje.
// Pločice servira native strana (WebViewAssetLoader /mbtiles/...), fajl se nikad ne učitava cijeli.

import { loadJSON, saveSoft } from './storage.js';
import { toast, escapeHtml, wireTwoTap } from './ui.js';
import { tileCacheCount } from './tiles.js';
import { offlineHero, offlineAdvice } from './pregled-karata.js';

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

// Kad je Teren podloga, karta ne smije otići ispod najnižeg nivoa fajla ni van njegovih granica (tamo je prazna, crna).
// Vraća šta treba uraditi: { minZoom, zoom (ili null), fit (granice ili null) }.
export function terenView(info, zoom, center) {
  const minZoom = Number(info?.minzoom) || 0;
  const b = parseBounds(info?.bounds);
  const inside = !b || !center || (center.lat >= b[0][0] && center.lat <= b[1][0] && center.lng >= b[0][1] && center.lng <= b[1][1]);
  return { minZoom, zoom: zoom < minZoom ? minZoom : null, fit: inside ? null : b };
}

export function terenStatus(hasBridge, info) {
  if (!hasBridge) return { stanje: 'bez-aplikacije', tekst: 'Teren radi u aplikaciji na telefonu (preuzima se jednom, pa radi bez interneta).' };
  if (!info) return { stanje: 'nema', tekst: 'Teren nije preuzet. Preuzmi ga dok imaš dobar internet.' };
  return { stanje: 'preuzet', tekst: `Teren je na telefonu: ${mb(info.velicina || 0)}, zoom ${info.minzoom}–${info.maxzoom}.` };
}

async function renderHero(state) {
  try {
    const tiles = await tileCacheCount().catch(() => 0);
    const items = offlineHero({ tiles, ...state });
    for (const it of items) { const el = $(`karte-hero-${it.id}`); if (el) el.textContent = it.v; }
    const a = offlineAdvice({ tiles, ...state });
    $('karte-savjet').textContent = a.tekst;
    $('karte-savjet').dataset.stanje = a.stanje;
  } catch (err) { console.warn('hero karte', err); }
}

export function initKarte(L, map, registerTeren, repo) {
  const bridge = globalThis.AndroidKarte;
  const layers = new Map();
  const listEl = $('karte-spisak');
  let terenInfo = null;
  let terenLayer = null;
  let armedDownload = null; // prvi dodir na preuzimanje traži potvrdu (veliki fajl)
  let transfer = null; // 'teren' | 'uvoz' — šta se trenutno kopira (za tekst napretka)

  const renderTeren = () => {
    const st = terenStatus(Boolean(bridge), terenInfo);
    $('teren-status').textContent = st.tekst;
    $('teren-status').dataset.stanje = st.stanje;
    $('btn-teren-preuzmi').hidden = st.stanje === 'bez-aplikacije';
    if (transfer !== 'teren' && !armedDownload) $('btn-teren-preuzmi').textContent = st.stanje === 'preuzet' ? 'Preuzmi ponovo (ažuriraj)' : 'Preuzmi offline kartu';
    $('btn-teren-ukloni').hidden = st.stanje !== 'preuzet' || transfer === 'teren';
    $('teren-kartica').dataset.stanje = st.stanje;
  };

  // Provajder za podlogu "Teren": isti sloj se koristi dok je fajl isti.
  const provider = () => {
    if (!terenInfo) return null;
    if (!terenLayer) {
      terenLayer = L.tileLayer(mbtilesUrl(TEREN_FILE), { ...layerOptions(terenInfo), zIndex: 1 });
      terenLayer.on('add', () => {
        const v = terenView(terenInfo, map.getZoom(), map.getCenter());
        map.setMinZoom(v.minZoom);
        if (v.fit) map.fitBounds(v.fit, { animate: false });
        else if (v.zoom != null) map.setZoom(v.zoom, { animate: false });
      });
      terenLayer.on('remove', () => map.setMinZoom(0));
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

  let maps = [];
  const hero = () => renderHero({ terenInfo, maps, hasBridge: Boolean(bridge) });
  document.addEventListener('karte:otvorene', hero);
  hero();

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
    const split = splitMaps(all);
    const teren = split.teren;
    maps = split.ostale;
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
    hero();
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
  // Samo jedan prenos odjednom: dva paralelna preuzimanja bi pisala u isti privremeni fajl.
  const setBusy = (kind) => {
    transfer = kind;
    $('btn-teren-preuzmi').disabled = kind === 'teren';
    $('btn-karte-uvoz').disabled = kind === 'teren';
    $('teren-napredak').hidden = kind !== 'teren';
    if (kind === 'teren') { $('btn-teren-preuzmi').textContent = 'Preuzimam…'; $('teren-napredak').value = 0; }
    renderTeren();
  };
  // Uvoz se ne zaključava: ako lovac odustane od izbora fajla, aplikacija ne dobije nikakav odgovor.
  $('btn-karte-uvoz').addEventListener('click', () => {
    if (transfer === 'teren') return;
    transfer = 'uvoz';
    bridge.uvezi();
  });

  // Veliki fajl: prvi dodir upozori na veličinu (mobilni podaci), drugi pokreće preuzimanje.
  $('btn-teren-preuzmi').addEventListener('click', () => {
    if (transfer === 'teren') return;
    const b = $('btn-teren-preuzmi');
    if (!armedDownload) {
      b.textContent = 'Veliki fajl (stotine MB) — dodirni ponovo';
      armedDownload = setTimeout(() => { armedDownload = null; renderTeren(); }, 4000);
      return;
    }
    clearTimeout(armedDownload);
    armedDownload = null;
    setBusy('teren');
    $('teren-preuzimanje').textContent = 'Preuzimam teren… 0 %';
    bridge.preuzmi(terenUrl(repo), TEREN_FILE);
  });
  wireTwoTap($('btn-teren-ukloni'), 'Dodirni ponovo za uklanjanje', () => {
    bridge.ukloni(TEREN_FILE);
    render();
    toast('Teren uklonjen sa telefona');
  });

  globalThis.__karteNapredak = (pct) => {
    if (transfer === 'teren') {
      $('teren-preuzimanje').textContent = `Preuzimam teren… ${pct} %`;
      delete $('teren-preuzimanje').dataset.greska;
      $('teren-napredak').value = Number(pct) || 0;
    } else {
      $('karte-status').textContent = `Kopiram kartu na telefon… ${pct} %`;
    }
  };
  globalThis.__karteGreska = (msg) => {
    const el = $(transfer === 'teren' ? 'teren-preuzimanje' : 'karte-status');
    el.textContent = msg;
    el.dataset.greska = '1';
    setBusy(null);
  };
  globalThis.__karteUvoz = (json) => {
    const m = JSON.parse(json);
    $('karte-status').textContent = '';
    $('teren-preuzimanje').textContent = '';
    setBusy(null);
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
