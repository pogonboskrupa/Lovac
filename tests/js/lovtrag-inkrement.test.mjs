import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrailRows, nextTrailCursor } from '../../static/js/lovtrag.js';

const r = (u, min, extra = {}) => ({ korisnik_id: u, lat: 44 + min / 1000, lon: 16, t: new Date(Date.UTC(2026, 10, 23, 7, min)).toISOString(), ...extra });

test('spajanje keša i novih redova: bez duplikata, po vremenu, tačka iz offline bafera ulazi na svoje mjesto', () => {
  const cached = mergeTrailRows([], [r('a', 0), r('a', 2), r('b', 1)]);
  const out = mergeTrailRows(cached, [r('a', 2), r('a', 1), r('b', 3)]);
  assert.deepEqual(out.map((x) => `${x.korisnik_id}${new Date(x.t).getUTCMinutes()}`), ['a0', 'a1', 'b1', 'a2', 'b3']);
});

test('kursor po primljeno uz preklop od 15 s; bez kolone po t uz 15 min; bez novih redova ostaje', () => {
  const c = nextTrailCursor([r('a', 0, { primljeno: '2026-11-23T08:00:00Z' }), r('a', 1, { primljeno: '2026-11-23T08:05:00Z' })]);
  assert.deepEqual(c, { kolona: 'primljeno', v: '2026-11-23T08:04:45.000Z' });
  assert.equal(nextTrailCursor([], c), c);
  const t = nextTrailCursor([r('a', 30)]);
  assert.deepEqual(t, { kolona: 't', v: '2026-11-23T07:15:00.000Z' });
  // kursor nikad ne ide unazad
  assert.equal(nextTrailCursor([r('a', 20)], t), t);
});
