import test from 'node:test';
import assert from 'node:assert/strict';
import { shareOfMax, bestMonth } from '../../static/js/statistika-opsega.js';

test('trake poređenja: najveća grupa je 100 %, ostale razmjerno; bez podataka 0', () => {
  assert.equal(shareOfMax(4, 4), 100);
  assert.equal(shareOfMax(1, 4), 25);
  assert.equal(shareOfMax(0, 0), 0);
});

test('najbolji mjesec: najviše ulova, a bez ulova null', () => {
  assert.deepEqual(bestMonth([2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]), { mjesec: 3, komada: 3 });
  assert.equal(bestMonth(Array(12).fill(0)), null);
});
