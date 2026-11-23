import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveOverview } from '../../static/js/arhiva.js';

test('pregled arhive broji lovove, ulov i slike iz detalja na telefonu', () => {
  const hunts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const d = { a: { odstrel: [1, 2], slike: [1] }, b: { odstrel: [], slike: [1, 2, 3] } };
  assert.deepEqual(archiveOverview(hunts, (id) => d[id]), { lovova: 3, komada: 2, slika: 4 });
});
