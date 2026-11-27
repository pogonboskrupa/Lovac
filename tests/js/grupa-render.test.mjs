import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHuntHtml, groupMembersHtml, groupStatsHtml } from '../../static/js/grupa-render.js';

const att = { rows: [{ id: 'a', ime: 'Ado <b>', stanje: 'prisutan' }, { id: 'b', ime: 'Bero', stanje: 'nema' }], prisutnih: 1, nema: 1, ne: 0, ukupno: 2 };
const cur = (status, grupa = 'g1') => ({ zapis: { lov: { id: 'l1', naziv: 'Lov', datum: '2099-01-02', status, grupa_id: grupa }, ucesnici: [], stanovi: [] } });
const base = { grupaId: 'g1', att, my: { stanje: 'nema', mozeOdjava: false }, manage: false, canCreate: false, aktivnih: 0 };

test('lov grupe: bez lova grupovođa dobija dugme, lovac poruku', () => {
  assert.match(groupHuntHtml({ ...base, cur: null, canCreate: true }), /data-akcija="gr-novi"/);
  assert.doesNotMatch(groupHuntHtml({ ...base, cur: null }), /gr-novi/);
});
test('lov grupe: bez odgovora nudi Dolazim / Ne dolazim, prisutan nudi samo odjavu ako je samoprijava', () => {
  const h = groupHuntHtml({ ...base, cur: cur('planiran') });
  assert.match(h, /gr-dolazim/); assert.match(h, /gr-ne/);
  const p = groupHuntHtml({ ...base, cur: cur('planiran'), my: { stanje: 'prisutan', mozeOdjava: true } });
  assert.doesNotMatch(p, /gr-dolazim/); assert.match(p, /gr-ne/);
  const dodan = groupHuntHtml({ ...base, cur: cur('planiran'), my: { stanje: 'prisutan', mozeOdjava: false } });
  assert.doesNotMatch(dodan, /data-akcija="gr-ne"/); assert.match(dodan, /dodao te grupovođa/);
  assert.doesNotMatch(groupHuntHtml({ ...base, cur: cur('ne-postoji-kraj') , my: { stanje: 'ne' } }).replace('Javio si da ne dolaziš', ''), /data-akcija="gr-ne"/);
});
test('lov grupe: vođenje samo za upravljača, lov sekcije je označen', () => {
  assert.doesNotMatch(groupHuntHtml({ ...base, cur: cur('planiran') }), /gr-pokreni/);
  assert.match(groupHuntHtml({ ...base, cur: cur('planiran'), manage: true }), /gr-pokreni/);
  assert.match(groupHuntHtml({ ...base, cur: cur('u_toku'), manage: true, aktivnih: 3 }), /gr-zavrsi/);
  assert.match(groupHuntHtml({ ...base, cur: cur('planiran', null) }), /lov cijele sekcije/);
  assert.doesNotMatch(groupHuntHtml({ ...base, cur: cur('zavrsen') }), /gr-dolazim/);
});
test('imena se escapuju', () => {
  assert.doesNotMatch(groupHuntHtml({ ...base, cur: cur('planiran') }), /Ado <b>/);
});
test('lovci grupe: grupovođa označen, Poruka i Gdje si? nisu za mene', () => {
  const members = [{ id: 'g', ime: 'Gvo', grupovodja: true }, { id: 'me', ime: 'Ja', grupovodja: false }];
  const h = groupMembersHtml(members, { myId: 'me', st: 'clan', canPing: (s, r, me, id) => me !== id, actOf: () => ({ stanje: 'nije-u-lovu' }), attState: null, avatarOf: () => null });
  assert.match(h, /Grupovođa/);
  const mine = h.split('<li').find((x) => x.includes('data-uid="me"'));
  assert.doesNotMatch(mine, /gr-poruka|gr-ping/);
});
test('statistika: prazno objašnjenje i trake po članu', () => {
  assert.match(groupStatsHtml({ lovova: 0, prosjek: 0, poClanu: [] }), /još nema održanih/);
  const h = groupStatsHtml({ lovova: 2, prosjek: 75, poClanu: [{ id: 'a', ime: 'Ado', lovova: 2, procenat: 100 }] });
  assert.match(h, /75 %/); assert.match(h, /2 \/ 2/);
});
