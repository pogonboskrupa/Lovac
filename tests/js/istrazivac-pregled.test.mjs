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

import { detailLine, crumbsAdd, mergeMemberTrail, trailMeters } from '../../static/js/istrazivac-pregled.js';

test('redak detalja: ime, udaljenost sa stranom svijeta i starost pozicije', () => {
  assert.equal(detailLine({ ime: 'Adnan Đulić', udaljenost: 230, smjer: 45, starost: 0 }), 'Adnan Đulić · 230 m SI · upravo');
  assert.equal(detailLine({ ime: 'Berin Kos', udaljenost: 1500, smjer: 200, starost: 4 }), 'Berin Kos · 1,5 km J · prije 4 min');
});
test('mrvice: pamte se pozicije kad se član pomjeri, reset za drugi lov, stare se ne vraćaju', () => {
  const t0 = Date.parse('2026-11-20T08:00:00Z');
  let s = { lov: null, by: {} };
  s = crumbsAdd(s, { lov_id: 'L1', korisnik_id: 'a', lat: 44.88, lon: 16.15, t: new Date(t0).toISOString() });
  s = crumbsAdd(s, { lov_id: 'L1', korisnik_id: 'a', lat: 44.88001, lon: 16.15, t: new Date(t0 + 10000).toISOString() });
  assert.equal(s.by.a.length, 1, 'manje od 15 m i manje od 90 s: ne pamti se');
  s = crumbsAdd(s, { lov_id: 'L1', korisnik_id: 'a', lat: 44.8805, lon: 16.15, t: new Date(t0 + 20000).toISOString() });
  assert.equal(s.by.a.length, 2);
  const same = crumbsAdd(s, { lov_id: 'L1', korisnik_id: 'a', lat: 44.89, lon: 16.15, t: new Date(t0).toISOString() });
  assert.equal(same, s, 'starija tačka se odbacuje');
  const novi = crumbsAdd(s, { lov_id: 'L2', korisnik_id: 'a', lat: 44.88, lon: 16.15, t: new Date(t0).toISOString() });
  assert.equal(novi.lov, 'L2');
  assert.equal(novi.by.a.length, 1);
});
test('trag člana: server + mrvice bez duplikata, po vremenu; dužina', () => {
  const m = mergeMemberTrail(
    [{ lat: 44.88, lon: 16.15, t: '2026-11-20T08:00:00Z' }, { lat: 44.881, lon: 16.15, t: '2026-11-20T08:01:00Z' }],
    [{ lat: 44.881, lon: 16.15, t: Date.parse('2026-11-20T08:01:00Z') }, { lat: 44.882, lon: 16.15, t: Date.parse('2026-11-20T08:02:00Z') }],
  );
  assert.equal(m.length, 3);
  assert.ok(m[0].t < m[1].t && m[1].t < m[2].t);
  assert.ok(trailMeters(m) > 200 && trailMeters(m) < 260);
});
