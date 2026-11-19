import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, keysToTrim } from '../../static/js/tiles.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('ograničenje: nikad više od max istovremenih zahtjeva', async () => {
  const lim = createLimiter(2);
  let active = 0;
  let max = 0;
  const task = async () => { active++; max = Math.max(max, active); await sleep(10); active--; return 1; };
  await Promise.all(Array.from({ length: 8 }, () => lim.run(task)));
  assert.equal(max, 2);
});

test('najnovije traženo ide prvo (pločice u vidnom polju, ne one koje su ostale iza)', async () => {
  const lim = createLimiter(1);
  const gate = deferred();
  const order = [];
  const p0 = lim.run(() => gate.promise.then(() => order.push('0')));
  const rest = ['a', 'b', 'c'].map((n) => lim.run(async () => { order.push(n); }));
  gate.resolve();
  await Promise.all([p0, ...rest]);
  assert.deepEqual(order, ['0', 'c', 'b', 'a']);
});

test('prekinut zahtjev u redu se nikad ne pokreće', async () => {
  const lim = createLimiter(1);
  const gate = deferred();
  let ran = false;
  const p0 = lim.run(() => gate.promise);
  const ctrl = new AbortController();
  const pA = lim.run(async () => { ran = true; }, ctrl.signal);
  ctrl.abort();
  await assert.rejects(pA, { name: 'AbortError' });
  gate.resolve();
  await p0;
  assert.equal(ran, false);
});

test('prekid prije ulaska u red odmah odbija', async () => {
  const lim = createLimiter(3);
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(lim.run(async () => 1, ctrl.signal), { name: 'AbortError' });
});

test('keš pločica se skraćuje od najstarijih', () => {
  assert.deepEqual(keysToTrim(['a', 'b', 'c', 'd'], 2), ['a', 'b']);
  assert.deepEqual(keysToTrim(['a', 'b'], 10), []);
});
