import test from 'node:test';
import assert from 'node:assert/strict';
import { slopeGrid, slopeClass, demRegion, cellSizeM, tileCenterLat, normalizeSlopeSettings, legendText, elevationsFromRgba } from '../../static/js/nagib.js';

const plane = (cell, deg) => {
  const e = new Float32Array(256 * 256);
  const rise = Math.tan((deg * Math.PI) / 180) * cell; // visina po pikselu prema istoku
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) e[y * 256 + x] = 500 + x * rise;
  return e;
};

test('nagib ravni poznatog nagiba se vraća (Horn), na sredini pločice', () => {
  const cell = cellSizeM(44.9);
  for (const deg of [0, 10, 30, 45, 60]) {
    const g = slopeGrid(plane(cell, deg), cell);
    assert.equal(g[128 * 256 + 128], deg, `${deg}°`);
  }
});

test('veličina ćelije i širina pločice: ~13,5 m na 44,9° N', () => {
  assert.ok(Math.abs(cellSizeM(44.9) - 13.55) < 0.1);
  assert.ok(Math.abs(tileCenterLat(Math.floor(((1 - Math.log(Math.tan(44.9 * Math.PI / 180) + 1 / Math.cos(44.9 * Math.PI / 180)) / Math.PI) / 2) * 8192)) - 44.9) < 0.05);
});

test('klase iznad praga: ispod praga ništa, pa žuta/narandžasta/crvena/ljubičasta', () => {
  assert.deepEqual([29, 30, 34, 35, 39, 40, 44, 45, 80].map((d) => slopeClass(d, 30)), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.equal(slopeClass(24, 25), 0);
  assert.equal(slopeClass(25, 25), 1);
  assert.equal(slopeClass(NaN, 30), 0);
});

test('pločica karte na zoomu iznad 13 pokriva dio jedne DEM pločice', () => {
  assert.deepEqual(demRegion(13, 4500, 2900), { dx: 4500, dy: 2900, sx: 0, sy: 0, sw: 256 });
  assert.deepEqual(demRegion(15, 4 * 4500 + 3, 4 * 2900 + 1), { dx: 4500, dy: 2900, sx: 192, sy: 64, sw: 64 });
  assert.equal(demRegion(16, 8 * 10 + 7, 0).sw, 32);
});

test('postavke: zadano isključeno, prag 30; neispravan prag se vraća na 30', () => {
  assert.deepEqual(normalizeSlopeSettings(null), { on: false, prag: 30 });
  assert.deepEqual(normalizeSlopeSettings({ on: true, prag: 35 }), { on: true, prag: 35 });
  assert.deepEqual(normalizeSlopeSettings({ on: 'da', prag: 31 }), { on: false, prag: 30 });
  assert.equal(legendText(30), '30–35° · 35–40° · 40–45° · 45° i više');
  // Terrarium dekodiranje: R=128,G=0,B=0 → 0 m
  assert.equal(elevationsFromRgba(new Uint8ClampedArray([128, 0, 0, 255].concat(new Array(65535 * 4).fill(0))))[0], 0);
});
