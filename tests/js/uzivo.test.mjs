import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sosText, smsNumbers, newSosSince, huntReportData } from '../../static/js/uzivo.js';

test('SOS tekst: ime, lov, WGS84 i GK6 koordinate, link za kartu', () => {
  const t = sosText({ ime: 'Ado', prezime: 'Adić' }, { lat: 44.8, lon: 16.0, acc: 6 }, 'Pogon Bara');
  assert.match(t, /^SOS! Ado Adić treba pomoć \(lov: Pogon Bara\)\./);
  assert.match(t, /WGS84 44\.800000, 16\.000000/);
  assert.match(t, /GK6 Y 6342177 {2}X 4963672/);
  assert.match(t, /±6 m/);
  assert.match(t, /https:\/\/maps\.google\.com\/\?q=44\.800000,16\.000000/);
  assert.match(sosText({ ime: 'A', prezime: 'B' }, null, 'L'), /pozicija nepoznata/);
});

test('SMS brojevi: bez mene, bez duplikata, samo cifre i +', () => {
  const tel = [
    { korisnik_id: 'me', telefon: '+387 61 000 000' },
    { korisnik_id: 'a', telefon: '+387 61 111 222' },
    { korisnik_id: 'b', telefon: '061/333-444' },
    { korisnik_id: 'c', telefon: '+387 61 111 222' },
  ];
  assert.deepEqual(smsNumbers(tel, 'me'), ['+38761111222', '061333444']);
});

test('novi tuđi SOS od zadnje provjere', () => {
  const rows = [
    { id: '1', korisnik_id: 'a', created_at: '2026-12-05T10:00:00Z' },
    { id: '2', korisnik_id: 'me', created_at: '2026-12-05T10:05:00Z' },
    { id: '3', korisnik_id: 'b', created_at: '2026-12-05T10:06:00Z' },
  ];
  assert.deepEqual(newSosSince(rows, 'me', new Set(['1'])).map((r) => r.id), ['3']);
});

test('zbirni izvještaj: odstrel po vrsti i učesnici sa ulogom i stanom', () => {
  const lov = {
    lov: { naziv: 'Pogon', datum: '2026-12-05' },
    ucesnici: [{ korisnik_id: 'a', uloga: 'strijelac' }, { korisnik_id: 'p', uloga: 'pogonic' }],
    stanovi: [{ broj: 3, korisnik_id: 'a' }],
  };
  const odstrel = [
    { vrsta: 'divlja_svinja', kategorija: 'vepar', tezina: 85.5, korisnik_id: 'a', stan_broj: 3, vrijeme: '2026-12-05T10:00:00Z' },
    { vrsta: 'divlja_svinja', kategorija: 'prase', tezina: 20, korisnik_id: 'a', stan_broj: 3, vrijeme: '2026-12-05T11:00:00Z' },
  ];
  const r = huntReportData(lov, odstrel, (id) => ({ a: 'Ado Adić', p: 'Pero Pogonič' }[id]), (k) => ({ divlja_svinja: 'Divlja svinja' }[k] || k));
  assert.deepEqual(r.zbir, ['Divlja svinja: 2 kom., 105,5 kg']);
  assert.deepEqual(r.ucesnici, ['Ado Adić — Strijelac, stan 3', 'Pero Pogonič — Pogonič']);
  assert.equal(r.redovi.length, 2);
  assert.equal(r.redovi[0].lovac, 'Ado Adić');
});
