import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearing, compassName, formatBearing } from '../../static/js/geo.js';
import { activeSorted, lookupNaziv, DEFAULT_SPISKOVI } from '../../static/js/spiskovi.js';
import { newRecord, bumpRecord } from '../../static/js/zapisi.js';
import { sortByDistance, needsRepair, STANJA } from '../../static/js/objekti.js';

test('azimut između tačaka', () => {
  const a = { lat: 44.88, lon: 16.15 };
  assert.ok(Math.abs(bearing(a, { lat: 44.89, lon: 16.15 }) - 0) < 0.5);
  assert.ok(Math.abs(bearing(a, { lat: 44.88, lon: 16.16 }) - 90) < 0.5);
  assert.ok(Math.abs(bearing(a, { lat: 44.87, lon: 16.15 }) - 180) < 0.5);
  assert.ok(Math.abs(bearing(a, { lat: 44.88, lon: 16.14 }) - 270) < 0.5);
});

test('strane svijeta na bosanskom', () => {
  assert.equal(compassName(0), 'S');
  assert.equal(compassName(44), 'SI');
  assert.equal(compassName(90), 'I');
  assert.equal(compassName(225), 'JZ');
  assert.equal(compassName(350), 'S');
  assert.equal(formatBearing(42.4), 'SI 42°');
});

test('spisak: aktivni po redoslijedu; sklonjen zadržava naziv za stare zapise', () => {
  const rows = [
    { kod: 'b', naziv: 'B', redoslijed: 20, aktivno: true },
    { kod: 'a', naziv: 'A', redoslijed: 10, aktivno: true },
    { kod: 'x', naziv: 'Sklonjen', redoslijed: 5, aktivno: false },
  ];
  assert.deepEqual(activeSorted(rows).map((r) => r.kod), ['a', 'b']);
  assert.equal(lookupNaziv(rows, 'x'), 'Sklonjen');
  assert.equal(lookupNaziv(rows, 'nepoznat'), 'nepoznat');
  assert.ok(DEFAULT_SPISKOVI.objekat_vrste.length >= 10, 'zadani spisak objekata dok server ne odgovori');
  assert.deepEqual(DEFAULT_SPISKOVI.lovostaj, [], 'propisi se ne zakucavaju u kod');
  assert.deepEqual(DEFAULT_SPISKOVI.lovno_vrijeme, []);
});

test('nov zapis: klijentski UUID, privatno kao zadano, rev raste pri izmjeni', () => {
  const r = newRecord({ naziv: 'x' }, 1000);
  assert.match(r.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(r.vidljivost, 'privatno');
  assert.deepEqual(r.dijeli_sa, []);
  assert.equal(r.rev, 1);
  const b = bumpRecord(r, { naziv: 'y' }, 2000);
  assert.equal(b.rev, 2);
  assert.equal(b.updated_at, 2000);
  assert.equal(b.created_at, 1000);
  assert.equal(b.sinhronizovano, false);
});

test('objekti: treba popravka i sortiranje po udaljenosti', () => {
  assert.deepEqual(Object.keys(STANJA), ['ispravno', 'popravka', 'sruseno']);
  assert.equal(needsRepair({ stanje: 'ispravno' }), false);
  assert.equal(needsRepair({ stanje: 'popravka' }), true);
  assert.equal(needsRepair({ stanje: 'sruseno' }), true);
  const me = { lat: 44.88, lon: 16.15 };
  const s = sortByDistance([{ id: 'daleko', lat: 44.95, lon: 16.15 }, { id: 'blizu', lat: 44.881, lon: 16.15 }], me);
  assert.deepEqual(s.map((o) => o.id), ['blizu', 'daleko']);
  assert.ok(s[0].udaljenost < 200);
});

import { fitSize } from '../../static/js/foto.js';

test('slika se smanjuje na najviše 1600 px po dužoj strani, ne uvećava se', () => {
  assert.deepEqual(fitSize(4000, 3000), { w: 1600, h: 1200 });
  assert.deepEqual(fitSize(3000, 4000), { w: 1200, h: 1600 });
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 });
});
