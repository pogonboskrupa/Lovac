import test from 'node:test';
import assert from 'node:assert/strict';
import { fraction, arcPoint, arcPath, dayArc, LUK } from '../../static/js/svjetlo-luk.js';

const sun = { svitanje: 0, izlazak: 100, zalazak: 900, suton: 1000 };

test('fraction: unutar raspona, stezanje na rubove, neispravan raspon', () => {
  assert.equal(fraction(250, 0, 1000), 0.25);
  assert.equal(fraction(-5, 0, 1000), 0);
  assert.equal(fraction(2000, 0, 1000), 1);
  assert.equal(fraction(5, null, 1000), null);
  assert.equal(fraction(5, 10, 10), null);
});

test('arcPoint: krajevi na horizontu, sredina najviša', () => {
  const a = arcPoint(0); const m = arcPoint(0.5); const z = arcPoint(1);
  assert.ok(Math.abs(a.y - LUK.baza) < 1e-9 && Math.abs(z.y - LUK.baza) < 1e-9);
  assert.equal(a.x, LUK.rub);
  assert.equal(z.x, LUK.sirina - LUK.rub);
  assert.ok(Math.abs(m.y - (LUK.baza - LUK.uspon)) < 1e-9);
});

test('arcPath: počinje u M i ima koraka+1 tačaka', () => {
  const d = arcPath(0, 1, LUK, 10);
  assert.ok(d.startsWith('M'));
  assert.equal(d.split(' L').length, 11);
});

test('dayArc: udjeli, sada unutar i izvan dana, nepoznato', () => {
  assert.deepEqual(dayArc(500, sun), { izlazak: 0.1, zalazak: 0.9, podne: 0.5, sada: 0.5, izvan: false });
  assert.equal(dayArc(-1, sun).izvan, true);
  assert.equal(dayArc(-1, sun).sada, 0);
  assert.equal(dayArc(1500, sun).sada, 1);
  assert.equal(dayArc(5, { ...sun, izlazak: null }), null);
  assert.equal(dayArc(5, null), null);
});

test('arcPoint: vrh luka je u podne, ne u sredini dana', () => {
  const vrh = 0.4;
  const najvisa = Array.from({ length: 101 }, (_, i) => i / 100).map((f) => ({ f, y: arcPoint(f, LUK, vrh).y }))
    .reduce((m, p) => (p.y < m.y ? p : m));
  assert.ok(Math.abs(najvisa.f - vrh) < 0.011);
  assert.ok(Math.abs(arcPoint(vrh, LUK, vrh).y - (LUK.baza - LUK.uspon)) < 1e-9);
  // krajevi ostaju na horizontu
  assert.ok(Math.abs(arcPoint(0, LUK, vrh).y - LUK.baza) < 1e-9 && Math.abs(arcPoint(1, LUK, vrh).y - LUK.baza) < 1e-9);
});

test('dayArc: udio podneva iz sun.podne', () => {
  assert.equal(dayArc(500, { ...sun, podne: 400 }).podne, 0.4);
  assert.equal(dayArc(500, { ...sun, podne: null }).podne, 0.5);
});
