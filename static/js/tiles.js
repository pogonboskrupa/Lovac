// Pločice sa keširanjem u Cache API: bez interneta se prikazuju već viđene.
// Mrežno preuzimanje ima ograničen broj istovremenih zahtjeva, jer spori serveri
// (OpenTopoMap) i slab signal inače ugase sve zahtjeve odjednom.

import { fetchWithTimeout, connectionQuality } from './net.js';

export const TILE_CACHE = 'plocice-v1';
// Pločice PREUZETIH područja su u posebnom kešu koji se nikad sam ne skraćuje: u zajedničkom kešu sa gornjom
// granicom prve se brišu najstarije, a to su upravo preuzeta područja, pa ih je lovac morao preuzimati ponovo.
export const OFFLINE_CACHE = 'plocice-offline-v1';
export const MAX_CACHED_TILES = 20000;
export const MAX_PARALLEL_TILES = 6;
const TRIM_EVERY = 200;

// 200 koji nije slika (npr. XML greška servera) ne smije u keš kao pločica.
export function isImageResponse(res) {
  if (!res || !res.ok) return false;
  const ct = (res.headers?.get?.('content-type') || '').toLowerCase();
  return ct.startsWith('image/');
}

function abortError() {
  return new DOMException('Prekinuto', 'AbortError');
}

// Red čekanja sa ograničenjem. Najnovije traženo ide prvo (LIFO): nakon pomjeranja
// karte lovac čeka pločice koje vidi, ne one koje je ostavio iza sebe.
export function createLimiter(max) {
  let active = 0;
  const waiting = [];
  const pump = () => {
    while (active < max && waiting.length) {
      const job = waiting.pop();
      active++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => {
        active--;
        pump();
      });
    }
  };
  return {
    run(task, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(abortError()); return; }
        const job = { task, resolve, reject };
        waiting.push(job);
        signal?.addEventListener('abort', () => {
          const i = waiting.indexOf(job);
          if (i >= 0) { waiting.splice(i, 1); reject(abortError()); }
        }, { once: true });
        pump();
      });
    },
  };
}

const tileLimiter = createLimiter(MAX_PARALLEL_TILES);

let cachePromise = null;
function getTileCache() {
  if (!globalThis.caches) return Promise.resolve(null);
  if (!cachePromise) {
    cachePromise = caches.open(TILE_CACHE).then(
      (c) => c,
      () => { cachePromise = null; return null; },
    );
  }
  return cachePromise;
}

let offlinePromise = null;
function getOfflineCache() {
  if (!globalThis.caches) return Promise.resolve(null);
  if (!offlinePromise) {
    offlinePromise = caches.open(OFFLINE_CACHE).then(
      (c) => c,
      () => { offlinePromise = null; return null; },
    );
  }
  return offlinePromise;
}

export function keysToTrim(keys, max) {
  return keys.length > max ? keys.slice(0, keys.length - max) : [];
}

let putsSinceTrim = 0;
async function trimTileCache(cache) {
  if (++putsSinceTrim < TRIM_EVERY) return;
  putsSinceTrim = 0;
  const keys = await cache.keys();
  for (const k of keysToTrim(keys, MAX_CACHED_TILES)) await cache.delete(k);
}

export async function tileCacheCount() {
  const [cache, offline] = await Promise.all([getTileCache(), getOfflineCache()]);
  return (cache ? (await cache.keys()).length : 0) + (offline ? (await offline.keys()).length : 0);
}

export async function offlineTileCount() {
  const offline = await getOfflineCache();
  return offline ? (await offline.keys()).length : 0;
}

// Uklanjanje preuzetog područja briše samo njegove pločice koje ne koristi nijedno drugo preuzeto područje.
export async function releaseOfflineTiles(urls) {
  const offline = await getOfflineCache();
  if (!offline) return 0;
  let n = 0;
  for (const u of urls) if (await offline.delete(u)) n++;
  return n;
}

export async function clearTileCache() {
  cachePromise = null;
  try {
    return globalThis.caches ? await caches.delete(TILE_CACHE) : false;
  } catch (err) {
    console.warn('clearTileCache', err);
    return false;
  }
}

