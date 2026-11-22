import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAGIBI, tiltById, nextTilt, freshnessOf, barSummary, upLabel } from '../../static/js/istrazivac-pregled.js';

test('nagib kruži blag → srednji → strm → blag; nepoznat id daje zadani', () => {
  assert.equal(nextTilt('blag'), 'srednji');
  assert.equal(nextTilt('strm'), 'blag');
  assert.equal(tiltById('xx').stepeni, 40);
  assert.deepEqual(NAGIBI.map((n) => n.stepeni), [25, 40, 55]);
});
test('svježina pozicije člana', () => {
  assert.equal(freshnessOf(1), 'uzivo');
  assert.equal(freshnessOf(2), 'uzivo');
  assert.equal(freshnessOf(8), 'zastarjelo');
  assert.equal(freshnessOf(25), 'bez-signala');
});
test('sažetak trake: broj, uživo i najbliži', () => {
  assert.equal(barSummary([]), null);
  const s = barSummary([
    { id: 'a', ime: 'Adnan Đulić', smjer: 45, udaljenost: 230, starost: 1 },
    { id: 'b', ime: 'Berin Kos', smjer: 200, udaljenost: 900, starost: 15 },
  ]);
  assert.equal(s.broj, 2);
  assert.equal(s.uzivo, 1);
  assert.equal(s.najblizi, 'a');
  assert.match(s.tekst, /^2 člana · najbliži Adnan SI 230 m$/);
});
test('HUD tekst: smjer gore i nagib', () => {
  assert.equal(upLabel(135, 40), 'Gore: JI 135° · nagib 40°');
});
