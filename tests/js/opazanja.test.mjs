import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterObservations, densityGrid, summarizeBySpecies, periodRange, clampCount,
} from '../../static/js/opazanja.js';

const D = (s) => new Date(s).getTime();
const obs = [
  { id: '1', vrsta: 'srna', broj: 2, vrijeme: D('2026-05-10T06:00'), lat: 44.880, lon: 16.150 },
  { id: '2', vrsta: 'srna', broj: 1, vrijeme: D('2026-11-01T17:00'), lat: 44.8801, lon: 16.1501 },
  { id: '3', vrsta: 'divlja_svinja', broj: 5, vrijeme: D('2026-11-10T20:00'), lat: 44.9, lon: 16.2 },
  { id: '4', vrsta: 'zec', broj: 1, vrijeme: D('2025-12-01T08:00'), lat: 44.95, lon: 16.25 },
];

test('filter po vrsti i periodu (granice uključene)', () => {
  assert.deepEqual(filterObservations(obs, { vrsta: 'srna' }).map((o) => o.id), ['1', '2']);
  assert.deepEqual(filterObservations(obs, { od: D('2026-11-01T00:00'), do: D('2026-11-30T23:59') }).map((o) => o.id), ['2', '3']);
  assert.deepEqual(filterObservations(obs, { vrsta: 'srna', od: D('2026-06-01T00:00') }).map((o) => o.id), ['2']);
  assert.equal(filterObservations(obs, {}).length, 4);
});

test('gustina: opažanja u istoj ćeliji se sabiraju po broju grla', () => {
  const cells = densityGrid(obs, 500);
  const total = cells.reduce((s, c) => s + c.count, 0);
  assert.equal(total, 9);
  const srnaCell = cells.find((c) => c.count === 3);
  assert.ok(srnaCell, 'dva bliska opažanja srne (2 + 1 grlo) su u istoj ćeliji');
  assert.ok(srnaCell.lat0 <= 44.88 && srnaCell.lat1 >= 44.8801);
  assert.equal(Math.max(...cells.map((c) => c.intensity)), 1);
});

test('zbir po vrsti (broj opažanja i grla), najviše grla prvo', () => {
  const s = summarizeBySpecies(obs);
  assert.deepEqual(s[0], { vrsta: 'divlja_svinja', opazanja: 1, grla: 5 });
  assert.deepEqual(s.find((x) => x.vrsta === 'srna'), { vrsta: 'srna', opazanja: 2, grla: 3 });
});

test('brzi periodi', () => {
  const now = D('2026-11-19T12:00');
  const r30 = periodRange('30', now);
  assert.equal(r30.do, now);
  assert.equal(Math.round((r30.do - r30.od) / 86400000), 30);
  assert.equal(periodRange('godina', now).od, D('2026-01-01T00:00'));
  assert.deepEqual(periodRange('sve', now), { od: null, do: null });
});

test('broj grla je cijeli broj 1–999', () => {
  assert.equal(clampCount(0), 1);
  assert.equal(clampCount(3.7), 3);
  assert.equal(clampCount(5000), 999);
  assert.equal(clampCount('x'), 1);
});
