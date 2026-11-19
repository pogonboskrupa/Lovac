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
