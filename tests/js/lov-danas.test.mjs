import test from 'node:test';
import assert from 'node:assert/strict';
import { todayHuntSummary, durationText } from '../../static/js/lov-danas.js';
import { huntCreatePlan } from '../../static/js/sekcija-podaci.js';

const rec = {
  id: 'l1',
  lov: { id: 'l1', naziv: 'Pogon Bara', status: 'u_toku', pocetak: '2026-11-23T07:00:00Z', napomena: 'Okupljanje kod kuće' },
  ucesnici: [{ korisnik_id: 'b', uloga: 'strijelac' }, { korisnik_id: 'a', uloga: 'vodja' }, { korisnik_id: 'c', uloga: 'pogonic' }],
  stanovi: [{ broj: 3, korisnik_id: 'b' }],
  sekcija: { naziv: 'Vignjević gaj' },
  revir: { naziv: 'Krupa' },
};

test('Lov danas: vođa prvi, moj stan i uloga, trajanje i brojevi', () => {
  const names = { a: 'Ante A', b: 'Bego B', c: 'Ćamil C' };
  const s = todayHuntSummary(rec, 'b', (id) => names[id], Date.parse('2026-11-23T08:35:00Z'));
  assert.deepEqual(s.ucesnici.map((u) => u.id), ['a', 'b', 'c']);
  assert.equal(s.moj.stan, 3);
  assert.equal(s.moj.ulogaTekst, 'Strijelac');
  assert.equal(s.trajanje, '1 h 35 min');
  assert.deepEqual(s.vodje, ['Ante A']);
  assert.equal(s.mjesto, 'Vignjević gaj · Krupa');
  assert.deepEqual(s.brojevi, { ucesnika: 3, stanova: 1, pogonica: 1 });
  assert.equal(todayHuntSummary(null, 'b'), null);
  assert.equal(durationText('nije datum'), '');
});

test('Novi lov iz modala: ja sam vođa, izabrani strijelci, "pokreni odmah" samo za danas', () => {
  const now = new Date(2026, 10, 23, 9);
  const s = { id: 's1', revir_id: 'r1', naziv: 'Vignjević gaj' };
  const p = huntCreatePlan(s, 'l9', 'ja', { naziv: '  Pogon Bara ', napomena: 'Okupljanje 7:00', ucesnici: ['x', 'ja', 'x', 'y'], pokreni: true }, now);
  assert.equal(p.lov.naziv, 'Pogon Bara');
  assert.equal(p.lov.datum, '2026-11-23');
  assert.equal(p.lov.napomena, 'Okupljanje 7:00');
  assert.deepEqual(p.ucesnici.map((u) => [u.korisnik_id, u.uloga]), [['ja', 'vodja'], ['x', 'strijelac'], ['y', 'strijelac']]);
  assert.equal(p.pokreni, true);
  assert.equal(huntCreatePlan(s, 'l9', 'ja', { datum: '2026-11-30', pokreni: true }, now).pokreni, false);
  assert.equal(huntCreatePlan(s, 'l9', 'ja', {}, now).lov.naziv, 'Vignjević gaj — 23.11.2026.');
});