// Rok jednog pokušaja: sporija veza traži duži rok, a svaki ponovni pokušaj ga produžava (veza od ~1 KB/s ne stigne za 8 s).
export function tileTimeoutMs(quality, attempt = 0) {
  const base = quality === 'nema' ? 3000 : quality === 'slaba' ? 20000 : 12000;
  return Math.round(base * (1 + attempt * 0.5));
}

// Nedavno viđene pločice u memoriji: zum naprijed-nazad ne čeka Cache API (nekoliko ms po pločici je dovoljno za crni bljesak).
export const MEM_TILES_MAX = 400;
const memTiles = new Map();
export function memTilesGet(url) {
  const b = memTiles.get(url);
  if (b) { memTiles.delete(url); memTiles.set(url, b); }
  return b;
}
export function memTilesPut(url, blob, max = MEM_TILES_MAX) {
  memTiles.delete(url);
  memTiles.set(url, blob);
  while (memTiles.size > max) memTiles.delete(memTiles.keys().next().value);
}

async function networkTile(url, signal, attempt) {
  return tileLimiter.run(async () => {
    const timeout = tileTimeoutMs(connectionQuality(), attempt);
    const res = await fetchWithTimeout(url, { mode: 'cors', credentials: 'omit', signal }, timeout);
    if (!isImageResponse(res)) throw new Error(`Pločica nije slika (${res.status})`);
    return res;
  }, signal);
}

export async function loadTileBlob(url, signal, attempt = 0) {
  const mem = memTilesGet(url);
  if (mem) return mem;
  const [offline, cache] = await Promise.all([getOfflineCache(), getTileCache()]);
  const hit = (offline && await offline.match(url)) || (cache && await cache.match(url));
  if (hit) { const b = await hit.blob(); memTilesPut(url, b); return b; }
  const res = await networkTile(url, signal, attempt);
  if (cache) {
    try {
      await cache.put(url, res.clone());
      await trimTileCache(cache);
    } catch (err) { console.warn('tile cache put', err); }
  }
  const blob = await res.blob();
  memTilesPut(url, blob);
  return blob;
}

export const TILE_RETRY_DELAYS = [1500, 4000, 9000];

function sleepAbortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

// Neuspjela pločica se pokušava ponovo (Leaflet sam ne ponavlja, pa dio karte ostane crn). Prekid (pločica je napustila
// ekran) staje odmah; poslije zadnjeg pokušaja baca zadnju grešku.
export async function loadTileWithRetry(url, signal, { load = loadTileBlob, delays = TILE_RETRY_DELAYS, sleep = sleepAbortable } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await load(url, signal, attempt);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
      if (attempt < delays.length) await sleep(delays[attempt], signal);
    }
  }
  throw lastErr;
}

// Slika iz blob-a se crta na canvas; blob URL postoji samo dok se slika dekodira (rezerva kad nema createImageBitmap).
export async function drawBlobOnCanvas(blob, canvas) {
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(blob);
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    bmp.close?.();
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Pločica se ne može prikazati'));
      i.src = url;
    });
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }
}

let failedTiles = 0;
let lastFailureNotice = 0;

