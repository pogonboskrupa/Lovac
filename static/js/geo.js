// Čista geometrija i formatiranje koordinata (bez DOM-a, testira se u Node-u).

const WGS84 = { a: 6378137.0, f: 1 / 298.257223563 };
const BESSEL = { a: 6377397.155, f: 1 / 299.1528128 };

// MGI Balkans zona 6 (EPSG:31276) sa pomakom datuma koji se koristi u BiH.
// Pomak je obrnut jer ide WGS84 -> MGI.
const MGI_SHIFT = { dx: -682, dy: 203, dz: -480 };
const GK6 = { lon0: 18, k0: 0.9999, x0: 6500000, y0: 0 };
// Zone MGI Balkans: 5 (srednji meridijan 15°, Y ~5,5 mil.) i 6 (18°, Y ~6,5 mil.). Zapadna BiH (Grmeč) je u zoni 5.
export const GK_ZONES = {
  5: { lon0: 15, k0: 0.9999, x0: 5500000, y0: 0 },
  6: GK6,
};

const DEG = Math.PI / 180;

function geodeticToEcef(latDeg, lonDeg, h, ell) {
  const e2 = ell.f * (2 - ell.f);
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const sinLat = Math.sin(lat);
  const N = ell.a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - e2) + h) * sinLat,
  ];
}

function ecefToGeodetic(x, y, z, ell) {
  const e2 = ell.f * (2 - ell.f);
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(lat);
    const N = ell.a / Math.sqrt(1 - e2 * s * s);
    lat = Math.atan2(z + e2 * N * s, p);
  }
  return [lat / DEG, Math.atan2(y, x) / DEG];
}

// Transverzalni Merkator (Snyder, serije do 6. reda) — mm tačnost unutar zone.
function transverseMercator(latDeg, lonDeg, ell, p) {
  const e2 = ell.f * (2 - ell.f);
  const ep2 = e2 / (1 - e2);
  const lat = latDeg * DEG;
  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const tan = Math.tan(lat);
  const N = ell.a / Math.sqrt(1 - e2 * sin * sin);
  const T = tan * tan;
  const C = ep2 * cos * cos;
  const A = (lonDeg - p.lon0) * DEG * cos;
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = ell.a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat)
    - (35 * e6 / 3072) * Math.sin(6 * lat)
  );
  const easting = p.x0 + p.k0 * N * (
    A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120
  );
  const northing = p.y0 + p.k0 * (M + N * tan * (
    A * A / 2
    + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720
  ));
  return { e: easting, n: northing };
}

export function wgs84ToGk6(lat, lon) {
  const [x, y, z] = geodeticToEcef(lat, lon, 0, WGS84);
  const [mLat, mLon] = ecefToGeodetic(x + MGI_SHIFT.dx, y + MGI_SHIFT.dy, z + MGI_SHIFT.dz, BESSEL);
  return transverseMercator(mLat, mLon, BESSEL, GK6);
}

