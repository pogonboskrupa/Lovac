import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myAssignment, sectorsForStand, nextStandNumber, todaysHunts, headingCheck, KOMPAS_TOLERANCIJA } from '../../static/js/lov.js';
import { destination } from '../../static/js/vjetar.js';

const S1 = { id: 's1', broj: 1, lat: 44.88, lon: 16.15, korisnik_id: 'u1' };
const S2 = { id: 's2', broj: 2, ...destination(S1, 90, 300), korisnik_id: 'u2' };
const DATA = {
  lov: { id: 'l1', datum: '2026-12-05', status: 'u_toku' },
  ucesnici: [{ korisnik_id: 'u1', uloga: 'strijelac' }, { korisnik_id: 'u2', uloga: 'strijelac' }, { korisnik_id: 'p1', uloga: 'pogonic' }],
  stanovi: [S1, S2],
  sektori: [{ stan_id: 's1', od_azimut: 340, do_azimut: 15, razlog: 'Selo' }, { stan_id: 's2', od_azimut: 180, do_azimut: 200, razlog: 'Put' }],
};

test('moj raspored: stan i uloga', () => {
  assert.deepEqual(myAssignment(DATA, 'u1'), { uloga: 'strijelac', stan: S1 });
  assert.deepEqual(myAssignment(DATA, 'p1'), { uloga: 'pogonic', stan: null });
  assert.equal(myAssignment(DATA, 'nepoznat'), null);
});

test('sektori stana: drugi stanovi + samo SVOJI ručni sektori', () => {
  const s = sectorsForStand(S1, DATA);
  assert.ok(s.razlozi.some((r) => /Stan 2/.test(r)));
  assert.ok(s.razlozi.some((r) => /Selo/.test(r)));
  assert.ok(!s.razlozi.some((r) => /Put/.test(r)), 'sektor drugog stana se ne primjenjuje na ovaj');
});

test('sljedeći broj stana', () => {
  assert.equal(nextStandNumber([]), 1);
  assert.equal(nextStandNumber([{ broj: 1 }, { broj: 4 }]), 5);
});

test('lovovi za danas (ne završeni)', () => {
  const list = [
    { id: 'a', datum: '2026-12-05', status: 'planiran' },
    { id: 'b', datum: '2026-12-05', status: 'zavrsen' },
    { id: 'c', datum: '2026-12-06', status: 'planiran' },
  ];
  assert.deepEqual(todaysHunts(list, new Date(2026, 11, 5, 9)).map((l) => l.id), ['a']);
});

test('kompas: zabranjeno uz toleranciju nesigurnosti kompasa (sigurnija strana)', () => {
  const s = sectorsForStand(S1, DATA).lukovi;
  assert.equal(headingCheck(null, s), 'nepoznato');
  assert.equal(headingCheck(90, s), 'zabranjeno', 'pravac prema stanu 2');
  assert.equal(headingCheck(0, s), 'zabranjeno', 'selo');
  assert.equal(headingCheck(250, s), 'dozvoljeno');
  // Blizu granice (unutar tolerancije kompasa) se smatra zabranjenim.
  const edge = 15 + KOMPAS_TOLERANCIJA - 1;
  assert.equal(headingCheck(edge, s), 'zabranjeno');
});
