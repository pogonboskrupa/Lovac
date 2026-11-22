// Pregled u Istraživaču (čista logika): nagib pogleda, svježina pozicije člana, sažetak trake.

import { formatMemberDistance, distanceM } from './istrazivac.js';
import { shouldRecordPoint, pushPoint } from './lovtrag.js';
import { compassName } from './geo.js';

export const NAGIBI = [
  { id: 'blag', stepeni: 25, naziv: 'Blag nagib' },
  { id: 'srednji', stepeni: 40, naziv: 'Srednji nagib' },
  { id: 'strm', stepeni: 55, naziv: 'Strm nagib' },
];

export const NAGIB_ZADANI = 'srednji';

export function tiltById(id) {
  return NAGIBI.find((n) => n.id === id) || NAGIBI.find((n) => n.id === NAGIB_ZADANI);
}

export function nextTilt(id) {
  const i = NAGIBI.findIndex((n) => n.id === id);
  return NAGIBI[(i + 1) % NAGIBI.length].id;
}

// Isti pragovi kao markeri članova na karti: uživo ≤ 2 min, zastarjelo ≤ 10, inače bez signala.
export function freshnessOf(ageMin) {
  if (ageMin <= 2) return 'uzivo';
  if (ageMin <= 10) return 'zastarjelo';
  return 'bez-signala';
}

// vectors = memberVectors(...) (najbliži prvi).
export function barSummary(vectors) {
  if (!vectors.length) return null;
  const n = vectors[0];
  const live = vectors.filter((v) => freshnessOf(v.starost) === 'uzivo').length;
  return {
    broj: vectors.length,
    uzivo: live,
    najblizi: n.id,
    tekst: `${vectors.length} ${vectors.length === 1 ? 'član' : 'člana'} · najbliži ${n.ime.split(' ')[0]} ${compassName(n.smjer)} ${formatMemberDistance(n.udaljenost)}`,
  };
}

export function upLabel(bearing, tiltDeg) {
  return `Gore: ${compassName(bearing)} ${Math.round(bearing)}° · nagib ${tiltDeg}°`;
}

// ---- Detalj člana, mrvice traga (lokalno pamćenje kuda se kretao) ----

// Redak detalja: "Adnan Đulić · 230 m JI · prije 2 min".
export function detailLine(vec) {
  const age = vec.starost > 1 ? `prije ${vec.starost} min` : 'upravo';
  return `${vec.ime} · ${formatMemberDistance(vec.udaljenost)} ${compassName(vec.smjer)} · ${age}`;
}

// store = { lov, by: { uid: [{lat, lon, t}] } }; nova pozicija se pamti kad se član pomjerio ≥ 15 m ili je prošlo 90 s.
export function crumbsAdd(store, row, max = 800) {
  const cur = store && store.lov === row.lov_id ? store : { lov: row.lov_id ?? null, by: {} };
  const t = typeof row.t === 'number' ? row.t : Date.parse(row.t);
  if (!Number.isFinite(t)) return cur;
  const list = cur.by[row.korisnik_id] || [];
  const last = list[list.length - 1];
  const point = { lat: row.lat, lon: row.lon, t };
  if (last && t <= last.t) return cur;
  if (!shouldRecordPoint(last, point, t)) return cur;
  return { ...cur, by: { ...cur.by, [row.korisnik_id]: pushPoint(list, point, max) } };
}

// Trag sa servera (lov_tragovi) + lokalne mrvice; isto vrijeme se broji jednom, redoslijed po vremenu.
export function mergeMemberTrail(serverRows, crumbs) {
  const by = new Map();
  for (const r of [...serverRows, ...crumbs]) {
    const t = typeof r.t === 'number' ? r.t : Date.parse(r.t);
    if (Number.isFinite(t)) by.set(t, { lat: r.lat, lon: r.lon, t });
  }
  return [...by.values()].sort((a, b) => a.t - b.t);
}

export function trailMeters(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += distanceM(points[i - 1], points[i]);
  return d;
}
