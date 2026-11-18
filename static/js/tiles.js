// Pločice sa keširanjem u Cache API: bez interneta se prikazuju već viđene.

import { fetchWithTimeout, connectionQuality } from './net.js';

export const TILE_CACHE = 'plocice-v1';

// 200 koji nije slika (npr. XML greška servera) ne smije u keš kao pločica.
export function isImageResponse(res) {
  if (!res || !res.ok) return false;
  const ct = (res.headers?.get?.('content-type') || '').toLowerCase();
  return ct.startsWith('image/');
}

async function openCache() {
  try {
    return globalThis.caches ? await caches.open(TILE_CACHE) : null;
  } catch {
    return null;
  }
}

export async function loadTileBlob(url) {
  const cache = await openCache();
  const hit = cache && await cache.match(url);
  if (hit) return hit.blob();
  const q = connectionQuality();
  const timeout = q === 'nema' ? 3000 : q === 'slaba' ? 15000 : 8000;
  const res = await fetchWithTimeout(url, { mode: 'cors', credentials: 'omit' }, timeout);
  if (!isImageResponse(res)) throw new Error(`Pločica nije slika (${res.status})`);
  if (cache) {
    try { await cache.put(url, res.clone()); } catch (err) { console.warn('tile cache put', err); }
  }
  return res.blob();
}

export function createCachedTileLayer(L, urlTemplate, options) {
  const Layer = L.TileLayer.extend({
    createTile(coords, done) {
      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('role', 'presentation');
      const url = this.getTileUrl(coords);
      loadTileBlob(url)
        .then((blob) => {
          const objUrl = URL.createObjectURL(blob);
          img._blobUrl = objUrl;
          img.onload = () => done(null, img);
          img.onerror = () => done(new Error('Pločica se ne može prikazati'), img);
          img.src = objUrl;
        })
        .catch((err) => done(err, img));
      return img;
    },
  });
  const layer = new Layer(urlTemplate, options);
  // Blob URL se oslobađa tek kad Leaflet ukloni pločicu, ne na onload.
  layer.on('tileunload', (e) => {
    const t = e.tile;
    if (t?._blobUrl) {
      URL.revokeObjectURL(t._blobUrl);
      t._blobUrl = null;
    }
  });
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
