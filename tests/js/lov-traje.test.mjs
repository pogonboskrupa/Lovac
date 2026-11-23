import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organizableSections, huntButtons, participantRows, huntMessages, huntPhotos } from '../../static/js/lov-traje.js';

const ctx = {
  sekcije: [{ id: 'S1', naziv: 'Krupa 1', revir_id: 'R1', grupovodja_id: 'g' }, { id: 'S2', naziv: 'Otoka 1', revir_id: 'R2', grupovodja_id: 'x' },
    { id: 'S3', naziv: 'Stara', revir_id: 'R1', grupovodja_id: 'g', aktivno: false }],
  clanovi: [{ sekcija_id: 'S2', korisnik_id: 'g', status: 'odobren' }], lovocuvari: [{ korisnik_id: 'lc', revir_id: 'R1' }],
};

test('lov dodaje grupovođa svoje sekcije i admin; član i lovočuvar ne', () => {
  assert.deepEqual(organizableSections(ctx, { id: 'g' }).map((s) => s.id), ['S1']);
  assert.deepEqual(organizableSections(ctx, { id: 'a', is_admin: true }).map((s) => s.id), ['S1', 'S2']);
  assert.deepEqual(organizableSections(ctx, { id: 'lc' }), []);
  assert.deepEqual(organizableSections(ctx, null), []);
});

test('"+": dok lov traje samo "Lov traje"; inače "Dodaj lov" za organizatora', () => {
  assert.deepEqual(huntButtons({ aktivan: { id: 'L' }, organizator: true }), { traje: true, planiran: false, dodaj: false });
  assert.deepEqual(huntButtons({ organizator: true }), { traje: false, planiran: false, dodaj: true });
  assert.deepEqual(huntButtons({ organizator: false }), { traje: false, planiran: false, dodaj: false });
});

test('učesnici: svježina pozicije, broj poruka i slika, zadnja poruka', () => {
  const now = Date.parse('2026-11-23T08:00:00Z');
  const rows = participantRows([{ id: 'a', ime: 'A' }, { id: 'b', ime: 'B' }, { id: 'c', ime: 'C' }, { id: 'ja', ime: 'Ja', ja: true }], {
    pozicije: [{ korisnik_id: 'a', t: '2026-11-23T07:59:00Z' }, { korisnik_id: 'b', t: '2026-11-23T07:20:00Z' }],
    poruke: [{ autor_id: 'a', tekst: 'prva' }, { autor_id: 'a', tekst: 'druga' }], slike: [{ autor_id: 'c' }], now,
  });
  assert.deepEqual(rows.map((r) => [r.id, r.svjezina, r.poruka, r.slika]), [['a', 'uzivo', 2, 0], ['b', 'nema', 0, 0], ['c', 'nema', 0, 1], ['ja', 'ja', 0, 0]]);
  assert.equal(rows[0].zadnjaPoruka.tekst, 'druga');
});

test('poruke i slike lova', () => {
  assert.deepEqual(huntMessages([{ lov_id: 'L', created_at: '2' }, { lov_id: 'X', created_at: '1' }, { lov_id: 'L', created_at: '1' }], 'L').map((m) => m.created_at), ['1', '2']);
  const p = huntPhotos([{ id: '1', created_at: '1' }], [{ id: '1', created_at: '1' }, { id: '2', created_at: '3' }]);
  assert.deepEqual(p.map((x) => [x.id, x.ceka]), [['2', true], ['1', false]]);
});

import { todayPlannedHunt, canManageHunt, lastHuntPreset } from '../../static/js/lov-traje.js';
import { huntCreatePlan } from '../../static/js/sekcija-podaci.js';

test('"+" za lov planiran danas pokazuje "Lov danas", ne "Dodaj lov"', () => {
  assert.deepEqual(huntButtons({ planiran: { id: 'L' }, organizator: true }), { traje: false, planiran: true, dodaj: false });
  const lovovi = [
    { lov: { id: '1', status: 'planiran', datum: '2026-11-23', organizator_id: 'o' }, ucesnici: [{ korisnik_id: 'ja' }] },
    { lov: { id: '2', status: 'planiran', datum: '2026-11-24', organizator_id: 'o' }, ucesnici: [{ korisnik_id: 'ja' }] },
    { lov: { id: '3', status: 'planiran', datum: '2026-11-23', organizator_id: 'o' }, ucesnici: [] },
  ];
  assert.equal(todayPlannedHunt(lovovi, 'ja', '2026-11-23').lov.id, '1');
  assert.equal(todayPlannedHunt(lovovi, 'neko', '2026-11-23'), null);
  assert.equal(todayPlannedHunt(lovovi, 'o', '2026-11-23') !== null, true);
});

