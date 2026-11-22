import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, addDogPoint, dogAge, dogSummary, MAX_DOG_POINTS } from '../../static/js/pas.js';
import { normalizeVelicina } from '../../static/js/prikaz.js';
import { wgs84ToGk } from '../../static/js/geo.js';

const near = (p, lat, lon, tol = 1e-4) => assert.ok(p.lat !== undefined && Math.abs(p.lat - lat) < tol && Math.abs(p.lon - lon) < tol, JSON.stringify(p));

test('pas: čitanje lokacije iz različitih zapisa', () => {
  near(parseLocation('44.88123, 16.15321'), 44.88123, 16.15321);
  near(parseLocation('Pas Rex: 44.88123,16.15321 baterija 80%'), 44.88123, 16.15321);
  near(parseLocation('https://maps.google.com/?q=44.88123,16.15321'), 44.88123, 16.15321);
  near(parseLocation('https://www.google.com/maps/place/x/@44.88123,16.15321,17z'), 44.88123, 16.15321);
  near(parseLocation('https://maps.apple.com/?ll=44.88123,16.15321&q=Dog'), 44.88123, 16.15321);
  near(parseLocation('geo:44.88123,16.15321'), 44.88123, 16.15321);
  near(parseLocation('https://www.openstreetmap.org/#map=17/44.88123/16.15321'), 44.88123, 16.15321);
  near(parseLocation('N 44.88123 E 16.15321'), 44.88123, 16.15321);
  near(parseLocation("44°52.874' N 16°09.193' E"), 44.88123, 16.15322, 2e-4);
  near(parseLocation('44°52\'52.4"N 16°09\'11.6"E'), 44.88122, 16.15322, 2e-4);
  near(parseLocation('44.88123 N, 16.15321 E'), 44.88123, 16.15321);
  near(parseLocation('44,88123; 16,15321'), 44.88123, 16.15321);
  near(parseLocation('16.15321, 44.88123'), 44.88123, 16.15321); // zamijenjen redoslijed
  const gk = wgs84ToGk(5, 44.88123, 16.15321);
  near(parseLocation(`Y ${Math.round(gk.e)} X ${Math.round(gk.n)}`), 44.88123, 16.15321, 2e-4);
  near(parseLocation(`MGI 5 Y ${Math.round(gk.e)}, X ${Math.round(gk.n)}`), 44.88123, 16.15321, 2e-4);
});

test('pas: neispravan unos i kratki linkovi daju razumljivu grešku', () => {
  assert.match(parseLocation('').greska, /Zalijepi/);
  assert.match(parseLocation('nema ništa').greska, /Ne prepoznajem/);
  assert.match(parseLocation('https://maps.app.goo.gl/abc123').greska, /Kratki link/);
  assert.match(parseLocation('0.000000, 0.000000').greska, /Ne prepoznajem/);
});

test('pas: historija pozicija i starost podatka', () => {
  let pts = [];
  pts = addDogPoint(pts, { lat: 44.88, lon: 16.15 }, 1000);
  pts = addDogPoint(pts, { lat: 44.88, lon: 16.15 }, 2000); // ista tačka se ne dodaje
  assert.equal(pts.length, 1);
  for (let i = 0; i < 60; i++) pts = addDogPoint(pts, { lat: 44.9 + i / 1000, lon: 16.2 }, 3000 + i);
  assert.equal(pts.length, MAX_DOG_POINTS);
  const now = 10 * 60000 + 5000;
  assert.deepEqual(dogAge(0, now), { min: 10, text: 'prije 10 min', zastarjelo: false });
  assert.equal(dogAge(0, 11 * 60000).zastarjelo, true);
  assert.equal(dogAge(0, 90 * 60000).text, 'prije 1 h 30 min');
  assert.equal(dogAge(now - 1000, now).text, 'upravo');
  assert.match(dogSummary({ lat: 44.88, lon: 16.15 }, { lat: 44.89, lon: 16.15, t: now - 5 * 60000 }, now), /^1,1 km S · prije 5 min$/);
  assert.equal(dogSummary(null, { lat: 1, lon: 1, t: now }, now), 'upravo');
  assert.equal(dogSummary(null, null), '');
});