export function formatWgs84(lat, lon) {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

export function formatGk6(lat, lon) {
  const { e, n } = wgs84ToGk6(lat, lon);
  return `Y ${Math.round(e)}  X ${Math.round(n)}`;
}

// Prag tačnosti GPS-a za boju: ≤5 m dobro, ≤15 m prihvatljivo, više loše.
export function accuracyLevel(meters) {
  if (!Number.isFinite(meters)) return 'lose';
  if (meters <= 5) return 'dobro';
  if (meters <= 15) return 'srednje';
  return 'lose';
}

export function formatFixAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// Početni azimut (0 = sjever, u smjeru kazaljke) od a do b.
export function bearing(a, b) {
  const r = Math.PI / 180;
  const φ1 = a.lat * r;
  const φ2 = b.lat * r;
  const Δλ = (b.lon - a.lon) * r;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}

const STRANE = ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ'];

export function compassName(deg) {
  return STRANE[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function formatBearing(deg) {
  return `${compassName(deg)} ${Math.round(deg)}°`;
}

// Inverzni transverzalni Merkator (Snyder) — za uvoz slojeva u GK zoni 6.
function inverseTransverseMercator(easting, northing, ell, p) {
  const e2 = ell.f * (2 - ell.f);
  const ep2 = e2 / (1 - e2);
  const e4 = e2 * e2;
  const e6 = e4 * e2;
  const M = (northing - p.y0) / p.k0;
  const mu = M / (ell.a * (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const φ1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sin = Math.sin(φ1);
  const cos = Math.cos(φ1);
  const tan = Math.tan(φ1);
  const C1 = ep2 * cos * cos;
  const T1 = tan * tan;
  const N1 = ell.a / Math.sqrt(1 - e2 * sin * sin);
  const R1 = ell.a * (1 - e2) / (1 - e2 * sin * sin) ** 1.5;
  const D = (easting - p.x0) / (N1 * p.k0);
  const lat = φ1 - (N1 * tan / R1) * (D * D / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / cos;
  return [lat / DEG, p.lon0 + lon / DEG];
}

export function gk6ToWgs84(easting, northing) {
  const [mLat, mLon] = inverseTransverseMercator(easting, northing, BESSEL, GK6);
  const [x, y, z] = geodeticToEcef(mLat, mLon, 0, BESSEL);
  const [lat, lon] = ecefToGeodetic(x - MGI_SHIFT.dx, y - MGI_SHIFT.dy, z - MGI_SHIFT.dz, WGS84);
  return { lat, lon };
}


function zoneParams(zone) {
  const p = GK_ZONES[zone];
  if (!p) throw new Error(`Nepoznata GK zona ${zone}`);
  return p;
}

export function wgs84ToGk(zone, lat, lon) {
  const [x, y, z] = geodeticToEcef(lat, lon, 0, WGS84);
  const [mLat, mLon] = ecefToGeodetic(x + MGI_SHIFT.dx, y + MGI_SHIFT.dy, z + MGI_SHIFT.dz, BESSEL);
  return transverseMercator(mLat, mLon, BESSEL, zoneParams(zone));
}

export function gkToWgs84(zone, easting, northing) {
  const [mLat, mLon] = inverseTransverseMercator(easting, northing, BESSEL, zoneParams(zone));
  const [x, y, z] = geodeticToEcef(mLat, mLon, 0, BESSEL);
  const [lat, lon] = ecefToGeodetic(x - MGI_SHIFT.dx, y - MGI_SHIFT.dy, z - MGI_SHIFT.dz, WGS84);
  return { lat, lon };
}

// Granica zona je 16,5° (sredina između meridijana 15° i 18°).
export function gkZoneFor(lon) {
  return lon < 16.5 ? 5 : 6;
}

export function formatGk(lat, lon, zone = gkZoneFor(lon)) {
  const { e, n } = wgs84ToGk(zone, lat, lon);
  return { zona: zone, tekst: `Y ${Math.round(e)}, X ${Math.round(n)}`, oznaka: `MGI ${zone}` };
}

// Razmjer 1:N za 96 dpi ekran (0,2646 mm po pikselu), zaokružen da se čita kao na papirnoj karti.
export function scaleRatio(lat, zoom) {
  const mPerPx = (156543.03392 * Math.cos(lat * DEG)) / 2 ** zoom;
  const n = mPerPx / 0.000264583;
  const step = n >= 10000 ? 1000 : n >= 1000 ? 100 : 10;
  return Math.round(n / step) * step;
}

export function formatScale(n) {
  return `1:${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
}

// Prikaz koordinata na karti: WGS84 (zadano) pa MGI zona 5 pa MGI zona 6 (dodir na okvir mijenja redom).
export const COORD_MODES = ['wgs', 'mgi5', 'mgi6'];

export function nextCoordMode(mode) {
  return COORD_MODES[(Math.max(0, COORD_MODES.indexOf(mode)) + 1) % COORD_MODES.length];
}

export function formatCoordMode(mode, lat, lon) {
  if (mode === 'mgi5' || mode === 'mgi6') {
    const g = formatGk(lat, lon, mode === 'mgi5' ? 5 : 6);
    return { oznaka: g.oznaka, tekst: g.tekst };
  }
  return { oznaka: 'WGS84', tekst: formatWgs84(lat, lon) };
}
