import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareGroup, canShareToSection } from '../../static/js/lokacija-sekcija.js';

const ctx = {
  sekcije: [{ id: 's1', aktivno: true }, { id: 's2', aktivno: false }],
  clanovi: [
    { sekcija_id: 's1', korisnik_id: 'a', status: 'odobren', grupa_id: 'g1' },
    { sekcija_id: 's1', korisnik_id: 'b', status: 'odobren', grupa_id: null },
    { sekcija_id: 's1', korisnik_id: 'c', status: 'ceka', grupa_id: 'g1' },
    { sekcija_id: 's2', korisnik_id: 'd', status: 'odobren', grupa_id: 'g2' },
  ],
  grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'e' }],
};

test('lovac u grupi dijeli sa grupom', () => assert.deepEqual(shareGroup(ctx, 'a'), { sekcijaId: 's1', grupaId: 'g1' }));
test('grupovođa bez grupe u članstvu ipak dijeli sa svojom grupom', () => assert.deepEqual(shareGroup(ctx, 'e'), { sekcijaId: 's1', grupaId: 'g1' }));
test('bez grupe, na čekanju ili u neaktivnoj sekciji nema grupe (dijeli se sa sekcijom)', () => {
  for (const id of ['b', 'c', 'd', 'x', null]) assert.equal(shareGroup(ctx, id), null);
});
test('dijeliti smiju svi koji imaju veze sa sekcijom', () => assert.ok(canShareToSection('clan') && canShareToSection('admin') && !canShareToSection('nema')));