test('veličina prikaza: nepoznata vrijednost je normalno', () => {
  assert.equal(normalizeVelicina('veliko'), 'veliko');
  assert.equal(normalizeVelicina('najvece'), 'najvece');
  assert.equal(normalizeVelicina('ogromno'), 'normalno');
  assert.equal(normalizeVelicina(null), 'normalno');
});

import { validateSlika, newSlika, sortSlike, pictureCategoryName, SLIKA_KATEGORIJE } from '../../static/js/slike.js';
test('slika na poziciji: provjera, zapis i redoslijed', () => {
  assert.deepEqual(Object.keys(SLIKA_KATEGORIJE), ['cekalo', 'objekat', 'ulov', 'ostalo']);
  assert.equal(pictureCategoryName('ulov'), 'Ulov');
  assert.equal(pictureCategoryName('nepoznato'), 'Drugo');
  const ok = { kategorija: 'cekalo', foto: 'f1', lat: 44.88, lon: 16.15, opis: '' };
  assert.equal(validateSlika(ok), null);
  assert.match(validateSlika({ ...ok, kategorija: 'x' }), /Izaberi/);
  assert.match(validateSlika({ ...ok, foto: null }), /fotografiju/);
  assert.match(validateSlika({ ...ok, lat: NaN }), /pozicije/);
  assert.match(validateSlika({ ...ok, opis: 'a'.repeat(301) }), /predug/);
  const s = newSlika({ id: 'i', kategorija: 'ulov', foto: 'f', mala: 'data:', lat: 1, lon: 2, opis: '  Divlja svinja ' }, 5000);
  assert.deepEqual(s, { id: 'i', kategorija: 'ulov', foto: 'f', mala: 'data:', lat: 1, lon: 2, opis: 'Divlja svinja', vrijeme: 5000 });
  assert.deepEqual(sortSlike([{ vrijeme: 1 }, { vrijeme: 3 }, { vrijeme: 2 }]).map((x) => x.vrijeme), [3, 2, 1]);
});

import { lovocuvarRevirIds, validateKamera, newKamera, mergeKamere, visibleKamere } from '../../static/js/kamere.js';
test('kamere: ko je lovočuvar, provjera unosa, spajanje lokalnog i servera', () => {
  const ctx = { lovocuvari: [{ korisnik_id: 'l1', revir_id: 'R1' }, { korisnik_id: 'l2', revir_id: 'R2' }], sekcije: [{ revir_id: 'R3', lovocuvar_id: 'l1' }] };
  assert.deepEqual(lovocuvarRevirIds('l1', ctx).sort(), ['R1', 'R3']);
  assert.deepEqual(lovocuvarRevirIds('g', ctx), []);
  assert.deepEqual(lovocuvarRevirIds(null, ctx), []);
  const ok = { revir_id: 'R1', naziv: 'Kamera Vrh', lat: 44.88, lon: 16.15 };
  assert.equal(validateKamera(ok), null);
  assert.match(validateKamera({ ...ok, revir_id: '' }), /revir/);
  assert.match(validateKamera({ ...ok, naziv: '  ' }), /naziv/);
  assert.match(validateKamera({ ...ok, lat: NaN }), /pozicije/);
  const k = newKamera({ id: 'k1', ...ok, napomena: '  ', autorId: 'l1' }, 1000);
  assert.deepEqual([k.sinhronizovano, k.aktivno, k.napomena], [false, true, null]);
  const merged = mergeKamere([{ ...k, naziv: 'lokalna' }, { id: 'k2', sinhronizovano: true, naziv: 'stara' }], [{ id: 'k1', naziv: 'server' }, { id: 'k2', naziv: 'server2' }]);
  assert.equal(merged.find((x) => x.id === 'k1').naziv, 'lokalna');
  assert.equal(merged.find((x) => x.id === 'k2').naziv, 'server2');
  assert.deepEqual(visibleKamere([{ id: 1 }, { id: 2, aktivno: false }]).map((x) => x.id), [1]);
});
