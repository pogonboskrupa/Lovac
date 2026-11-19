// SIGURNOSNA geometrija zajedničkog lova: zabranjeni pravci pucanja za svaki stan.
// Ne zamjenjuje pravila lova ni vođu lova. Svaka funkcija je čista i testirana za svaki stepen.
//
// Luk {od, do} ide u smjeru kazaljke od "od" do "do" (stepeni od sjevera); granice su ZABRANJENE.
// {od: 0, do: 360} je puni krug.

import { haversine } from './trag.js';
import { bearing } from './geo.js';
import { destination } from './vjetar.js';

export const MIN_HALF_DEG = 10; // najmanja polovina širine sektora prema drugom stanu
export const LATERAL_BUFFER_M = 60; // bočna sigurnosna zona oko drugog stana
export const TOO_CLOSE_M = 50;
const EPS = 1e-9;

export function norm(a) {
  return ((a % 360) + 360) % 360;
}

const isFull = (arc) => arc.do - arc.od >= 360 - EPS;

export function arcContains(arc, deg) {
  if (isFull(arc)) return true;
  const len = norm(arc.do - arc.od);
  return norm(norm(deg) - arc.od) <= len + EPS;
}

// Luk -> linearni intervali na [0, 360].
function toIntervals(arc) {
  if (isFull(arc)) return [[0, 360]];
  const od = norm(arc.od);
  const doN = arc.do === 360 ? 360 : norm(arc.do);
  return od <= doN ? [[od, doN]] : [[od, 360], [0, doN]];
}

function fromIntervals(iv) {
  if (!iv.length) return [];
  if (iv.length === 1 && iv[0][0] <= EPS && iv[0][1] >= 360 - EPS) return [{ od: 0, do: 360 }];
  const out = iv.map(([a, b]) => ({ od: a, do: b }));
  // Interval na početku i na kraju kruga su isti luk preko sjevera.
  if (out.length > 1 && out[0].od <= EPS && out[out.length - 1].do >= 360 - EPS) {
    const first = out.shift();
    const last = out.pop();
    out.unshift({ od: last.od, do: first.do });
  }
  return out;
}

function mergeIntervals(iv) {
  const sorted = iv.slice().sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

export function mergeArcs(arcs) {
  return fromIntervals(mergeIntervals(arcs.flatMap(toIntervals)));
}

export function isForbidden(deg, arcs) {
  return arcs.some((a) => arcContains(a, deg));
}

export function allowedArcs(forbidden) {
  const iv = mergeIntervals(forbidden.flatMap(toIntervals));
  if (!iv.length) return [{ od: 0, do: 360 }];
  if (iv.length === 1 && iv[0][0] <= EPS && iv[0][1] >= 360 - EPS) return [];
  const gaps = [];
  let cur = 0;
  for (const [a, b] of iv) {
    if (a > cur + EPS) gaps.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < 360 - EPS) gaps.push([cur, 360]);
  return fromIntervals(gaps);
}

const hasPos = (s) => Number.isFinite(s?.lat) && Number.isFinite(s?.lon);

export function neighborSector(stand, other) {
  const d = haversine(stand, other);
  const b = bearing(stand, other);
  const half = Math.min(90, Math.max(MIN_HALF_DEG, (Math.atan(LATERAL_BUFFER_M / Math.max(d, 1)) * 180) / Math.PI));
  return { od: norm(b - half), do: norm(b + half), razlog: `Stan ${other.broj} (${Math.round(d)} m)` };
}

// Svi drugi stanovi lova (bez obzira na udaljenost: zrno leti kilometrima) + ručni sektori.
export function standSectors(stand, stands, manual = []) {
  const arcs = [];
  const razlozi = [];
  for (const o of stands) {
    if (o === stand || o.broj === stand.broj || !hasPos(o)) continue;
    const s = neighborSector(stand, o);
    arcs.push(s);
    razlozi.push(`${s.razlog}: ${Math.round(s.od)}°–${Math.round(s.do)}°`);
  }
  for (const m of manual) {
    arcs.push({ od: norm(m.od), do: m.do === 360 ? 360 : norm(m.do) });
    razlozi.push(`${m.razlog || 'Zabranjeno'}: ${Math.round(norm(m.od))}°–${Math.round(norm(m.do))}°`);
  }
  return { lukovi: mergeArcs(arcs), razlozi };
}

export function standWarnings(stands) {
  const out = [];
  for (const s of stands) if (!hasPos(s)) out.push(`Stan ${s.broj} nema poziciju`);
  const placed = stands.filter(hasPos);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const d = haversine(placed[i], placed[j]);
      if (d < TOO_CLOSE_M) out.push(`Stan ${placed[i].broj} i stan ${placed[j].broj} su preblizu (${Math.round(d)} m)`);
    }
  }
  return out;
}

// Poligon klina za kartu: stan + tačke po luku na zadanom radijusu.
export function sectorWedge(stand, arc, radiusM = 400, steps = 16) {
  const len = isFull(arc) ? 360 : norm(arc.do - arc.od);
  const pts = [[stand.lat, stand.lon]];
  for (let i = 0; i <= steps; i++) {
    const p = destination(stand, arc.od + (len * i) / steps, radiusM);
    pts.push([p.lat, p.lon]);
  }
  return pts;
}
