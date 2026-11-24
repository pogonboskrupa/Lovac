import test from 'node:test';
import assert from 'node:assert/strict';
import { shotHint, shotTime, sinceShotText, signsOf, signsPath, searchSummary, ishodNaziv, znakNaziv } from '../../static/js/potraga.js';

const T0 = Date.parse('2026-11-24T08:00:00Z');
const tr = {
  nastrijel: { lat: 44.88, lon: 16.15, t: T0, prije_min: 30, znakovi: ['krv_tamna'] },
  krv: [{ lat: 44.8812, lon: 16.1512, t: T0 + 600000, tip: 'dlaka' }, { lat: 44.8806, lon: 16.1506, t: T0 + 300000 }],
};

test('potraga: znakovi po vremenu (stari bez tipa su krv), putanja od nastrijela', () => {
  assert.deepEqual(signsOf(tr).map((s) => s.tip), ['krv', 'dlaka']);
  assert.deepEqual(signsPath(tr), [[44.88, 16.15], [44.8806, 16.1506], [44.8812, 16.1512]]);
  assert.deepEqual(signsPath({}), []);
});

test('potraga: vrijeme od pucnja uzima "prije koliko" i sažetak za panel', () => {
  assert.equal(shotTime(tr), T0 - 30 * 60000);
  assert.equal(sinceShotText(65 * 60000), '1 h 05 min');
  assert.equal(sinceShotText(12 * 60000), '12 min');
  const s = searchSummary(tr, { lat: 44.879, lon: 16.15 }, T0 + 40 * 60000);
  assert.match(s, /^nastrijel 1\d\d m S · znakova 2 · zadnji \d+ m · od pucnja 1 h 10 min$/);
  assert.equal(searchSummary(tr, null, T0).startsWith('znakova 2'), true, 'bez GPS-a bez udaljenosti');
});

test('potraga: orijentacioni savjet po znakovima, nazivi ishoda i znakova', () => {
  assert.match(shotHint(['krv_svijetla', 'sadrzaj']), /trbuh/, 'sadržaj buraga ima prednost (oprez)');
  assert.match(shotHint(['krv_svijetla']), /pluća/);
  assert.match(shotHint(['bez_znaka']), /ne znači promašaj/);
  assert.equal(shotHint([]), '');
  assert.equal(ishodNaziv('pronadjena'), 'Divljač pronađena');
  assert.equal(znakNaziv('lezaj'), 'Ležaj / zastoj');
  assert.equal(znakNaziv(undefined), 'Krv');
});
