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
  assert.deepEqual(huntButtons({ aktivan: { id: 'L' }, organizator: true }), { traje: true, dodaj: false });
  assert.deepEqual(huntButtons({ organizator: true }), { traje: false, dodaj: true });
  assert.deepEqual(huntButtons({ organizator: false }), { traje: false, dodaj: false });
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
