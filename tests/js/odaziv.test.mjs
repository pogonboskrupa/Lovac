import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huntsToAsk, queueAnswer, dropAnswer, answersSummary, tableMissing, answerRejected } from '../../static/js/odaziv.js';

const JA = 'u1';
const clanovi = [{ sekcija_id: 's1', korisnik_id: JA, status: 'odobren' }, { sekcija_id: 's2', korisnik_id: JA, status: 'ceka' }];
const lov = (id, extra = {}, ucesnici = []) => ({ id, lov: { id, sekcija_id: 's1', status: 'planiran', datum: '2026-11-25', organizator_id: 'gv', ...extra }, ucesnici });

test('huntsToAsk: samo planirani/u toku lovovi moje sekcije, bez odgovora, od danas', () => {
  const lovovi = [
    lov('a', { datum: '2026-11-27' }),
    lov('b'),
    lov('c', { status: 'zavrsen' }),
    lov('d', { sekcija_id: 's2' }),            // čekam odobrenje
    lov('e', { organizator_id: JA }),          // moj lov
    lov('f', {}, [{ korisnik_id: JA }]),       // već sam u lovu
    lov('g', { datum: '2026-11-20' }),         // prošao
    lov('h', { sekcija_id: null }),
    lov('i'),
  ];
  const ids = huntsToAsk(lovovi, { myId: JA, clanovi, odgovori: { i: { odgovor: 'ne' } }, today: '2026-11-24' }).map((r) => r.id);
  assert.deepEqual(ids, ['b', 'a']);
  assert.deepEqual(huntsToAsk(lovovi, { myId: JA, clanovi, odlozeni: ['b', 'i', 'a'], today: '2026-11-24' }), []);
  assert.deepEqual(huntsToAsk(lovovi, { myId: null, clanovi }), []);
});

test('red odgovora: zadnji odgovor za isti lov pobjeđuje; brisanje po vremenu', () => {
  let red = queueAnswer([], 'a', 'da', 1);
  red = queueAnswer(red, 'b', 'ne', 2);
  red = queueAnswer(red, 'a', 'ne', 3);
  assert.deepEqual(red, [{ lovId: 'b', odgovor: 'ne', t: 2 }, { lovId: 'a', odgovor: 'ne', t: 3 }]);
  assert.deepEqual(dropAnswer(red, { lovId: 'a', t: 1 }), red); // stariji poslani ne briše noviji
  assert.deepEqual(dropAnswer(red, { lovId: 'a', t: 3 }), [{ lovId: 'b', odgovor: 'ne', t: 2 }]);
});

test('answersSummary i greške servera', () => {
  const s = answersSummary([{ korisnik_id: 'x', odgovor: 'da' }, { korisnik_id: 'y', odgovor: 'ne' }, { korisnik_id: 'z', odgovor: 'ne' }], (id) => id.toUpperCase());
  assert.deepEqual(s, { da: ['X'], ne: ['Y', 'Z'], tekst: 'Dolazi: 1 · Ne dolazi: 2' });
  assert.equal(answersSummary([]).tekst, 'Još niko nije odgovorio');
  assert.ok(tableMissing({ code: 'PGRST205' }));
  assert.ok(!tableMissing({ code: '42501' }));
  assert.ok(answerRejected({ code: '42501' }));
  assert.ok(answerRejected({ message: 'new row violates row-level security policy' }));
  assert.ok(!answerRejected({ message: 'Failed to fetch' }));
});

test('huntsToAsk: lov grupe pita samo lovce te grupe, lov sekcije sve', () => {
  const cl = [{ sekcija_id: 's1', korisnik_id: JA, status: 'odobren', grupa_id: 'g1' }];
  const lovovi = [lov('moja', { grupa_id: 'g1' }), lov('tuda', { grupa_id: 'g2' }), lov('sekcija')];
  assert.deepEqual(huntsToAsk(lovovi, { myId: JA, clanovi: cl, today: '2026-11-24' }).map((r) => r.id).sort(), ['moja', 'sekcija']);
  // lovac bez grupe ne dobija pitanje za lov grupe
  const bez = [{ sekcija_id: 's1', korisnik_id: JA, status: 'odobren', grupa_id: null }];
  assert.deepEqual(huntsToAsk(lovovi, { myId: JA, clanovi: bez, today: '2026-11-24' }).map((r) => r.id), ['sekcija']);
});
