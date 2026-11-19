// Pločice sa keširanjem u Cache API: bez interneta se prikazuju već viđene.
// Mrežno preuzimanje ima ograničen broj istovremenih zahtjeva, jer spori serveri
// (OpenTopoMap) i slab signal inače ugase sve zahtjeve odjednom.

import { fetchWithTimeout, connectionQuality } from './net.js';

export const TILE_CACHE = 'plocice-v1';
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
  const cache = await getTileCache();
  return cache ? (await cache.keys()).length : 0;
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

export async function loadTileBlob(url, signal) {
  const cache = await getTileCache();
  const hit = cache && await cache.match(url);
  if (hit) return hit.blob();
  return tileLimiter.run(async () => {
    const q = connectionQuality();
    const timeout = q === 'nema' ? 3000 : q === 'slaba' ? 15000 : 8000;
    const res = await fetchWithTimeout(url, { mode: 'cors', credentials: 'omit', signal }, timeout);
    if (!isImageResponse(res)) throw new Error(`Pločica nije slika (${res.status})`);
    if (cache) {
      try {
        await cache.put(url, res.clone());
        await trimTileCache(cache);
      } catch (err) { console.warn('tile cache put', err); }
    }
    return res.blob();
  }, signal);
}

export function createCachedTileLayer(L, urlTemplate, options) {
  const Layer = L.TileLayer.extend({
    createTile(coords, done) {
      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('role', 'presentation');
      const ctrl = new AbortController();
      img._ctrl = ctrl;
      loadTileBlob(this.getTileUrl(coords), ctrl.signal)
        .then((blob) => {
          const objUrl = URL.createObjectURL(blob);
          img._blobUrl = objUrl;
          img.onload = () => done(null, img);
          img.onerror = () => done(new Error('Pločica se ne može prikazati'), img);
          img.src = objUrl;
        })
        .catch((err) => {
          // Prekinuta pločica više nije na karti, pa se ne prijavljuje Leaflet-u.
          if (!ctrl.signal.aborted) done(err, img);
        });
      return img;
    },
  });
  const layer = new Layer(urlTemplate, options);
  // Blob URL se oslobađa tek kad Leaflet ukloni pločicu, ne na onload.
  layer.on('tileunload', (e) => {
    const t = e.tile;
    t?._ctrl?.abort();
    if (t?._blobUrl) {
      URL.revokeObjectURL(t._blobUrl);
      t._blobUrl = null;
    }
  });
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
