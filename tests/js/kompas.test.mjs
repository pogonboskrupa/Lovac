import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDelta, smoothHeading, roseRotation, headingText, headingSource } from '../../static/js/kompas.js';

test('razlika uglova ide najkraćim putem preko sjevera', () => {
  assert.equal(angleDelta(350, 10), 20);
  assert.equal(angleDelta(10, 350), -20);
  assert.equal(angleDelta(0, 180), 180);
});
test('glađenje ne prelazi preko 180° kad se smjer kreće 359° → 1°', () => {
  const v = smoothHeading(359, 1, 0.5);
  assert.ok(v === 0 || v > 359 || v < 1, `dobio ${v}`);
  assert.equal(smoothHeading(null, 90), 90);
  assert.equal(smoothHeading(90, NaN), 90);
});
test('ruža se okreće suprotno od smjera', () => {
  assert.equal(roseRotation(90), 270);
  assert.equal(roseRotation(0), 0);
  assert.equal(roseRotation(null), 0);
});
test('tekst i izvor smjera', () => {
  assert.equal(headingText(135), 'JI 135°');
  assert.equal(headingText(null), '—');
  assert.deepEqual(headingSource(10, 200), { stepeni: 10, izvor: 'kompas' });
  assert.deepEqual(headingSource(null, 200), { stepeni: 200, izvor: 'kretanje' });
  assert.deepEqual(headingSource(null, null), { stepeni: null, izvor: null });
});