test('upravlja lovom: admin, organizator i grupovođa sekcije lova; član ne', () => {
  const rec = { lov: { sekcija_id: 'S1', organizator_id: 'o' } };
  assert.equal(canManageHunt(rec, ctx, { id: 'g' }), true);
  assert.equal(canManageHunt(rec, ctx, { id: 'o' }), true);
  assert.equal(canManageHunt(rec, ctx, { id: 'a', is_admin: true }), true);
  assert.equal(canManageHunt(rec, ctx, { id: 'clan' }), false);
  assert.equal(canManageHunt({ lov: { sekcija_id: 'S2', organizator_id: 'o' } }, ctx, { id: 'g' }), false);
});

test('"Kao zadnji lov": lovci i uloge zadnjeg lova sekcije, bez mene', () => {
  const lovovi = [
    { lov: { sekcija_id: 'S1', datum: '2026-11-01', naziv: 'Stari' }, ucesnici: [{ korisnik_id: 'ja' }, { korisnik_id: 'x' }] },
    { lov: { sekcija_id: 'S1', datum: '2026-11-15', naziv: 'Zadnji' }, ucesnici: [{ korisnik_id: 'ja', uloga: 'vodja' }, { korisnik_id: 'a', uloga: 'pogonic' }, { korisnik_id: 'b', uloga: 'strijelac' }] },
    { lov: { sekcija_id: 'S2', datum: '2026-11-20' }, ucesnici: [{ korisnik_id: 'ja' }, { korisnik_id: 'z' }] },
  ];
  assert.deepEqual(lastHuntPreset(lovovi, 'S1', 'ja'), { naziv: 'Zadnji', ids: ['a', 'b'], uloge: { a: 'pogonic', b: 'strijelac' } });
  assert.equal(lastHuntPreset([], 'S1', 'ja'), null);
});

test('plan lova: pogonič ostaje pogonič, okupljanje ide na početak napomene', () => {
  const plan = huntCreatePlan({ id: 'S1', revir_id: 'R1', naziv: 'Krupa 1' }, 'L', 'ja',
    { ucesnici: ['a', 'b', 'ja'], uloge: { a: 'pogonic', b: 'nesto' }, okupljanje: '07:30', napomena: 'Kod lovačke kuće' }, new Date('2026-11-23T08:00:00'));
  assert.deepEqual(plan.ucesnici.map((u) => [u.korisnik_id, u.uloga]), [['ja', 'vodja'], ['a', 'pogonic'], ['b', 'strijelac']]);
  assert.equal(plan.lov.napomena, 'Okupljanje u 07:30.\nKod lovačke kuće');
  assert.equal(huntCreatePlan({ id: 'S1', revir_id: 'R1', naziv: 'K' }, 'L', 'ja', { okupljanje: '25:00' }).lov.napomena, undefined);
});

import { creatableRevirIds, editsRevir, keeperRevirIds } from '../../static/js/sekcije.js';
test('sekcije po reviru: lovočuvar pravi i uređuje u svom reviru, admin svuda', () => {
  const reviri = [{ id: 'R1' }, { id: 'R2' }];
  const lc = [{ korisnik_id: 'l', revir_id: 'R1' }];
  const gv = [{ korisnik_id: 'g', revir_id: 'R2' }];
  assert.deepEqual(creatableRevirIds({ id: 'l' }, gv, reviri, lc), ['R1']);
  assert.deepEqual(creatableRevirIds({ id: 'g' }, gv, reviri, lc), ['R2']);
  assert.deepEqual(creatableRevirIds({ id: 'a', is_admin: true }, gv, reviri, lc), ['R1', 'R2']);
  assert.equal(editsRevir({ id: 'l' }, 'R1', lc), true);
  assert.equal(editsRevir({ id: 'l' }, 'R2', lc), false);
  assert.equal(editsRevir({ id: 'g' }, 'R2', lc), false);
  assert.equal(editsRevir({ id: 'a', is_admin: true }, 'R2', lc), true);
  assert.deepEqual(keeperRevirIds({ id: 'l' }, lc), ['R1']);
});
