// Pregled u Istraživaču (čista logika): nagib pogleda, svježina pozicije člana, sažetak trake.

import { formatMemberDistance } from './istrazivac.js';
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
