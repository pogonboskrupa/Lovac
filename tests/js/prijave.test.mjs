import test from 'node:test';
import assert from 'node:assert/strict';
import { reportTargets, targetLabel, buildReport, reportState, addToOutbox, markSent } from '../../static/js/prijave.js';
import { viewerRole, activeReports, reportYears, byYear, totals, groupBy, byMonth, latestReports, societyFigures, ULOGE_OPIS } from '../../static/js/pregled.js';

const ctx = {
  reviri: [{ id: 'R1', naziv: 'Krupa' }, { id: 'R2', naziv: 'Otoka' }],
  sekcije: [{ id: 'S1', revir_id: 'R1', naziv: 'Krupa 1', grupovodja_id: 'gv', aktivno: true }, { id: 'S2', revir_id: 'R2', naziv: 'Otoka 1', grupovodja_id: null, aktivno: true, lovocuvar_id: 'lc2' }],
  clanovi: [{ sekcija_id: 'S1', korisnik_id: 'l1', status: 'odobren' }, { sekcija_id: 'S2', korisnik_id: 'l2', status: 'ceka' }],
  grupovodje: [{ korisnik_id: 'gv', revir_id: 'R1' }],
  lovocuvari: [{ revir_id: 'R1', korisnik_id: 'lc1' }],
};

test('reportTargets: zapis iz lova nosi revir; inače samo moje sekcije (član/grupovođa); admin bilo koji revir', () => {
  assert.deepEqual(reportTargets({ revir_id: 'R1', sekcija_id: 'S1', lov_id: 'L' }, ctx, 'l1'), [{ revirId: 'R1', sekcijaId: 'S1', lovId: 'L', fixed: true }]);
  assert.deepEqual(reportTargets({}, ctx, 'l1').map((t) => t.sekcijaId), ['S1']);
  assert.deepEqual(reportTargets({}, ctx, 'gv').map((t) => t.sekcijaId), ['S1']);
  assert.deepEqual(reportTargets({}, ctx, 'l2'), [], 'zahtjev na čekanju nije član');
  assert.deepEqual(reportTargets({}, ctx, 'lc1'), [], 'lovočuvar prati, ne prijavljuje kao član');
  assert.deepEqual(reportTargets({}, ctx, 'adm', true).map((t) => t.revirId), ['R1', 'R2']);
  assert.equal(targetLabel({ revirId: 'R1', sekcijaId: 'S1' }, ctx), 'Krupa · Krupa 1');
});

test('buildReport: samo osnovni podaci, bez lokacije i napomene', () => {
  const rec = { id: 'x', vrsta: 'zec', kategorija: 'nepoznato', tezina: '3.5', vrijeme: Date.UTC(2026, 10, 1), lat: 44, lon: 16, napomena: 'privatno', lovac: 'Ado' };
  const row = buildReport(rec, { revirId: 'R1', sekcijaId: 'S1', lovId: null }, 'u1');
  assert.deepEqual(row, { id: 'x', lovac_id: 'u1', revir_id: 'R1', sekcija_id: 'S1', lov_id: null, vrsta: 'zec', kategorija: null, tezina: 3.5, vrijeme: '2026-11-01T00:00:00.000Z' });
  assert.equal(buildReport({ ...rec, tezina: null }, { revirId: 'R1' }, 'u1').tezina, null);
  assert.equal(buildReport({ ...rec, kategorija: 'vepar' }, { revirId: 'R1' }, 'u1').kategorija, 'vepar');
});

test('izlazna kutija: stanje, dedup i označavanje poslanog', () => {
  const row = { id: 'a' };
  let box = addToOutbox([], row);
  box = addToOutbox(box, row);
  assert.equal(box.length, 1);
  assert.equal(reportState('a', box, []), 'ceka');
  assert.equal(reportState('b', box, []), 'nema');
  const r = markSent(box, [], ['a']);
  assert.deepEqual(r.outbox, []);
  assert.equal(reportState('a', r.outbox, r.sent), 'poslana');
  assert.equal(reportState('a', r.outbox, r.sent, ['a']), 'povucena');
});

test('viewerRole: admin > lovočuvar > grupovođa > lovac; neodobren je lovac; nikad iz imena', () => {
  assert.equal(viewerRole({ id: 'adm', odobren: true, is_admin: true }, ctx), 'admin');
  assert.equal(viewerRole({ id: 'lc1', odobren: true }, ctx), 'lovocuvar');
  assert.equal(viewerRole({ id: 'lc2', odobren: true }, ctx), 'lovocuvar', 'lovočuvar sekcije');
  assert.equal(viewerRole({ id: 'gv', odobren: true }, ctx), 'grupovodja');
  assert.equal(viewerRole({ id: 'l1', odobren: true }, ctx), 'lovac');
  assert.equal(viewerRole({ id: 'adm', odobren: false, is_admin: true }, ctx), 'lovac');
  assert.equal(viewerRole({ id: 'Administrator', ime: 'Admin', odobren: true }, ctx), 'lovac');
  assert.equal(viewerRole(null, ctx), 'lovac');
  assert.ok(Object.keys(ULOGE_OPIS).join() === 'admin,lovocuvar,grupovodja,lovac');
});

const rows = [
  { id: '1', lovac_id: 'a', revir_id: 'R1', sekcija_id: 'S1', vrsta: 'zec', tezina: 3, vrijeme: '2026-01-10T10:00:00Z', prijavljeno: '2026-01-11T10:00:00Z' },
  { id: '2', lovac_id: 'a', revir_id: 'R1', sekcija_id: 'S1', vrsta: 'zec', tezina: 4, vrijeme: '2026-03-10T10:00:00Z', prijavljeno: '2026-03-11T10:00:00Z' },
  { id: '3', lovac_id: 'b', revir_id: 'R2', sekcija_id: null, vrsta: 'srna', tezina: 20.5, vrijeme: '2025-11-10T10:00:00Z', prijavljeno: '2025-11-12T10:00:00Z' },
  { id: '4', lovac_id: 'b', revir_id: 'R2', sekcija_id: null, vrsta: 'srna', tezina: 99, vrijeme: '2026-03-10T10:00:00Z', povucena: true },
];

test('pregled: povučene prijave se ne računaju; ukupno, godine, grupisanje, mjeseci, zadnje', () => {
  const act = activeReports(rows);
  assert.equal(act.length, 3);
  assert.deepEqual(totals(act), { komada: 3, kg: 27.5, vrsta: 2, lovaca: 2 });
  assert.deepEqual(reportYears(act), [2026, 2025]);
  assert.equal(byYear(act, 2026).length, 2);
  assert.equal(byYear(act, 'sve').length, 3);
  assert.deepEqual(groupBy(act, 'revir_id'), [{ kljuc: 'R1', komada: 2, kg: 7 }, { kljuc: 'R2', komada: 1, kg: 20.5 }]);
  assert.deepEqual(groupBy(act, 'vrsta').map((g) => g.kljuc), ['zec', 'srna']);
  assert.deepEqual(byMonth(act, 2026).slice(0, 4), [1, 0, 1, 0]);
  assert.deepEqual(latestReports(act, 2).map((r) => r.id), ['2', '1']);
});

test('societyFigures: brojke društva iz keša sekcija', () => {
  assert.deepEqual(societyFigures(ctx), { reviri: 2, sekcija: 2, clanova: 1, lovocuvara: 1, grupovodja: 1 });
});
