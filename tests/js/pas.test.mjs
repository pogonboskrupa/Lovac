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

import { shouldRecordPoint, pushPoint, groupTrails, trailColor, withLocalPoints } from '../../static/js/lovtrag.js';
test('trag lovaca: kad snimiti tačku, grupisanje po lovcu, boje, lokalne tačke', () => {
  const a = { lat: 44.88, lon: 16.15, t: 0 };
  assert.equal(shouldRecordPoint(null, { lat: 44.88, lon: 16.15 }, 0), true);
  assert.equal(shouldRecordPoint(a, { lat: 44.88001, lon: 16.15 }, 10000), false); // ~1 m i tek 10 s
  assert.equal(shouldRecordPoint(a, { lat: 44.8805, lon: 16.15 }, 10000), true); // ~55 m
  assert.equal(shouldRecordPoint(a, { lat: 44.88, lon: 16.15 }, 100000), true); // stoji, ali je prošlo 90 s
  assert.equal(shouldRecordPoint(a, null, 0), false);
  assert.equal(pushPoint([1, 2, 3], 4, 3).length, 3);
  const rows = [
    { korisnik_id: 'b', lat: 44.89, lon: 16.15, t: '2026-11-22T09:02:00Z' },
    { korisnik_id: 'a', lat: 44.88, lon: 16.15, t: '2026-11-22T09:01:00Z' },
    { korisnik_id: 'a', lat: 44.881, lon: 16.15, t: '2026-11-22T09:03:00Z' },
    { korisnik_id: 'a', lat: 44.8805, lon: 16.15, t: '2026-11-22T09:02:00Z' },
  ];
  const g = groupTrails(rows);
  assert.deepEqual(g.map((x) => x.id), ['a', 'b']);
  assert.equal(g[0].tacke.length, 3);
  assert.ok(g[0].tacke[0].t < g[0].tacke[2].t);
  assert.ok(g[0].duzina > 100 && g[0].duzina < 130);
  assert.notEqual(g[0].boja, g[1].boja);
  assert.equal(trailColor(10), trailColor(0));
  const merged = withLocalPoints([{ korisnik_id: 'a', lat: 1, lon: 1, t: '2026-11-22T09:01:00Z' }], [{ lat: 1, lon: 1, t: Date.parse('2026-11-22T09:01:00Z') }, { lat: 2, lon: 2, t: Date.parse('2026-11-22T09:05:00Z') }], 'a');
  assert.equal(merged.length, 2);
});

import { archiveHunts, huntDate, huntTimeRange, huntedText, canAddMedia, matchesArchive, MAX_PHOTOS_PER_HUNT } from '../../static/js/arhiva.js';
test('arhiva lova: spisak, vrijeme, šta se lovilo, ko dodaje slike, pretraga', () => {
  const z = (id, status, datum, extra = {}) => ({ id, lov: { naziv: `Lov ${id}`, status, datum, ...extra }, ucesnici: [{ korisnik_id: 'u1' }], sekcija: { naziv: 'Krupa 1' } });
  const list = archiveHunts([z('a', 'planiran', '2026-11-25'), z('b', 'zavrsen', '2026-11-10'), z('c', 'u_toku', '2026-11-22'), z('d', 'zavrsen', '2026-11-22', { pocetak: '2026-11-22T09:00:00Z' })]);
  assert.deepEqual(list.map((x) => x.id), ['d', 'c', 'b']);
  assert.equal(huntDate('2026-11-09'), '09.11.2026.');
  const pocetak = new Date(2026, 10, 22, 8, 15).toISOString();
  const kraj = new Date(2026, 10, 22, 12, 40).toISOString();
  assert.equal(huntTimeRange({ pocetak, kraj, status: 'zavrsen' }), '08:15 – 12:40 (4 h 25 min)');
  assert.equal(huntTimeRange({ pocetak, status: 'u_toku' }), 'od 08:15 · u toku');
  assert.equal(huntTimeRange({ status: 'zavrsen' }), 'Vrijeme nije zabilježeno');
  assert.equal(huntedText([{ vrsta: 'svinja', tezina: 80 }, { vrsta: 'svinja', tezina: 70 }, { vrsta: 'lisica' }], (k) => k.toUpperCase()), 'SVINJA 2, LISICA 1');
  assert.equal(huntedText([], (k) => k), '');
  const zap = z('x', 'zavrsen', '2026-11-22');
  assert.equal(canAddMedia(zap, 'u1', false), true);
  assert.equal(canAddMedia(zap, 'tudji', false), false);
  assert.equal(canAddMedia(zap, 'tudji', true), true);
  assert.equal(canAddMedia(zap, 'u1', true, MAX_PHOTOS_PER_HUNT), false);
  assert.equal(matchesArchive({ ...zap, lov: { ...zap.lov, rezultat: 'Dvije divlje svinje' } }, 'svinje dvije'), true);
  assert.equal(matchesArchive(zap, '22.11.2026'), true);
  assert.equal(matchesArchive(zap, 'nesto drugo'), false);
});

import { isTrackTooShort, MIN_TRACK_M } from '../../static/js/trag.js';
test('trag kraći od 50 m se ne čuva (potraga je izuzeta)', () => {
  assert.equal(MIN_TRACK_M, 50);
  const t = (vrsta, lat2) => ({ vrsta, tacke: [{ lat: 44.88, lon: 16.15, t: 0 }, { lat: lat2, lon: 16.15, t: 1000 }] });
  assert.equal(isTrackTooShort(t('obilazak', 44.88020)), true);   // ~22 m
  assert.equal(isTrackTooShort(t('obilazak', 44.8806)), false);   // ~67 m
  assert.equal(isTrackTooShort(t('potraga', 44.88020)), false);
  assert.equal(isTrackTooShort({ vrsta: 'obilazak', tacke: [] }), true);
});

import { pendingPhotos, dataUrlToBlob } from '../../static/js/fotosync.js';
test('fotosync: šalju se samo fotografije sinhronizovanih vlastitih zapisa koje još nisu poslane', () => {
  const recs = [
    { id: 'a', sinhronizovano: true, fotografije: ['f1', 'f2'] },
    { id: 'b', sinhronizovano: false, fotografije: ['f3'] },
    { id: 'c', sinhronizovano: true, tudji: true, fotografije: ['f4'] },
    { id: 'd', sinhronizovano: true, obrisan: true, fotografije: ['f5'] },
    { id: 'e', sinhronizovano: true },
  ];
  assert.deepEqual(pendingPhotos('objekti', recs, new Set(['f1'])), [{ store: 'objekti', zapisId: 'a', fotoId: 'f2' }]);
  const blob = dataUrlToBlob('data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(blob.type, 'image/jpeg');
  assert.ok(blob.size > 0);
});
