// Pregled tragova (čista logika): sličica oblika rute, brojke po tragu, grupisanje po mjesecima, period, sortiranje i
// stupci zadnjih 7 dana. Ne dira DOM.

import { trackDistance, movingTime } from './trag.js';

const MJESECI_NAZIV = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Juni', 'Juli', 'August', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
const DAY_MS = 86400000;

// Oblik rute kao SVG putanja u okviru w×h (lon se skalira sa cos(lat), pa oblik odgovara stvarnom). Najviše `maxPts` tačaka.
export function routePath(points, w = 96, h = 64, pad = 6, maxPts = 60) {
  const pts = (points || []).filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  if (pts.length < 2) return '';
  const step = Math.max(1, Math.ceil(pts.length / maxPts));
  const sample = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const k = Math.cos((sample[0].lat * Math.PI) / 180);
  const xs = sample.map((p) => p.lon * k);
  const ys = sample.map((p) => -p.lat);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const scale = Math.min(w - 2 * pad, h - 2 * pad) / span;
  const offX = (w - (maxX - minX) * scale) / 2;
  const offY = (h - (maxY - minY) * scale) / 2;
  return sample.map((_, i) => `${i ? 'L' : 'M'}${(offX + (xs[i] - minX) * scale).toFixed(1)},${(offY + (ys[i] - minY) * scale).toFixed(1)}`).join(' ');
}

export function trackStats(t) {
  const m = trackDistance(t.tacke || []);
  const ms = movingTime(t);
  return {
    metara: m,
    trajanjeMs: ms,
    brzinaKmh: ms > 0 ? Math.round((m / 1000 / (ms / 3600000)) * 10) / 10 : null,
    tacaka: (t.tacke || []).length,
    poi: (t.tackeInteresa || []).length,
  };
}

export const PERIODI = [['sve', 'Sve'], ['godina', 'Ova godina'], ['mjesec', '30 dana'], ['sedmica', '7 dana']];

export function filterPeriod(tracks, period, now = Date.now()) {
  if (period === 'sedmica') return tracks.filter((t) => now - t.start <= 7 * DAY_MS);
  if (period === 'mjesec') return tracks.filter((t) => now - t.start <= 30 * DAY_MS);
  if (period === 'godina') return tracks.filter((t) => new Date(t.start).getFullYear() === new Date(now).getFullYear());
  return tracks;
}

export const SORTIRANJA = [['novije', 'Najnovije'], ['duze', 'Najduže'], ['trajanje', 'Najdugotrajnije']];

export function sortTracks(tracks, mode) {
  const dist = (t) => trackDistance(t.tacke || []);
  const key = { duze: dist, trajanje: (t) => movingTime(t) }[mode] || ((t) => t.start);
  return [...tracks].sort((a, b) => key(b) - key(a));
}

// Grupe po mjesecu za najnovije prvo; za druge sortove jedna grupa bez naslova.
export function groupByMonth(tracks) {
  const out = [];
  for (const t of tracks) {
    const d = new Date(t.start);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = out[out.length - 1];
    if (!g || g.kljuc !== key) { g = { kljuc: key, naziv: `${MJESECI_NAZIV[d.getMonth()]} ${d.getFullYear()}.`, tracks: [] }; out.push(g); }
    g.tracks.push(t);
  }
  return out;
}

// Kilometri po danu za zadnjih 7 dana (najstariji prvi, zadnji = danas).
export function lastDaysKm(tracks, now = Date.now(), days = 7) {
  const end = new Date(now); end.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = end.getTime() - i * DAY_MS;
    const m = tracks.filter((t) => t.start >= from && t.start < from + DAY_MS).reduce((s, t) => s + trackDistance(t.tacke || []), 0);
    out.push({ dan: new Date(from).getDay(), km: Math.round(m / 100) / 10 });
  }
  return out;
}
