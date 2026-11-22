import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wgs84ToGk6, accuracyLevel, formatFixAge } from '../../static/js/geo.js';

// Referentne vrijednosti iz pyproj (PROJ): tmerc lon_0=18 k=0.9999 x_0=6500000, Bessel, towgs84=682,-203,480.
const REF = [
  [44.8, 16.0, 6342176.852, 4963671.602],
  [44.6, 16.5, 6381324.342, 4940596.778],
  [45.1, 15.75, 6323323.758, 4997524.957],
  [43.85, 18.4, 6532564.003, 4856250.184],
];

test('WGS84 -> MGI Balkans zona 6 se poklapa sa PROJ na < 1 cm', () => {
  for (const [lat, lon, e, n] of REF) {
    const r = wgs84ToGk6(lat, lon);
    assert.ok(Math.abs(r.e - e) < 0.01, `E ${r.e} vs ${e}`);
    assert.ok(Math.abs(r.n - n) < 0.01, `N ${r.n} vs ${n}`);
  }
});

test('boja tačnosti: ≤5 zeleno, ≤15 žuto, više crveno', () => {
  assert.equal(accuracyLevel(5), 'dobro');
  assert.equal(accuracyLevel(5.1), 'srednje');
  assert.equal(accuracyLevel(15), 'srednje');
  assert.equal(accuracyLevel(16), 'lose');
  assert.equal(accuracyLevel(NaN), 'lose');
});

test('starost fiksa', () => {
  assert.equal(formatFixAge(4200), '4 s');
  assert.equal(formatFixAge(125000), '2 min');
  assert.equal(formatFixAge(3 * 3600e3 + 5 * 60e3), '3 h 5 min');
  assert.equal(formatFixAge(-1), '—');
});

import { gk6ToWgs84 } from '../../static/js/geo.js';

test('GK zona 6 -> WGS84 se poklapa sa PROJ (< 0,2 m)', () => {
  const REF_INV = [
    [6342176.852, 4963671.602, 44.8, 16.00000004],
    [6381324.342, 4940596.778, 44.60000001, 16.50000005],
    [6300000, 5000000, 45.11603044, 15.45293185],
    [6450000, 4900000, 44.24273444, 17.36893619],
  ];
  for (const [e, n, lat, lon] of REF_INV) {
    const r = gk6ToWgs84(e, n);
    assert.ok(Math.abs(r.lat - lat) < 2e-6, `lat ${r.lat} vs ${lat}`);
    assert.ok(Math.abs(r.lon - lon) < 2e-6, `lon ${r.lon} vs ${lon}`);
  }
});

import { wgs84ToGk, gkToWgs84, gkZoneFor, formatGk, scaleRatio, formatScale } from '../../static/js/geo.js';

// Referenca: PROJ, tmerc lon_0=15 k=0.9999 x_0=5500000, Bessel, towgs84=682,-203,480 (MGI Balkans zona 5).
test('WGS84 <-> MGI Balkans zona 5 se poklapa sa PROJ (< 1 cm / < 0,2 m)', () => {
  const REF = [[44.8, 16.0, 5579486.102, 4962226.124], [44.76, 16.3, 5603291.243, 4958117.133], [45.2, 15.5, 5539655.034, 5006309.94]];
  for (const [lat, lon, e, n] of REF) {
    const r = wgs84ToGk(5, lat, lon);
    assert.ok(Math.abs(r.e - e) < 0.01 && Math.abs(r.n - n) < 0.01, `${r.e},${r.n} vs ${e},${n}`);
  }
  const back = gkToWgs84(5, 5605178, 4959430);
  assert.ok(Math.abs(back.lat - 44.77153826) < 2e-6 && Math.abs(back.lon - 16.32409586) < 2e-6);
});

test('zona se bira po dužini: granica 16,5° (Grmeč je u zoni 5)', () => {
  assert.equal(gkZoneFor(16.32), 5);
  assert.equal(gkZoneFor(16.499), 5);
  assert.equal(gkZoneFor(16.5), 6);
  assert.equal(gkZoneFor(17.8), 6);
  assert.equal(gkZoneFor(15.1), 5);
});

test('koordinate kao u aplikaciji na terenu: MGI 5 Y 5605178, X 4959430', () => {
  const f = formatGk(44.77153826, 16.32409586);
  assert.deepEqual(f, { zona: 5, tekst: 'Y 5605178, X 4959430', oznaka: 'MGI 5' });
});

test('razmjer karte 1:N (96 dpi), zaokružen', () => {
  assert.equal(scaleRatio(44.77, 14), 26000);
  assert.equal(formatScale(26000), '1:26 000');
  assert.equal(formatScale(591657550), '1:591 657 550');
  assert.ok(scaleRatio(44.77, 17) < scaleRatio(44.77, 14));
  assert.equal(scaleRatio(0, 18) % 100, 0);
});

import { COORD_MODES, nextCoordMode, formatCoordMode } from '../../static/js/geo.js';
test('prikaz koordinata: WGS84 pa MGI 5 pa MGI 6 u krug', () => {
  assert.deepEqual(COORD_MODES, ['wgs', 'mgi5', 'mgi6']);
  assert.equal(nextCoordMode('wgs'), 'mgi5');
  assert.equal(nextCoordMode('mgi5'), 'mgi6');
  assert.equal(nextCoordMode('mgi6'), 'wgs');
  assert.equal(nextCoordMode('nesto'), 'mgi5');
  assert.deepEqual(formatCoordMode('wgs', 44.88, 16.15), { oznaka: 'WGS84', tekst: '44.880000, 16.150000' });
  const g5 = formatCoordMode('mgi5', 44.88, 16.15);
  assert.equal(g5.oznaka, 'MGI 5');
  assert.match(g5.tekst, /^Y 55\d{5}, X 49\d{5}$/);
  const g6 = formatCoordMode('mgi6', 44.88, 16.15);
  assert.equal(g6.oznaka, 'MGI 6');
  assert.notEqual(g6.tekst, g5.tekst);
});
