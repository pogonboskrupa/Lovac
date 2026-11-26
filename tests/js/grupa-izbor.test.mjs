import test from 'node:test';
import assert from 'node:assert/strict';
import { sectionsToAsk, PITANO_KEY } from '../../static/js/grupa-izbor.js';

const clanovi = [
  { sekcija_id: 's1', korisnik_id: 'me', status: 'ceka' },
  { sekcija_id: 's2', korisnik_id: 'me', status: 'odobren', grupa_id: 'g' }, // već u grupi
  { sekcija_id: 's3', korisnik_id: 'me', status: 'ceka', zeljena_grupa_id: 'g' }, // već izabrao
  { sekcija_id: 's4', korisnik_id: 'me', status: 'odobren' }, // član bez grupe
  { sekcija_id: 's1', korisnik_id: 'drugi', status: 'ceka' },
];

test('izbor grupe: pita samo moje sekcije bez grupe i bez izabrane grupe', () => {
  assert.deepEqual(sectionsToAsk(clanovi, 'me'), ['s1', 's4']);
  assert.deepEqual(sectionsToAsk(clanovi, 'me', (id) => id === 's1'), ['s4'], 'već odgovoreno se ne pita');
  assert.deepEqual(sectionsToAsk(clanovi, null), []);
  assert.equal(PITANO_KEY('s1'), 'lovac.grupa.pitano.s1');
});
