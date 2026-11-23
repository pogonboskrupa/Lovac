import test from 'node:test';
import assert from 'node:assert/strict';
import { memTilesGet, memTilesPut } from '../../static/js/tiles.js';

test('memorijski keš pločica: najstarije izlazi, pročitana se obnavlja', () => {
  memTilesPut('a', 1, 2);
  memTilesPut('b', 2, 2);
  assert.equal(memTilesGet('a'), 1); // a je sada najnovija
  memTilesPut('c', 3, 2); // izbacuje b
  assert.equal(memTilesGet('b'), undefined);
  assert.equal(memTilesGet('a'), 1);
  assert.equal(memTilesGet('c'), 3);
});
