import test from 'node:test';
import assert from 'node:assert/strict';
import { supervisedHunts, tabLabel } from '../../static/js/lov-nadzor.js';

const ctx = {
  reviri: [{ id: 'r1', naziv: 'Krupa' }, { id: 'r2', naziv: 'Otoka' }],
  sekcije: [{ id: 's1', naziv: 'Krupa 1', revir_id: 'r1' }, { id: 's2', naziv: 'Otoka 1', revir_id: 'r2' }],
  grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'u1' }],
  drustvoUloge: [{ korisnik_id: 'pred', uloga: 'predsjednik' }], revirVodje: [{ revir_id: 'r1', korisnik_id: 'rv' }], lovocuvari: [],
};
const rec = (id, status, sekcija, extra = {}) => ({ lov: { id, naziv: `Lov ${id}`, status, sekcija_id: sekcija, pocetak: '2026-11-27T06:00:00Z', ...extra },
  ucesnici: [{ korisnik_id: 'u1', uloga: 'vodja' }, { korisnik_id: 'u2', uloga: 'pogonic' }, { korisnik_id: 'u3', uloga: 'strijelac' }] });
const recs = [rec('a', 'u_toku', 's1', { grupa_id: 'g1' }), rec('b', 'u_toku', 's2'), rec('c', 'planiran', 's1'), rec('d', 'zavrsen', 's2')];
const nm = (id) => ({ u1: 'Vođa Jedan' }[id] || id);
const now = Date.parse('2026-11-27T07:30:00Z');

test('vodstvo cijelog društva vidi sve lovove u toku, grupisane po reviru; planirani i završeni se ne računaju', () => {
  const r = supervisedHunts(ctx, recs, { id: 'pred' }, nm, now);
  assert.equal(r.ukupno, 2);
  assert.deepEqual(r.reviri.map((x) => x.naziv), ['Krupa', 'Otoka']);
  const a = r.reviri[0].lovovi[0];
  assert.equal(a.grupa, 'grupa — grupovođa Vođa Jedan');
  assert.deepEqual([a.ucesnika, a.pogonica, a.trajanje], [3, 1, '1 h 30 min']);
  assert.deepEqual(a.vodje, ['Vođa Jedan']);
  assert.equal(r.reviri[1].lovovi[0].grupa, 'cijela sekcija');
  assert.equal(r.ucesnika, 6);
});

test('lovovođa revira vidi samo lovove svog revira, lovac ništa', () => {
  const r = supervisedHunts(ctx, recs, { id: 'rv' }, nm, now);
  assert.equal(r.ukupno, 1);
  assert.equal(r.reviri[0].naziv, 'Krupa');
  assert.equal(supervisedHunts(ctx, recs, { id: 'lovac' }, nm, now).scope, null);
  assert.equal(supervisedHunts(ctx, recs, { id: 'lovac' }, nm, now).ukupno, 0);
  assert.equal(supervisedHunts(ctx, [], { id: 'pred' }, nm, now).ukupno, 0);
});

test('tabLabel', () => { assert.equal(tabLabel(0), 'Lov'); assert.equal(tabLabel(3), 'Lov (3)'); });

test('grupa koje nema u kešu sekcija piše samo "grupa" (bez izmišljenog imena)', () => {
  const r = supervisedHunts({ ...ctx, grupe: [] }, recs, { id: 'pred' }, nm, now);
  assert.equal(r.reviri[0].lovovi[0].grupa, 'grupa');
});
