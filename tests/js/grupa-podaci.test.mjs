import test from 'node:test';
import assert from 'node:assert/strict';
import { myGroupSlot, groupMembers, groupHunts, currentGroupHunt, attendance, myAttendance, groupStats } from '../../static/js/grupa-podaci.js';

const S1 = { id: 's1', revir_id: 'r1', naziv: 'Sekcija', grupovodja_id: 'vs', aktivno: true };
const clanovi = [
  { sekcija_id: 's1', korisnik_id: 'a', status: 'odobren', grupa_id: 'g1' },
  { sekcija_id: 's1', korisnik_id: 'b', status: 'odobren', grupa_id: 'g1' },
  { sekcija_id: 's1', korisnik_id: 'c', status: 'odobren', grupa_id: 'g2' },
  { sekcija_id: 's1', korisnik_id: 'd', status: 'odobren', grupa_id: null },
  { sekcija_id: 's1', korisnik_id: 'e', status: 'ceka', grupa_id: 'g1' },
  { sekcija_id: 's1', korisnik_id: 'vs', status: 'odobren', grupa_id: 'g1' },
];
const ctx = { sekcije: [S1], clanovi, lovocuvari: [], drustvoUloge: [], revirVodje: [], grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'b' }, { id: 'g2', sekcija_id: 's1', grupovodja_id: 'c' }] };

test('moja grupa: lovac u grupi, grupovođa grupe', () => {
  assert.deepEqual(myGroupSlot(ctx, { id: 'a' }), { sekcija: S1, grupaId: 'g1' });
  assert.equal(myGroupSlot(ctx, { id: 'b' }).grupaId, 'g1');
});
test('moja grupa: bez grupe, na čekanju i nepoznat nemaju tab grupe', () => {
  assert.equal(myGroupSlot(ctx, { id: 'd' }), null);
  assert.equal(myGroupSlot(ctx, { id: 'e' }), null);
  assert.equal(myGroupSlot(ctx, { id: 'x' }), null);
  assert.equal(myGroupSlot(ctx, null), null);
});
test('moja grupa: lovovođa sekcije, admin i viši u lancu ostaju na sekciji', () => {
  assert.equal(myGroupSlot(ctx, { id: 'vs' }), null);
  assert.equal(myGroupSlot(ctx, { id: 'a', is_admin: true }), null);
  assert.equal(myGroupSlot({ ...ctx, revirVodje: [{ korisnik_id: 'a', revir_id: 'r1' }] }, { id: 'a' }), null);
  assert.equal(myGroupSlot({ ...ctx, drustvoUloge: [{ korisnik_id: 'a', uloga: 'predsjednik' }] }, { id: 'a' }), null);
  assert.equal(myGroupSlot({ ...ctx, lovocuvari: [{ korisnik_id: 'a', revir_id: 'r1' }] }, { id: 'a' }), null);
});
test('moja grupa: više sekcija — prednost ima izabrana', () => {
  const s2 = { id: 's2', revir_id: 'r1', naziv: 'Druga', aktivno: true };
  const c2 = { ...ctx, sekcije: [S1, s2], clanovi: [...clanovi, { sekcija_id: 's2', korisnik_id: 'a', status: 'odobren', grupa_id: 'g9' }] };
  assert.equal(myGroupSlot(c2, { id: 'a' }, 's2').grupaId, 'g9');
  assert.equal(myGroupSlot(c2, { id: 'a' }).grupaId, 'g1');
});
test('članovi grupe: grupovođa prvi, samo odobreni iz te grupe', () => {
  const m = groupMembers(ctx, 'g1', (id) => ({ a: 'Ado', b: 'Zoran', vs: 'Vođa' }[id] || id));
  assert.deepEqual(m.map((x) => x.id), ['b', 'a', 'vs']);
  assert.equal(m[0].grupovodja, true);
});
const lov = (id, grupa, status, datum, ucesnici = []) => ({ id, lov: { id, sekcija_id: 's1', grupa_id: grupa, status, datum }, ucesnici: ucesnici.map((u) => ({ korisnik_id: u })), stanovi: [] });
test('lovovi grupe: svoja grupa i cijela sekcija, ne tuđa grupa', () => {
  const l = [lov('1', 'g1', 'planiran', '2099-01-01'), lov('2', null, 'planiran', '2099-01-02'), lov('3', 'g2', 'planiran', '2099-01-03')];
  assert.deepEqual(groupHunts(l, 's1', 'g1').map((z) => z.id), ['1', '2']);
  assert.equal(currentGroupHunt(l, 's1', 'g1', Date.parse('2098-12-01')).zapis.id, '1');
  assert.equal(currentGroupHunt([lov('3', 'g2', 'u_toku', '2099-01-03')], 's1', 'g1'), null);
});
test('prisustvo: svi nisu uvijek prisutni, ne dolazim i bez odgovora', () => {
  const members = groupMembers(ctx, 'g1', (id) => id);
  const r = attendance(members, [{ korisnik_id: 'a' }], [{ korisnik_id: 'vs', odgovor: 'ne' }]);
  assert.equal(r.prisutnih, 1); assert.equal(r.ne, 1); assert.equal(r.nema, 1); assert.equal(r.ukupno, 3);
  assert.deepEqual(r.rows.map((x) => x.stanje), ['prisutan', 'nema', 'ne']);
});
test('moje prisustvo: samoprijava se može povući, dodavanje od grupovođe ne', () => {
  const z = { ucesnici: [{ korisnik_id: 'a', samoprijava: true }, { korisnik_id: 'b' }] };
  assert.deepEqual(myAttendance(z, 'a'), { stanje: 'prisutan', mozeOdjava: true });
  assert.deepEqual(myAttendance(z, 'b'), { stanje: 'prisutan', mozeOdjava: false });
  assert.equal(myAttendance(z, 'x', 'ne').stanje, 'ne');
  assert.deepEqual(myAttendance(z, 'x', 'da'), { stanje: 'prisutan', mozeOdjava: true }); // odgovor važi prije servera
  assert.equal(myAttendance(z, 'x').stanje, 'nema');
});
test('statistika grupe: prosjek prisutnosti i lovovi po članu; planirani i tuđi se ne broje', () => {
  const members = [{ id: 'a', ime: 'Ado' }, { id: 'b', ime: 'Bero' }];
  const l = [lov('1', 'g1', 'zavrsen', '2026-01-01', ['a', 'b']), lov('2', 'g1', 'zavrsen', '2026-02-01', ['a', 'tudji']),
    lov('3', 'g1', 'planiran', '2026-03-01', ['a']), lov('4', 'g2', 'zavrsen', '2026-02-02', ['a'])];
  const s = groupStats(l, 's1', 'g1', members);
  assert.equal(s.lovova, 2);
  assert.equal(s.prosjek, 75);
  assert.deepEqual(s.poClanu.map((x) => [x.id, x.lovova, x.procenat]), [['a', 2, 100], ['b', 1, 50]]);
  assert.deepEqual(groupStats([], 's1', 'g1', members), { lovova: 0, prosjek: 0, poClanu: [{ id: 'a', ime: 'Ado', lovova: 0, procenat: 0 }, { id: 'b', ime: 'Bero', lovova: 0, procenat: 0 }] });
});

