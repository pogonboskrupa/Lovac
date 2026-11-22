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

import { screenDragToPan } from '../../static/js/rotacija.js';

test('pomak prsta: karta prati prst, centar ide suprotno (bez rotacije)', () => {
  const [x, y] = screenDragToPan(16, 0, 0, { tilt: 0, scale: 1 });
  assert.equal(Math.round(x), -16);
  assert.equal(Math.round(y) + 0, 0);
});
test('pomak prsta uzima u obzir razmjer i nagib', () => {
  const [, y] = screenDragToPan(0, 10, 0, { tilt: 60, scale: 2 });
  assert.equal(Math.round(y * 100) / 100, -10, 'dy 10 / cos60 (=20) / scale 2 = 10, suprotan smjer');
});
test('rotirana karta (90°): prst udesno pomjera centar prema "jugu" karte', () => {
  const [x, y] = screenDragToPan(10, 0, 90, { tilt: 0, scale: 1 });
  assert.equal(Math.round(x) + 0, 0);
  assert.equal(Math.round(y), 10);
});
