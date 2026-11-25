import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MINIRANO_ID, MINIRANO_STIL, needsRefresh, buildLayer, areaText, popupLines, minefieldStatusText, downloadErrorText, OSVJEZI_NAKON_MS, isMinefieldLayer,
} from '../../static/js/minirano.js';
import { readFileSync } from 'node:fs';

const poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[16, 45], [16.1, 45], [16.1, 45.1], [16, 45]]] }, properties: { podaci: { SHAPE_Area: '2777768.5' } } };
const gj = { type: 'FeatureCollection', features: [poly, { type: 'Feature', geometry: { type: 'Point', coordinates: [16, 45] }, properties: {} }] };

test('stil: crvena popuna sa 60 % neprozirnosti (odluka vlasnika) i crvena linija', () => {
  assert.equal(MINIRANO_STIL.popunaOpacity, 0.6);
  assert.equal(MINIRANO_STIL.popuna, true);
  assert.match(MINIRANO_STIL.boja, /^#d[0-9a-f]0000$/i);
});

test('sloj: samo poligoni, stalni id, vrijeme preuzimanja; prazan fajl se odbija', () => {
  const l = buildLayer(gj, 1000);
  assert.equal(l.id, MINIRANO_ID);
  assert.equal(l.izvor, 'bhmac');
  assert.equal(l.geojson.features.length, 1);
  assert.equal(l.preuzeto, 1000);
  assert.ok(isMinefieldLayer(l));
  assert.throws(() => buildLayer({ features: [] }), /nema minskih/);
});

test('lovac može sakriti sloj, a ponovno preuzimanje to pamti i ne vraća boju/popunu', () => {
  const l = buildLayer(gj, 2000, { stil: { vidljiv: false, boja: '#00ff00', popunaOpacity: 0.1 } });
  assert.equal(l.stil.vidljiv, false);
  assert.equal(l.stil.boja, MINIRANO_STIL.boja);
  assert.equal(l.stil.popunaOpacity, 0.6);
});

test('osvježavanje: nema sloja ili je starije od sedmice', () => {
  const l = buildLayer(gj, 1000);
  assert.equal(needsRefresh(null), true);
  assert.equal(needsRefresh(l, 1000 + OSVJEZI_NAKON_MS - 1), false);
  assert.equal(needsRefresh(l, 1000 + OSVJEZI_NAKON_MS + 1), true);
});

test('tekstovi: površina, stanje i greške (404 = još nije objavljeno)', () => {
  assert.equal(areaText('2777768.5'), '2,78 km²');
  assert.equal(areaText('5000'), '0,5 ha');
  assert.equal(areaText(''), '');
  assert.deepEqual(popupLines(poly.properties), ['Površina oko 2,78 km²']);
  assert.match(minefieldStatusText(null), /Još nije preuzeto/);
  assert.match(minefieldStatusText(buildLayer(gj, 0), 3 * 86400000), /1 područja · preuzeto prije 3 dana/);
  assert.match(downloadErrorText(404), /još nisu objavljeni/);
  assert.match(downloadErrorText(0, 'timeout'), /Nema veze/);
});

test('sloj se ne pakuje u APK: nema KML-a u static/ ni assets, a izvor je grana podaci', () => {
  const cfg = readFileSync('static/js/config.js', 'utf8');
  assert.match(cfg, /MINIRANO_URL = `https:\/\/raw\.githubusercontent\.com\/\$\{GITHUB_REPO\}\/podaci\/minirano\.kml`/);
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  assert.doesNotMatch(gradle, /minirano/i);
});
