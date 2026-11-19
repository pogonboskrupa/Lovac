import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImageResponse } from '../../static/js/tiles.js';
import { isNewer, parseVersion } from '../../static/js/update.js';
import { headingFromAlpha } from '../../static/js/gps.js';

const resp = (status, ct) => ({ ok: status >= 200 && status < 300, status, headers: new Headers({ 'content-type': ct }) });

test('200 koji nije slika se ne kešira kao pločica', () => {
  assert.equal(isImageResponse(resp(200, 'image/png')), true);
  assert.equal(isImageResponse(resp(200, 'application/vnd.ogc.se_xml')), false);
  assert.equal(isImageResponse(resp(200, 'text/html')), false);
  assert.equal(isImageResponse(resp(404, 'image/png')), false);
});

test('poređenje verzija', () => {
  assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
  assert.equal(isNewer('v1.2.0', 'v1.1.9'), true);
  assert.equal(isNewer('v1.1.9', 'v1.2.0'), false);
  assert.equal(isNewer('v1.1.9', 'v1.1.9'), false);
  assert.equal(isNewer('smeće', 'v1.0.0'), false);
});

test('azimut iz kompasa', () => {
  assert.equal(headingFromAlpha(0), 0);
  assert.equal(headingFromAlpha(90), 270);
  assert.equal(headingFromAlpha(90, 90), 0);
  assert.equal(headingFromAlpha(null), null);
});

import { fetchLatestVersion, shouldUseServiceWorker } from '../../static/js/update.js';

const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('nova verzija: prvo version.json, a GitHub API samo kao rezerva', async () => {
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(String(url)); return jsonRes(200, { verzija: 'v0.2.0' }); };
  assert.equal(await fetchLatestVersion(), 'v0.2.0');
  assert.match(urls[0], /raw\.githubusercontent\.com\/.+\/verzija\/version\.json/);
  assert.equal(urls.length, 1);
});

test('nova verzija: kad version.json padne, ide GitHub API', async () => {
  globalThis.fetch = async (url) => (String(url).includes('raw.githubusercontent')
    ? jsonRes(404, {}) : jsonRes(200, { tag_name: 'v0.3.1' }));
  assert.equal(await fetchLatestVersion(), 'v0.3.1');
});

test('nova verzija: oba izvora padnu (npr. limit 403 na mobilnoj mreži) -> greška, ne "nema nove"', async () => {
  globalThis.fetch = async () => jsonRes(403, { message: 'rate limit' });
  await assert.rejects(fetchLatestVersion(), /403/);
});

test('service worker se ne koristi u APK-u (inače servira staru verziju nakon instalacije)', () => {
  assert.equal(shouldUseServiceWorker({ hostname: 'appassets.androidplatform.net' }, false), false);
  assert.equal(shouldUseServiceWorker({ hostname: 'localhost' }, true), false);
  assert.equal(shouldUseServiceWorker({ hostname: 'pogonboskrupa.github.io' }, false), true);
});
