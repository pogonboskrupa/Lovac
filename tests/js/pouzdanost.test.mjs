import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reliabilityItems, needsAttention } from '../../static/js/pouzdanost.js';

test('bez aplikacije: samo napomena, nikad izmišljeno stanje', () => {
  const r = reliabilityItems({ hasBridge: false, notif: null, battery: null });
  assert.equal(r.length, 1);
  assert.equal(r[0].stanje, 'nepoznato');
  assert.equal(needsAttention(r), false);
});
test('isključene obavijesti i uključena optimizacija baterije traže pažnju', () => {
  const r = reliabilityItems({ hasBridge: true, notif: false, battery: false });
  assert.deepEqual(r.map((i) => i.stanje), ['upozorenje', 'upozorenje']);
  assert.equal(needsAttention(r), true);
  assert.match(r[1].tekst, /prekinuti snimanje traga/);
});
test('sve uredu: ok', () => {
  const r = reliabilityItems({ hasBridge: true, notif: true, battery: true });
  assert.deepEqual(r.map((i) => i.stanje), ['ok', 'ok']);
  assert.equal(needsAttention(r), false);
});
test('nepročitano stanje senzora je "nepoznato", ne upozorenje', () => {
  const r = reliabilityItems({ hasBridge: true, notif: null, battery: true });
  assert.equal(r[0].stanje, 'nepoznato');
  assert.equal(needsAttention(r), false);
});
