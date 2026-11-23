import test from 'node:test';
import assert from 'node:assert/strict';
import { inObservationsText } from '../../static/js/opazanja.js';

test('padež: u 1 opažanju, u 2 opažanja, u 11 opažanja, u 21 opažanju', () => {
  assert.equal(inObservationsText(1), 'u 1 opažanju');
  assert.equal(inObservationsText(2), 'u 2 opažanja');
  assert.equal(inObservationsText(11), 'u 11 opažanja');
  assert.equal(inObservationsText(21), 'u 21 opažanju');
});
