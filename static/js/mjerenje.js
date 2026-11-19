// Mjerenje: dužina, površina (ha) i nagib između dvije tačke (visine iz DEM-a).

import { haversine } from './trag.js';

const R = 6378137; // isti poluprečnik kao turf.area
const RAD = Math.PI / 180;

export function pathLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

// Sferna površina prstena (Chamberlain & Duquette), kao turf.area.
export function polygonAreaM2(points) {
  if (points.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = points[(i + 2) % points.length];
    total += (p3.lon * RAD - p1.lon * RAD) * Math.sin(p2.lat * RAD);
  }
  return Math.abs((total * R * R) / 2);
}

const dec = (n, d) => n.toFixed(d).replace('.', ',');

export function formatArea(m2) {
  const ha = m2 / 10000;
  return ha >= 1 ? `${dec(ha, 2)} ha` : `${Math.round(m2)} m² (${dec(ha, 2)} ha)`;
}

export function slopeBetween(a, b) {
  if (!Number.isFinite(a.visina) || !Number.isFinite(b.visina)) return null;
  const d = haversine(a, b);
  if (d < 1) return null;
  const dz = b.visina - a.visina;
  return { udaljenost: d, razlika: dz, procenat: (dz / d) * 100, stepeni: Math.atan2(dz, d) / RAD };
}

export function formatSlope(s) {
  return `${Math.round(Math.abs(s.procenat))} % (${Math.round(Math.abs(s.stepeni))}°) ${s.razlika >= 0 ? 'uspon' : 'pad'}`;
}
