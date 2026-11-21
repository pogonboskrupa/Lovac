import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeProfile } from '../../static/js/postavke.js';

test('opis naloga u postavkama', () => {
  assert.equal(describeProfile(null), 'Niste prijavljeni');
  assert.equal(describeProfile({ ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: true }), 'Ado Adić · administrator');
  assert.equal(describeProfile({ ime: 'Mujo', prezime: 'Mujić', nadimak: '127', odobren: true }), 'Mujo Mujić (127) · lovac');
  assert.equal(describeProfile({ ime: 'Novi', prezime: 'Lovac', odobren: false }), 'Novi Lovac · čeka odobrenje');
});

import { sortUsers } from '../../static/js/admin.js';

test('korisnici: neodobreni prvi, pa po prezimenu (bosanska abeceda)', () => {
  const s = sortUsers([
    { ime: 'A', prezime: 'Žujo', odobren: true },
    { ime: 'B', prezime: 'Čehić', odobren: true },
    { ime: 'C', prezime: 'Zec', odobren: false },
  ]);
  assert.deepEqual(s.map((u) => u.prezime), ['Zec', 'Čehić', 'Žujo']);
});

import { initialsOfProfile, profileRoles } from '../../static/js/profil.js';
import { buildBackup, parseBackup, recordsToImport, backupFileName } from '../../static/js/rezerva.js';

test('profil: inicijali i uloge iz keša, nikad iz imena', () => {
  assert.equal(initialsOfProfile({ ime: 'ado', prezime: 'Adić' }), 'AA');
  assert.equal(initialsOfProfile(null), '?');
  const ctx = {
    reviri: [{ id: 'R1', naziv: 'Krupa' }],
    sekcije: [{ id: 'S1', naziv: 'Krupa 1', grupovodja_id: 'u1' }],
    grupovodje: [{ korisnik_id: 'u1', revir_id: 'R1' }],
    lovocuvari: [{ korisnik_id: 'u2', revir_id: 'R1' }],
  };
  assert.deepEqual(profileRoles({ id: 'u1', odobren: true }, ctx).map((r) => r.tekst), ['Grupovođa · Krupa', 'Vodi sekciju Krupa 1']);
  assert.deepEqual(profileRoles({ id: 'u2', odobren: true }, ctx).map((r) => r.tekst), ['Lovočuvar · Krupa']);
  assert.deepEqual(profileRoles({ id: 'u3', odobren: true, ime: 'Admin', is_admin: false }, ctx).map((r) => r.kod), ['lovac']);
  assert.deepEqual(profileRoles({ id: 'u4', odobren: true, is_admin: true }, ctx).map((r) => r.kod), ['admin']);
  assert.deepEqual(profileRoles({ id: 'u5', odobren: false }, ctx).map((r) => r.kod), ['ceka']);
  assert.deepEqual(profileRoles(null), []);
});

test('rezervna kopija: izvoz bez tuđih i obrisanih, uvoz samo novih', () => {
  const data = {
    objekti: [{ id: 'obj-00000001', naziv: 'Čeka', fotografije: ['f1'] }, { id: 'obj-00000002', obrisan: true }, { id: 'obj-00000003', tudji: true }],
    odstrel: [{ id: 'ods-00000001', vrsta: 'zec' }],
  };
  const text = buildBackup(data, { id: 'u1', ime: 'Mujo', prezime: 'Mujić' }, 'v0.3.3', new Date('2026-11-19T10:00:00Z'));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.podaci.objekti.map((r) => r.id), ['obj-00000001']);
  assert.equal(parsed.podaci.objekti[0].fotografije, undefined);
  assert.equal(parsed.korisnik.ime, 'Mujo Mujić');
  const { dodaj, preskoceno } = recordsToImport(parsed.podaci, { objekti: new Set(['obj-00000001']), odstrel: new Set() });
  assert.deepEqual(dodaj.map((d) => `${d.store}:${d.rec.id}`), ['odstrel:ods-00000001']);
  assert.equal(dodaj[0].rec.sinhronizovano, false);
  assert.equal(preskoceno, 1);
  assert.equal(parseBackup('nije json').ok, false);
  assert.equal(parseBackup('{"format":"drugo"}').ok, false);
  assert.equal(parseBackup(JSON.stringify({ format: 'lovac-rezerva', verzija: 99, podaci: {} })).ok, false);
  assert.equal(backupFileName(new Date(2026, 10, 9)), 'lovac-rezerva-2026-11-09.json');
});
