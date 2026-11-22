import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOprema, normalizeProfile, validatePasIme, OPREMA_VRSTE, MAX_OPREMA } from '../../static/js/profil-lovca.js';
import { hunterStats, statYears } from '../../static/js/statistika.js';

test('oprema: nepoznata vrsta ide u ostalo, prazno se izbacuje, ograničen broj', () => {
  assert.deepEqual(normalizeOprema([{ vrsta: 'puska', opis: ' Sauer 202 ' }, { vrsta: 'x', opis: 'Rog' }, { vrsta: 'optika', opis: '  ' }, null]), [
    { vrsta: 'puska', opis: 'Sauer 202' }, { vrsta: 'ostalo', opis: 'Rog' },
  ]);
  assert.equal(normalizeOprema(Array.from({ length: 50 }, (_, i) => ({ vrsta: 'puska', opis: `p${i}` }))).length, MAX_OPREMA);
  assert.deepEqual(normalizeOprema('nije niz'), []);
  assert.ok(OPREMA_VRSTE.puska);
  assert.equal(validatePasIme('x'.repeat(41)) !== null, true);
  assert.equal(validatePasIme('Rex'), null);
  const p = normalizeProfile({ pas_ime: '  Rex ', oprema: [{ vrsta: 'puska', opis: 'a' }] });
  assert.equal(p.pas_ime, 'Rex');
  assert.equal(p.avatar, null);
  assert.equal(p.neposlano, false);
});

test('statistika lovca: lovovi, sati, ulov, najveći komad, tragovi, opažanja', () => {
  const lov = (id, status, datum, ucesnici, extra = {}) => ({ id, lov: { status, datum, ...extra }, ucesnici: ucesnici.map((k) => ({ korisnik_id: k })) });
  const lovovi = [
    lov('a', 'zavrsen', '2026-11-01', ['ja', 'x'], { pocetak: '2026-11-01T07:00:00Z', kraj: '2026-11-01T11:30:00Z' }),
    lov('b', 'zavrsen', '2025-10-10', ['ja'], { pocetak: '2025-10-10T07:00:00Z', kraj: '2025-10-10T09:00:00Z' }),
    lov('c', 'zavrsen', '2026-11-05', ['x']),
    lov('d', 'planiran', '2026-12-01', ['ja']),
  ];
  const t = (y, m, d) => new Date(y, m, d, 9).getTime();
  const odstrel = [
    { vrsta: 'svinja', tezina: 90, vrijeme: t(2026, 10, 1) }, { vrsta: 'svinja', tezina: 70, vrijeme: t(2026, 10, 5) },
    { vrsta: 'lisica', tezina: 6, vrijeme: t(2026, 10, 5) }, { vrsta: 'zec', vrijeme: t(2025, 9, 10) }, { vrsta: 'tuđa', tezina: 500, vrijeme: t(2026, 10, 1), tudji: true },
  ];
  const tragovi = [
    { status: 'gotovo', vrsta: 'obilazak', start: t(2026, 10, 2), tacke: [{ lat: 44.88, lon: 16.15 }, { lat: 44.89, lon: 16.15 }] },
    { status: 'gotovo', vrsta: 'potraga', start: t(2026, 10, 2), tacke: [{ lat: 44.88, lon: 16.15 }] },
    { status: 'snima', vrsta: 'obilazak', start: t(2026, 10, 3), tacke: [] },
  ];
  const opazanja = [{ vrijeme: t(2026, 10, 2), broj: 3 }, { vrijeme: t(2026, 10, 3) }];
  const base = { lovovi, myId: 'ja', odstrel, tragovi, opazanja, objekti: [{ id: 1 }, { id: 2, tudji: true }] };
  const all = hunterStats(base);
  assert.equal(all.lovova, 2);
  assert.ok(Math.abs(all.sati - 6.5) < 1e-6);
  assert.equal(all.ulov, 4);
  assert.deepEqual(all.najveci, { vrsta: 'svinja', tezina: 90, vrijeme: t(2026, 10, 1) });
  assert.equal(all.poVrstama[0].vrsta, 'svinja');
  assert.equal(all.tragova, 1);
  assert.equal(all.potraga, 1);
  assert.ok(all.km > 1 && all.km < 1.2);
  assert.equal(all.opazanja, 2);
  assert.equal(all.grla, 4);
  assert.equal(all.objekata, 1);
  const y26 = hunterStats({ ...base, godina: 2026 });
  assert.equal(y26.lovova, 1);
  assert.equal(y26.ulov, 3);
  assert.equal(hunterStats({ ...base, godina: 2024 }).lovova, 0);
  assert.deepEqual(statYears(base), [2026, 2025]);
});

import { hashString, logoInitials, autoLogoSvg, autoLogoDataUrl, logoOf } from '../../static/js/sekcija-logo.js';
test('logo sekcije: inicijali, isti naziv daje isti logo, učitana slika ima prednost', () => {
  assert.equal(logoInitials('Krupa 1'), 'K1');
  assert.equal(logoInitials('Jezerski'), 'JE');
  assert.equal(logoInitials('  '), '?');
  assert.equal(logoInitials('đ'), 'Đ');
  assert.equal(hashString('Krupa 1'), hashString('Krupa 1'));
  assert.notEqual(hashString('Krupa 1'), hashString('Krupa 2'));
  assert.equal(autoLogoSvg('Krupa 1'), autoLogoSvg('Krupa 1'));
  assert.notEqual(autoLogoSvg('Krupa 1'), autoLogoSvg('Otoka 1'));
  assert.match(autoLogoSvg('A<B'), /A&lt;B|A&lt;/);
  assert.match(autoLogoDataUrl('Krupa 1'), /^data:image\/svg\+xml;utf8,%3Csvg/);
  assert.equal(logoOf({ naziv: 'X', logo: 'data:image/jpeg;base64,AA' }), 'data:image/jpeg;base64,AA');
  assert.equal(logoOf({ naziv: 'Krupa 1' }), autoLogoDataUrl('Krupa 1'));
});
