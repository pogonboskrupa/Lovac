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

import { tilesForBounds, estimateDownload, MAX_PREDOWNLOAD_TILES, PREDOWNLOAD_ALLOWED } from '../../static/js/tiles.js';

test('pločice za područje: x/y po zoomu, uključujući rubove', () => {
  const b = { south: 44.87, west: 16.14, north: 44.89, east: 16.16 };
  const t13 = tilesForBounds(b, 13, 13);
  assert.ok(t13.length >= 1 && t13.length <= 4, String(t13.length));
  assert.ok(t13.every((t) => t.z === 13));
  const t13to15 = tilesForBounds(b, 13, 15);
  assert.ok(t13to15.length > t13.length);
  assert.deepEqual(tilesForBounds(b, 13, 13), t13, 'deterministično');
});

test('procjena preuzimanja i granica; OSM se ne smije masovno preuzimati', () => {
  const e = estimateDownload(1000);
  assert.equal(e.plocica, 1000);
  assert.match(e.velicina, /MB$/);
  assert.equal(MAX_PREDOWNLOAD_TILES, 2500);
  assert.equal(PREDOWNLOAD_ALLOWED.includes('osm'), false);
  assert.ok(PREDOWNLOAD_ALLOWED.includes('topo'));
});

import { parseBounds, layerOptions, mbtilesUrl } from '../../static/js/karte-ui.js';

test('offline karta: granice i opcije sloja (ispod min zooma se ne traži ništa)', () => {
  assert.deepEqual(parseBounds('15.9,44.7,16.4,45.0'), [[44.7, 15.9], [45, 16.4]]);
  assert.equal(parseBounds('x'), null);
  const o = layerOptions({ minzoom: 12, maxzoom: 15, bounds: '15.9,44.7,16.4,45.0' });
  assert.equal(o.minZoom, 12, 'sloj se ne prikazuje ispod najnižeg nivoa u fajlu');
  assert.equal(o.minNativeZoom, 12);
  assert.equal(o.maxNativeZoom, 15);
  assert.deepEqual(o.bounds, [[44.7, 15.9], [45, 16.4]]);
  assert.equal(mbtilesUrl('a b.mbtiles'), 'https://appassets.androidplatform.net/mbtiles/a%20b.mbtiles/{z}/{x}/{y}');
});
