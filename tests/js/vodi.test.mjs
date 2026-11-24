import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walkEta, trendOf, arrivalState } from '../../static/js/vodi.js';

test('walkEta: 3 km/h, minute i sati, bez procjene kad si stigao', () => {
  assert.equal(walkEta(10), '');
  assert.equal(walkEta(500), '≈ 10 min hoda');
  assert.equal(walkEta(20), '≈ 1 min hoda');
  assert.equal(walkEta(3000), '≈ 1 h hoda');
  assert.equal(walkEta(4000), '≈ 1 h 20 min hoda');
  assert.equal(walkEta(NaN), '');
});

test('trendOf: šum GPS-a nije kretanje', () => {
  assert.equal(trendOf(500, 495, 10), 'isto');
  assert.equal(trendOf(500, 480, 10), 'blize');
  assert.equal(trendOf(500, 520, 10), 'dalje');
  assert.equal(trendOf(500, 470, 50), 'isto'); // loša tačnost: prag 30 m
  assert.equal(trendOf(undefined, 400), 'nepoznato');
});

test('arrivalState', () => {
  assert.equal(arrivalState(10), 'stigao');
  assert.equal(arrivalState(60), 'blizu');
  assert.equal(arrivalState(600), 'daleko');
  assert.equal(arrivalState(null), 'ceka');
});