export function createCachedTileLayer(L, urlTemplate, options) {
  const Layer = L.TileLayer.extend({
    // Pločica je <canvas>, ne <img> sa blob URL-om: WebView odbaci dekodiranu sliku iz memorije (ili blob URL
    // nestane) pa pločica ostane crna; piksele u canvasu drži sama stranica.
    createTile(coords, done) {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('role', 'presentation');
      const ctrl = new AbortController();
      canvas._ctrl = ctrl;
      loadTileWithRetry(this.getTileUrl(coords), ctrl.signal)
        .then(async (blob) => {
          await drawBlobOnCanvas(blob, canvas);
          if (!ctrl.signal.aborted) done(null, canvas);
        })
        .catch((err) => {
          // Prekinuta pločica više nije na karti, pa se ne prijavljuje Leaflet-u.
          if (ctrl.signal.aborted) return;
          done(err, canvas);
          // Mnogo pločica koje se ne učitaju ni poslije ponavljanja: jednom u minuti javi lovcu zašto je karta prazna.
          failedTiles += 1;
          if (failedTiles >= 4 && Date.now() - lastFailureNotice > 60000) {
            lastFailureNotice = Date.now();
            failedTiles = 0;
            globalThis.document?.dispatchEvent(new CustomEvent('plocice:greska'));
          }
        });
      return canvas;
    },
  });
  // Dok traje zum ne učitavaju se međunivoi (stari nivo ostaje vidljiv umjesto crnih rupa), a više pločica oko vidljivog dijela ostaje u DOM-u.
  const layer = new Layer(urlTemplate, { updateWhenZooming: false, keepBuffer: 4, ...options });
  layer.on('tileunload', (e) => e.tile?._ctrl?.abort());
  layer.on('tileabort', (e) => e.tile?._ctrl?.abort());
  return layer;
}

export const BASE_LAYERS = [
  {
    id: 'topo',
    naziv: 'Topografska',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { subdomains: 'abc', maxNativeZoom: 17, maxZoom: 19,
      attribution: '© OpenStreetMap, SRTM | © OpenTopoMap (CC-BY-SA)' },
  },
  {
    id: 'satelit',
    naziv: 'Satelit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxNativeZoom: 18, maxZoom: 19, attribution: '© Esri, Maxar, Earthstar Geographics' },
  },
  {
    id: 'osm',
    naziv: 'OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxNativeZoom: 19, maxZoom: 19, attribution: '© OpenStreetMap' },
  },
];

// ---------------- Preuzimanje područja za offline ----------------
// OSM-ova pravila zabranjuju masovno preuzimanje sa tile.openstreetmap.org; OpenTopoMap traži umjerenost.
export const PREDOWNLOAD_ALLOWED = ['topo', 'satelit'];
export const MAX_PREDOWNLOAD_TILES = 2500;
const AVG_TILE_KB = 25;

function lonToX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function tilesForBounds(b, zMin, zMax) {
  const out = [];
  for (let z = zMin; z <= zMax; z++) {
    const x0 = lonToX(b.west, z);
    const x1 = lonToX(b.east, z);
    const y0 = latToY(b.north, z);
    const y1 = latToY(b.south, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

export function estimateDownload(n) {
  return { plocica: n, velicina: `~${Math.max(1, Math.round((n * AVG_TILE_KB) / 1024))} MB` };
}

export function tileUrl(template, { z, x, y }, subdomains = 'abc') {
  const s = subdomains[(x + y) % subdomains.length] || 'a';
  return template.replace('{s}', s).replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

// Preuzima pločice u trajni keš preuzetih područja (preskače već preuzete; viđenu pločicu samo prepiše
// iz običnog keša). onProgress(urađeno, ukupno, greške).
export async function predownloadTiles(urls, { onProgress = () => {}, signal } = {}) {
  let done = 0;
  let errors = 0;
  const [offline, cache] = await Promise.all([getOfflineCache(), getTileCache()]);
  await Promise.all(urls.map(async (url) => {
    try {
      if (signal?.aborted) return;
      if (offline && await offline.match(url)) return;
      const seen = cache && await cache.match(url);
      const res = seen || await networkTile(url, signal, 0);
      if (offline) await offline.put(url, res);
      else await loadTileBlob(url, signal);
    } catch (err) {
      if (err?.name !== 'AbortError') errors++;
    } finally {
      done++;
      onProgress(done, urls.length, errors);
    }
  }));
  return { done, errors };
}

// Područja preuzeta prije v0.9.5 su u običnom kešu: prepiši njihove pločice (one koje još postoje) u trajni.
export async function adoptOfflineTiles(urls) {
  const [offline, cache] = await Promise.all([getOfflineCache(), getTileCache()]);
  if (!offline || !cache) return 0;
  let n = 0;
  for (const url of urls) {
    if (await offline.match(url)) continue;
    const hit = await cache.match(url);
    if (hit) { await offline.put(url, hit); n++; }
  }
  return n;
}
