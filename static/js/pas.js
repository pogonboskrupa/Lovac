// Praćenje psa: pozicija sa ogrlice/uređaja stiže kao tekst (SMS, link, koordinate) i čita se bez interneta (čista logika).

import { gkToWgs84 } from './geo.js';
import { rangeLabel } from './istrazivac.js';

const NUM = '(-?\\d{1,3}(?:[.,]\\d+)?)';

const ok = (lat, lon) => {
  let la = lat;
  let lo = lon;
  // Zamijenjen redoslijed (npr. "16.15, 44.88"): dužina u našem kraju je 14–20, širina 42–46.
  if (la >= 14 && la <= 20 && lo >= 42 && lo <= 46) [la, lo] = [lo, la];
  if (!(la >= -90 && la <= 90 && lo >= -180 && lo <= 180) || (la === 0 && lo === 0)) return null;
  return { lat: la, lon: lo };
};
const n = (s) => Number(String(s).replace(',', '.'));

// Vraća { lat, lon } ili { greska }.
export function parseLocation(text) {
  const t = String(text ?? '').trim();
  if (!t) return { greska: 'Zalijepi lokaciju psa.' };

  // MGI (Y 5605178 X 4959430) — koordinate kakve piše ova aplikacija i papirne karte.
  const gk = t.match(/Y\s*[:=]?\s*(\d{7})\D+X\s*[:=]?\s*(\d{7})/i) || (() => { const m = t.match(/X\s*[:=]?\s*(\d{7})\D+Y\s*[:=]?\s*(\d{7})/i); return m && [m[0], m[2], m[1]]; })();
  if (gk) {
    const zone = gk[1][0] === '6' ? 6 : 5;
    const p = ok(...Object.values(gkToWgs84(zone, Number(gk[1]), Number(gk[2]))));
    if (p) return p;
  }

  // Linkovi karata: ?q=lat,lon  ll=  query=  destination=  center=  @lat,lon  geo:lat,lon  #map=z/lat/lon
  const link = t.match(new RegExp(`(?:[?&](?:q|ll|query|destination|center|daddr|saddr)=|@|geo:|#map=\\d+/)${NUM}[,/]\\s*${NUM}`, 'i'));
  if (link) { const p = ok(n(link[1]), n(link[2])); if (p) return p; }
  if (/(goo\.gl|maps\.app|bit\.ly|tinyurl|t\.co)\//i.test(t)) {
    return { greska: 'Kratki link ne mogu pročitati bez interneta. Otvori ga, pa kopiraj koordinate.' };
  }

  // Sa stranama svijeta: "N 44.88123 E 16.15321", "44.88123N 16.15321E", "44°52.738' N 16°09.123' E", DMS.
  const hem = t.match(/(\d{1,2})(?:[.,](\d+))?\s*°?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*["″]\s*)?([NS])[,;\s]+(\d{1,3})(?:[.,](\d+))?\s*°?\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*['′]\s*)?(?:(\d{1,2}(?:[.,]\d+)?)\s*["″]\s*)?([EW])/i);
  if (hem) {
    const conv = (d, frac, m, s, h) => {
      const v = n(`${d}.${frac ?? 0}`) + (m ? n(m) / 60 : 0) + (s ? n(s) / 3600 : 0);
      return /[SW]/i.test(h) ? -v : v;
    };
    // Ako ima minute, decimalni dio stepena nije dio zapisa (44°52.738' → d=44, m=52.738).
    const hasMin = (m) => m != null;
    const lat = hasMin(hem[3]) ? conv(hem[1], 0, hem[3], hem[4], hem[5]) : conv(hem[1], hem[2], null, null, hem[5]);
    const lon = hasMin(hem[8]) ? conv(hem[6], 0, hem[8], hem[9], hem[10]) : conv(hem[6], hem[7], null, null, hem[10]);
    const p = ok(lat, lon);
    if (p) return p;
  }
  const dec = t.match(new RegExp(`([NS])\\s*${NUM}\\D{1,6}([EW])\\s*${NUM}`, 'i'));
  if (dec) {
    const p = ok((/S/i.test(dec[1]) ? -1 : 1) * n(dec[2]), (/W/i.test(dec[3]) ? -1 : 1) * n(dec[4]));
    if (p) return p;
  }

  // Dva decimalna broja: "44.88123, 16.15321" (zarez kao decimalni znak samo uz razmak iza para).
  const pair = t.match(/(-?\d{1,3}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/) || t.match(/(-?\d{1,3},\d{3,})\s*;\s*(-?\d{1,3},\d{3,})/);
  if (pair) { const p = ok(n(pair[1]), n(pair[2])); if (p) return p; }

  return { greska: 'Ne prepoznajem koordinate. Primjeri: 44.88123, 16.15321 ili link sa karte ili Y 5605178 X 4959430.' };
}

export const MAX_DOG_POINTS = 50;

export function addDogPoint(points, p, now = Date.now()) {
  const last = points[points.length - 1];
  if (last && Math.abs(last.lat - p.lat) < 1e-6 && Math.abs(last.lon - p.lon) < 1e-6) return points;
  return [...points, { lat: p.lat, lon: p.lon, t: now }].slice(-MAX_DOG_POINTS);
}

export function dogAge(t, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - t) / 60000));
  const text = min < 1 ? 'upravo' : min < 60 ? `prije ${min} min` : `prije ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  return { min, text, zastarjelo: min > 10 };
}

// "Pas: 340 m JI · prije 5 min" ili samo vrijeme kad nema mog GPS-a.
export function dogSummary(me, point, now = Date.now()) {
  if (!point) return '';
  const age = dogAge(point.t, now);
  const range = me ? rangeLabel(me, point) : '';
  return `${range ? `${range} · ` : ''}${age.text}`;
}
