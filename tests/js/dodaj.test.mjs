import test from 'node:test';
import assert from 'node:assert/strict';
import { addPositionText } from '../../static/js/dodaj-ui.js';

test('ploča "+": tekst pozicije kaže GPS, stari GPS ili nišan', () => {
  const now = 1_000_000_000;
  assert.match(addPositionText(null, now), /nišanu/);
  assert.equal(addPositionText({ lat: 44.9, lon: 16.1, acc: 6.4, t: now - 5000 }, now), 'Na tvojoj GPS poziciji ±6 m.');
  assert.match(addPositionText({ lat: 44.9, lon: 16.1, acc: 6, t: now - 5 * 60000 }, now), /prije 5 min/);
});
