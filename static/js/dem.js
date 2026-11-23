// Nadmorska visina i nagib iz Terrarium DEM pločica (keširaju se u Cache API, rade offline).
// GPS visina je iznad elipsoida (~45 m previše), pa je samo rezerva.

import { fetchWithTimeout } from './net.js';

export const DEM_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
export const DEM_CACHE = 'dem-v1';
export const DEM_ZOOM = 13;

export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

export function tilePixel(lat, lon, z) {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const φ = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(φ) + 1 / Math.cos(φ)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: Math.floor((fx - x) * 256), py: Math.floor((fy - y) * 256) };
}

// dzdx: rast visine prema istoku; dzdy: rast prema jugu (y piksela raste nadolje).
export function uphillAspect(dzdx, dzdy) {
  if (Math.hypot(dzdx, dzdy) < 1e-6) return null;
  return ((Math.atan2(dzdx, -dzdy) * 180) / Math.PI + 360) % 360;
}

const decoded = new Map();

async function tileBlob(url, allowNetwork) {
  const cache = globalThis.caches ? await caches.open(DEM_CACHE) : null;
  const hit = cache && await cache.match(url);
  if (hit) return hit.blob();
  if (!allowNetwork) return null;
  const res = await fetchWithTimeout(url, { mode: 'cors', credentials: 'omit' }, 10000);
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) throw new Error(`DEM ${res.status}`);
  if (cache) await cache.put(url, res.clone());
  return res.blob();
}

async function tilePixels(z, x, y, allowNetwork) {
  const key = `${z}/${x}/${y}`;
  if (decoded.has(key)) return decoded.get(key);
  const blob = await tileBlob(DEM_URL(z, x, y), allowNetwork);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('DEM pločica se ne može dekodirati'));
      i.src = url;
    });
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, 256, 256).data;
    if (decoded.size > 16) decoded.delete(decoded.keys().next().value);
    decoded.set(key, data);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sample(data, px, py) {
  const x = Math.min(255, Math.max(0, px));
  const y = Math.min(255, Math.max(0, py));
  const i = (y * 256 + x) * 4;
  return decodeTerrarium(data[i], data[i + 1], data[i + 2]);
}

// { visina, uzbrdo } ili null kad pločica nije dostupna (offline i nije keširana).
export async function terrainAt(lat, lon, { allowNetwork = true } = {}) {
  const t = tilePixel(lat, lon, DEM_ZOOM);
  const data = await tilePixels(DEM_ZOOM, t.x, t.y, allowNetwork);
  if (!data) return null;
  const k = 3;
  const dzdx = (sample(data, t.px + k, t.py) - sample(data, t.px - k, t.py)) / (2 * k);
  const dzdy = (sample(data, t.px, t.py + k) - sample(data, t.px, t.py - k)) / (2 * k);
  return { visina: sample(data, t.px, t.py), uzbrdo: uphillAspect(dzdx, dzdy) };
}

// RGBA piksli DEM pločice zoom 13 (za sloj nagiba); null kad nije keširana, a mreža nije dozvoljena.
export function demTileRgba(x, y, allowNetwork = true) {
  return tilePixels(DEM_ZOOM, x, y, allowNetwork);
}

// DEM pločice za područje (za N.V., nagib i termiku bez interneta).
export async function predownloadDem(bounds, signal) {
  const z = DEM_ZOOM;
  const a = tilePixel(bounds.north, bounds.west, z);
  const b = tilePixel(bounds.south, bounds.east, z);
  let n = 0;
  for (let x = a.x; x <= b.x; x++) {
    for (let y = a.y; y <= b.y; y++) {
      if (signal?.aborted) return n;
      try { await tileBlob(DEM_URL(z, x, y), true); n++; } catch (err) { console.warn('DEM', err.message); }
    }
  }
  return n;
}
