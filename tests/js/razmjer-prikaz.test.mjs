import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMapDisplay, detailVisible, rawScale, scaleChoiceLabel, RAZMJER_ZADANO } from '../../static/js/razmjer-prikaz.js';

const LAT = 44.88; // Bosanska Krupa

test('zadano: do 1:12 500, ograničene su slike, tragovi i tačke', () => {
  assert.deepEqual(normalizeMapDisplay(null), { razmjer: RAZMJER_ZADANO, slike: true, tragovi: true, tacke: true });
  assert.deepEqual(normalizeMapDisplay({ razmjer: 777, slike: false }), { razmjer: 12500, slike: false, tragovi: true, tacke: true });
});

test('zoom 15 (~1:12 800) se računa kao 1:12 500, zoom 14 (~1:25 600) ne', () => {
  assert.ok(Math.abs(rawScale(LAT, 15) - 12_800) < 300);
  assert.equal(detailVisible('slike', LAT, 15), true);
  assert.equal(detailVisible('slike', LAT, 14), false);
  assert.equal(detailVisible('tacke', LAT, 17), true);
});

test('korisnik bira razmjer, "Uvijek" i isključenje ograničenja za jednu vrstu', () => {
  assert.equal(detailVisible('tragovi', LAT, 14, { razmjer: 25000 }), true);
  assert.equal(detailVisible('tragovi', LAT, 13, { razmjer: 25000 }), false);
  assert.equal(detailVisible('tragovi', LAT, 8, { razmjer: 0 }), true);
  assert.equal(detailVisible('slike', LAT, 10, { slike: false }), true);
  assert.equal(detailVisible('tacke', LAT, 10, { slike: false }), false);
  assert.equal(scaleChoiceLabel(12500), '1:12 500');
  assert.equal(scaleChoiceLabel(0), 'Uvijek');
});
