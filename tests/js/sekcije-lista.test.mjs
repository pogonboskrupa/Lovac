import test from 'node:test';
import assert from 'node:assert/strict';
import { seesSectionList, groupSectionsByRevir, myStatus } from '../../static/js/sekcije.js';
import { mySections } from '../../static/js/sekcija-podaci.js';

const reviri = [{ id: 'r1', naziv: 'Krupa' }, { id: 'r2', naziv: 'Otoka' }];
const sekcije = [
  { id: 's1', revir_id: 'r1', naziv: 'Krupa 2', grupovodja_id: 'g1', aktivno: true },
  { id: 's2', revir_id: 'r1', naziv: 'Krupa 1', grupovodja_id: null, aktivno: true },
  { id: 's3', revir_id: 'r2', naziv: 'Otoka 1', grupovodja_id: null, aktivno: true },
];
const clanovi = [{ sekcija_id: 's3', korisnik_id: 'l1', status: 'odobren' }];
const lovocuvari = [{ revir_id: 'r1', korisnik_id: 'lc' }];
const ctx = { sekcije, clanovi, lovocuvari };

test('opseg: admin sve sekcije, lovočuvar cijeli svoj revir, lovovođa sekcije i lovac samo svoju', () => {
  assert.equal(mySections(ctx, { id: 'a', is_admin: true }).length, 3);
  assert.deepEqual(mySections(ctx, { id: 'lc' }).map((s) => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(mySections(ctx, { id: 'g1' }).map((s) => s.id), ['s1']);
  assert.deepEqual(mySections(ctx, { id: 'l1' }).map((s) => s.id), ['s3']);
  assert.equal(myStatus(sekcije[2], clanovi, 'lc', false, lovocuvari), 'nema');
});

test('tab "Sekcije" sa spiskom: admin i lovočuvar, ne lovovođa sekcije ni lovac', () => {
  assert.equal(seesSectionList({ id: 'a', is_admin: true }, ctx), true);
  assert.equal(seesSectionList({ id: 'lc' }, ctx), true);
  assert.equal(seesSectionList({ id: 'g1' }, ctx), false);
  assert.equal(seesSectionList({ id: 'l1' }, ctx), false);
  assert.equal(seesSectionList(null, ctx), false);
});

test('spisak je grupisan po reviru, revir i sekcija po nazivu', () => {
  const g = groupSectionsByRevir(sekcije, reviri);
  assert.deepEqual(g.map((x) => x.revir), ['Krupa', 'Otoka']);
  assert.deepEqual(g[0].sekcije.map((s) => s.naziv), ['Krupa 1', 'Krupa 2']);
});
