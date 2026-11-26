import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampScale, containedSize, clampPan, zoomAt, doubleTap, distance, midpoint, transformCss, MAX_SCALE } from '../../static/js/slika-zoom.js';

const box = { iw: 400, ih: 300, vw: 400, vh: 800 };

test('razmjera je ograničena na 1–6', () => {
  assert.equal(clampScale(0.3), 1);
  assert.equal(clampScale(99), MAX_SCALE);
});

test('containedSize: slika se uklapa u element', () => {
  assert.deepEqual(containedSize(400, 800, 4000, 3000), { w: 400, h: 300 });
  assert.deepEqual(containedSize(800, 400, 3000, 4000), { w: 300, h: 400 });
});

test('clampPan: uvećana slika se pomjera samo do ruba, manja od ekrana stoji u sredini', () => {
  const p = clampPan(2, 999, 999, box); // širina 800 > 400 → ±200; visina 600 < 800 → 0
  assert.deepEqual(p, { tx: 200, ty: 0 });
  assert.deepEqual(clampPan(1, 50, 50, box), { tx: 0, ty: 0 });
});

test('zoomAt: tačka ispod prstiju ostaje na mjestu', () => {
  const s0 = { scale: 1, tx: 0, ty: 0 };
  const s1 = zoomAt(s0, 2, 100, 0, { iw: 400, ih: 800, vw: 400, vh: 800 });
  // tačka na x=100 prije: 100; poslije: 100*2 + tx = 100 → tx = -100
  assert.equal(s1.scale, 2);
  assert.equal(s1.tx, -100);
});

test('doubleTap: uvećava, drugi put vraća na cijelu sliku', () => {
  const b = { iw: 400, ih: 800, vw: 400, vh: 800 };
  const z = doubleTap({ scale: 1, tx: 0, ty: 0 }, 0, 0, b);
  assert.equal(z.scale, 2.5);
  assert.deepEqual(doubleTap(z, 0, 0, b), { scale: 1, tx: 0, ty: 0 });
});

test('pomoćne: distance, midpoint, transformCss', () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.deepEqual(midpoint({ x: 0, y: 0 }, { x: 4, y: 2 }), { x: 2, y: 1 });
  assert.equal(transformCss({ scale: 1, tx: 0, ty: 0 }), '');
  assert.match(transformCss({ scale: 2, tx: 5, ty: -3 }), /translate\(5px, -3px\) scale\(2\)/);
});
