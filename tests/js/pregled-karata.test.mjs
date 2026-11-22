import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offlineHero, offlineAdvice, layersSummary, layerSource } from '../../static/js/pregled-karata.js';

test('hero: zbir veličine fajlova i broj karata (teren se računa)', () => {
  const h = offlineHero({ tiles: 12, terenInfo: { velicina: 2 * 1048576 }, maps: [{ velicina: 1048576 }], hasBridge: true });
  assert.deepEqual(h.map((x) => x.v), ['12', '2', '3,0 MB']);
});
test('hero bez aplikacije ne izmišlja fajlove', () => {
  assert.deepEqual(offlineHero({ tiles: 3 }).map((x) => x.v), ['3', '—', '—']);
});
test('savjet: fajl radi, keš djelimično, inače nema', () => {
  assert.equal(offlineAdvice({ hasBridge: true, maps: [{}] }).stanje, 'ok');
  assert.equal(offlineAdvice({ tiles: 80 }).stanje, 'djelimicno');
  assert.equal(offlineAdvice({ tiles: 3 }).stanje, 'nema');
});
test('slojevi: prikazani se broje, elementi zbrajaju', () => {
  const s = layersSummary([{ geojson: 2, stil: { vidljiv: false } }, { geojson: 5 }], (g) => g);
  assert.deepEqual(s, { broj: 2, prikazanih: 1, elemenata: 7 });
});
test('izvor sloja: starost u danima', () => {
  const now = Date.UTC(2026, 10, 20);
  assert.match(layerSource({ izvor: 'server', verzija: 2, preuzeto: now - 3 * 86400000 }, now), /verzija 2 · prije 3 d/);
  assert.match(layerSource({ izvor: 'fajl', uvezeno: now }, now), /uvezen fajl · danas/);
});
