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
