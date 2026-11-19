import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathLength, polygonAreaM2, formatArea, slopeBetween, formatSlope } from '../../static/js/mjerenje.js';

const P = (lon, lat) => ({ lat, lon });

test('dužina putanje (referenca: turf.length)', () => {
  const d = pathLength([P(16.15, 44.88), P(16.16, 44.89), P(16.17, 44.88)]);
  assert.ok(Math.abs(d - 2725.53) < 3, String(d));
  assert.equal(pathLength([P(16, 44)]), 0);
});

test('površina poligona (referenca: turf.area, < 0,5 %)', () => {
  const sq = [P(16.14, 44.87), P(16.16, 44.87), P(16.16, 44.89), P(16.14, 44.89)];
  const a = polygonAreaM2(sq);
  assert.ok(Math.abs(a - 3504481.88) / 3504481.88 < 0.005, String(a));
  const tri = polygonAreaM2([P(16.15, 44.88), P(16.151, 44.88), P(16.1505, 44.881)]);
  assert.ok(Math.abs(tri - 4380.56) / 4380.56 < 0.005, String(tri));
  assert.equal(polygonAreaM2([P(1, 1), P(2, 2)]), 0, 'manje od 3 tačke nema površinu');
});

test('format površine: ha sa decimalnim zarezom, mala površina u m²', () => {
  assert.equal(formatArea(3504481.88), '350,45 ha');
  assert.equal(formatArea(4380.56), '4381 m² (0,44 ha)');
});

test('nagib iz visina: % i stepeni, smjer uspona', () => {
  const s = slopeBetween({ lat: 44.88, lon: 16.15, visina: 500 }, { lat: 44.881, lon: 16.15, visina: 530 });
  assert.ok(Math.abs(s.udaljenost - 111.2) < 0.5);
  assert.ok(Math.abs(s.procenat - 26.98) < 0.2, String(s.procenat));
  assert.ok(Math.abs(s.stepeni - 15.09) < 0.1, String(s.stepeni));
  assert.equal(formatSlope(s), '27 % (15°) uspon');
  assert.equal(formatSlope(slopeBetween({ lat: 44.88, lon: 16.15, visina: 530 }, { lat: 44.881, lon: 16.15, visina: 500 })), '27 % (15°) pad');
  assert.equal(slopeBetween({ lat: 44.88, lon: 16.15, visina: null }, { lat: 44.881, lon: 16.15, visina: 1 }), null);
});
