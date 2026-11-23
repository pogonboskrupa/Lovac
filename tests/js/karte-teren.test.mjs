import test from 'node:test';
import assert from 'node:assert/strict';
import { terenView } from '../../static/js/karte-ui.js';

const INFO = { minzoom: 12, maxzoom: 16, bounds: '15.780000,44.740000,16.500000,45.140000' };

test('Teren: ispod najnižeg nivoa fajla karta se približi (inače je prazna)', () => {
  assert.deepEqual(terenView(INFO, 9, { lat: 44.9, lng: 16.1 }), { minZoom: 12, zoom: 12, fit: null });
  assert.deepEqual(terenView(INFO, 14, { lat: 44.9, lng: 16.1 }), { minZoom: 12, zoom: null, fit: null });
});

test('Teren: centar van granica fajla vodi na područje karte', () => {
  const v = terenView(INFO, 14, { lat: 43.85, lng: 18.4 });
  assert.deepEqual(v.fit, [[44.74, 15.78], [45.14, 16.5]]);
});