import { groupIdIn, groupBanner, groupOverview } from '../../static/js/grupa-podaci.js';

test('grupa u sekciji: i za rukovodioca koji je član grupe', () => {
  assert.equal(groupIdIn(clanovi, 'a', 's1'), 'g1');
  assert.equal(groupIdIn(clanovi, 'vs', 's1'), 'g1');
  assert.equal(groupIdIn(clanovi, 'd', 's1'), null);
  assert.equal(groupIdIn(clanovi, 'e', 's1'), null);
});
test('traka na mapi: lov grupe sa prisutnima i pozivom da se javi', () => {
  const now = Date.parse('2099-01-01T08:00:00');
  const l = [lov('1', 'g1', 'planiran', '2099-01-02', ['b'])];
  const t = groupBanner(ctx, l, { id: 'a' }, now);
  assert.equal(t.kad, 'sutra'); assert.equal(t.prisutnih, 1); assert.equal(t.ukupno, 3); assert.equal(t.moj, false);
  assert.match(t.tekst, /javi dolaziš li/);
  const moj = groupBanner(ctx, [lov('1', 'g1', 'planiran', '2099-01-01', ['a', 'b'])], { id: 'a' }, now);
  assert.equal(moj.kad, 'danas'); assert.doesNotMatch(moj.tekst, /javi/);
  assert.equal(groupBanner(ctx, [lov('1', 'g1', 'u_toku', '2098-12-31')], { id: 'a' }, now).kad, 'u toku');
});
test('traka na mapi: nema lova, tuđa grupa, rukovodilac', () => {
  const now = Date.parse('2099-01-01T08:00:00');
  assert.equal(groupBanner(ctx, [], { id: 'a' }, now), null);
  assert.equal(groupBanner(ctx, [lov('3', 'g2', 'planiran', '2099-01-02')], { id: 'a' }, now), null);
  assert.equal(groupBanner(ctx, [lov('1', 'g1', 'planiran', '2099-01-02')], { id: 'vs' }, now), null);
});
test('pregled grupa: članovi, lovovi i prisutnost na zadnjem lovu', () => {
  const l = [lov('1', 'g1', 'zavrsen', '2026-10-01', ['a']), lov('2', 'g1', 'zavrsen', '2026-11-01', ['a', 'b']), lov('3', 'g1', 'planiran', '2026-12-01'), lov('4', 'g2', 'zavrsen', '2026-11-05', ['c'])];
  const o = groupOverview(ctx, l, 's1', (id) => id);
  const g1 = o.find((x) => x.id === 'g1');
  assert.equal(g1.clanova, 3); assert.equal(g1.lovova, 2);
  assert.deepEqual(g1.zadnji, { datum: '2026-11-01', status: 'zavrsen', prisutnih: 2 });
  assert.equal(o.find((x) => x.id === 'g2').zadnji.prisutnih, 1);
  assert.equal(groupOverview(ctx, [], 's1').every((x) => x.zadnji === null), true);
});
