// Istraživač: smjer i udaljenost članova u odnosu na mene (čista logika).

import { compassName } from './geo.js';

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(a, b) {
  const dφ = rad(b.lat - a.lat);
  const dλ = rad(b.lon - a.lon);
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a, b) {
  const φ1 = rad(a.lat);
  const φ2 = rad(b.lat);
  const Δλ = rad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function formatMemberDistance(m) {
  if (m < 1000) return `${Math.round(m / 10) * 10 || Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
}

// Ugao strelice na ekranu: smjer prema članu relativno na smjer telefona (ili sjever kad kompasa nema).
export function arrowAngle(bearing, heading) {
  return (((bearing - (heading ?? 0)) % 360) + 360) % 360;
}

// rows: [{korisnik_id, lat, lon, t}]; stariji od maxAgeMs se ne prikazuju; najbliži prvi.
export function memberVectors(me, rows, myId, nameOf, now = Date.now(), maxAgeMs = 30 * 60000) {
  return rows
    .filter((r) => r.korisnik_id !== myId && now - Date.parse(r.t) <= maxAgeMs)
    .map((r) => ({
      id: r.korisnik_id,
      ime: nameOf(r.korisnik_id),
      lat: r.lat,
      lon: r.lon,
      udaljenost: distanceM(me, r),
      smjer: bearingDeg(me, r),
      starost: Math.max(0, Math.round((now - Date.parse(r.t)) / 60000)),
    }))
    .sort((a, b) => a.udaljenost - b.udaljenost);
}

// Kratak opis "230 m SI" od mene do cilja; bez GPS-a prazan tekst.
export function rangeLabel(from, to) {
  if (!from || !to) return '';
  return `${formatMemberDistance(distanceM(from, to))} ${compassName(bearingDeg(from, to))}`;
}
