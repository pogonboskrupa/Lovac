import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, huntsByDate, initialMonth, shiftMonth, monthLabel, monthStats, photosOnMap } from '../../static/js/arhiva-kalendar.js';

test('mreža mjeseca počinje ponedjeljkom; novembar 2026 počinje u nedjelju', () => {
  const w = monthGrid({ y: 2026, m: 10 }, '2026-11-23');
  assert.equal(w[0][0].datum, '2026-10-26');
  assert.equal(w[0][6].datum, '2026-11-01');
  assert.equal(w[0][6].uMjesecu, true);
  assert.equal(w[0][0].uMjesecu, false);
  assert.equal(w.length, 6);
  assert.equal(w.flat().find((c) => c.danas).datum, '2026-11-23');
  assert.equal(w.flat().filter((c) => c.uMjesecu).length, 30);
  // februar 2027 (28 dana, počinje u ponedjeljak) = tačno 4 sedmice
  assert.equal(monthGrid({ y: 2027, m: 1 }).length, 4);
});

test('lovovi po danu, početni mjesec, pomjeranje mjeseca i naziv', () => {
  const hunts = [{ lov: { datum: '2026-11-15' } }, { lov: { datum: '2026-11-15' } }, { lov: { datum: '2026-10-02' } }, { lov: { datum: '2026-12-30' } }];
  assert.equal(huntsByDate(hunts).get('2026-11-15').length, 2);
  assert.deepEqual(initialMonth(hunts, '2026-11-23'), { y: 2026, m: 10 });
  assert.deepEqual(initialMonth([], '2026-11-23'), { y: 2026, m: 10 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 11 }, 1), { y: 2027, m: 0 });
  assert.deepEqual(shiftMonth({ y: 2026, m: 0 }, -1), { y: 2025, m: 11 });
  assert.equal(monthLabel({ y: 2026, m: 10 }), 'Novembar 2026.');
  assert.deepEqual(monthStats(hunts, { y: 2026, m: 10 }), { lovova: 2, dana: 1 });
});

test('slike na karti: samo one sa lokacijom', () => {
  const r = photosOnMap([{ lat: 44.8, lon: 16.1 }, { lat: null, lon: null }, { lat: 44.9, lon: 16.2 }]);
  assert.equal(r.sa.length, 2);
  assert.equal(r.bez, 1);
});
