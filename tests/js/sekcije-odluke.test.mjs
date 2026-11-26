import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionText, historyLine, unseenDecisions, nextDecisionCursor, bulkApprovable, memberRows, memberCsvName } from '../../static/js/sekcije-odluke.js';
import { toCsv } from '../../static/js/odstrel.js';
import { MEMBER_CSV_COLUMNS } from '../../static/js/sekcije-odluke.js';

const sek = [{ id: 's1', naziv: 'Krupa 1' }, { id: 's2', naziv: 'Otoka 1' }];

test('tekst odluke za podnosioca: primljen, odbijen (sa razlogom), prebačen', () => {
  assert.equal(decisionText({ odluka: 'odobren', sekcija_id: 's1' }, sek), 'Primljen si u sekciju Krupa 1.');
  assert.equal(decisionText({ odluka: 'odbijen', sekcija_id: 's1', razlog: 'Nisi član' }, sek), 'Zahtjev za Krupa 1 je odbijen. Razlog: Nisi član');
  assert.equal(decisionText({ odluka: 'odbijen', sekcija_id: 's1' }, sek), 'Zahtjev za Krupa 1 je odbijen.');
  assert.match(decisionText({ odluka: 'prebacen', sekcija_id: 's1', u_sekciju: 's2' }, sek), /iz Krupa 1 u Otoka 1/);
});

test('historija: ko je odlučio i razlog', () => {
  const n = (id) => ({ a: 'Ado', g: 'Goran' })[id] || id;
  assert.equal(historyLine({ odluka: 'odbijen', korisnik_id: 'a', odlucio: 'g', razlog: 'x' }, n), 'Ado — odbijen (Goran): x');
  assert.equal(historyLine({ odluka: 'odobren', korisnik_id: 'a', odlucio: 'g' }, n), 'Ado — primljen (Goran)');
});

test('nove odluke i kursor sa preklopom (bez duplikata po id-u)', () => {
  const rows = [{ id: '2', created_at: '2026-11-25T10:00:00Z' }, { id: '1', created_at: '2026-11-25T09:00:00Z' }];
  assert.deepEqual(unseenDecisions(rows, ['1']).map((r) => r.id), ['2']);
  assert.deepEqual(unseenDecisions(rows, []).map((r) => r.id), ['1', '2']);
  assert.equal(nextDecisionCursor(rows, null), '2026-11-25T09:59:00.000Z');
  assert.equal(nextDecisionCursor([], 'x'), 'x');
});

test('"Odobri sve" preskače predložene naloge; CSV članova: lovovođa sekcije prvi, zaštita od formula, ime fajla', () => {
  const clanovi = [
    { sekcija_id: 's1', korisnik_id: 'a', status: 'ceka' }, { sekcija_id: 's1', korisnik_id: 'b', status: 'ceka', pozvao_id: 'x' },
    { sekcija_id: 's1', korisnik_id: 'g', status: 'odobren', odlucio_at: '2026-03-01T00:00:00Z' }, { sekcija_id: 's1', korisnik_id: 'z', status: 'odobren', created_at: '2026-01-05T00:00:00Z' },
  ];
  assert.deepEqual(bulkApprovable('s1', clanovi).map((c) => c.korisnik_id), ['a']);
  const rows = memberRows({ id: 's1', grupovodja_id: 'g' }, clanovi, [{ id: 'g', ime: 'Goran', prezime: 'Zukić' }, { id: 'z', ime: '=HACK', prezime: 'Avdić', nadimak: '12' }]);
  assert.deepEqual(rows.map((r) => r.uloga), ['Lovovođa sekcije', 'Član']);
  const csv = toCsv(rows, MEMBER_CSV_COLUMNS);
  assert.match(csv, /^﻿Prezime;Ime;/);
  assert.match(csv, /Avdić;'=HACK;12;Član;2026-01-05/);
  assert.equal(memberCsvName({ naziv: 'Krupa 1 — Gornja' }, new Date('2026-11-25T10:00:00Z')), 'clanovi-krupa-1-gornja-2026-11-25.csv');
});
