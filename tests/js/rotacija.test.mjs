import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchAngle, rotateBy, rotationForHeading, upBearing, gestureDelta, mapTransformCss } from '../../static/js/rotacija.js';

test('ugao dva dodira', () => {
  assert.equal(touchAngle({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  assert.equal(touchAngle({ x: 0, y: 0 }, { x: 0, y: 10 }), 90);
});
test('okretanje se vraća u 0–360', () => {
  assert.equal(rotateBy(350, 20), 10);
  assert.equal(rotateBy(10, -20), 350);
});
test('karta prati smjer gledanja: heading gore', () => {
  assert.equal(rotationForHeading(90), 270);
  assert.equal(upBearing(270), 90, 'gore na ekranu je smjer 90°');
  assert.equal(upBearing(rotationForHeading(135)), 135);
});
test('gest preko ±180° ne skače', () => {
  assert.equal(gestureDelta(170, -170), 20);
  assert.equal(gestureDelta(-170, 170), -20);
});
test('CSS transform nosi nagib, rotaciju i razmjer', () => {
  assert.equal(mapTransformCss(15), 'perspective(900px) rotateX(40deg) rotateZ(15deg) scale(1.6)');
});
