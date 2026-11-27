import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageGroups, groupsOfSection, ungroupedMembers, groupLeaderCandidates, assignableGroups, myGroup } from '../../static/js/grupe.js';
import { groupsHtml } from '../../static/js/sekcija-render.js';

const nameOf = (id) => ({ a: 'Ado Ađić', b: 'Boris Bašić', c: 'Cene Cenić', d: 'Dino Dinić' }[id] || id);
const clanovi = [
  { sekcija_id: 's1', korisnik_id: 'a', status: 'odobren', grupa_id: 'g1' },
  { sekcija_id: 's1', korisnik_id: 'b', status: 'odobren', grupa_id: 'g1' },
  { sekcija_id: 's1', korisnik_id: 'c', status: 'odobren', grupa_id: null },
  { sekcija_id: 's1', korisnik_id: 'd', status: 'ceka', grupa_id: null },
  { sekcija_id: 's2', korisnik_id: 'b', status: 'odobren', grupa_id: null },
];
const grupe = [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'b' }];

test('grupe: ko smije upravljati grupama', () => {
  assert.ok(canManageGroups('admin')); assert.ok(canManageGroups('grupovodja'));
  assert.ok(!canManageGroups('clan', { myId: 'x', sekcija: { revir_id: 'r1' } }));
  assert.ok(canManageGroups('clan', { myId: 'x', sekcija: { revir_id: 'r1' }, revirVodje: [{ korisnik_id: 'x', revir_id: 'r1' }] }));
  assert.ok(!canManageGroups('clan', { myId: 'x', sekcija: { revir_id: 'r2' }, revirVodje: [{ korisnik_id: 'x', revir_id: 'r1' }] }));
  assert.ok(canManageGroups('clan', { myId: 'x', drustvoUloge: [{ korisnik_id: 'x', uloga: 'lovovodja_drustva' }] }));
  assert.ok(!canManageGroups('clan', { myId: 'x', drustvoUloge: [{ korisnik_id: 'x', uloga: 'lovocuvar' }] }));
});

test('grupe: članovi grupe (grupovođa prvi), bez grupe, kandidati', () => {
  const g = groupsOfSection('s1', grupe, clanovi, nameOf);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].clanovi.map((c) => c.id), ['b', 'a']);
  assert.equal(g[0].grupovodja, 'Boris Bašić');
  assert.deepEqual(ungroupedMembers('s1', grupe, clanovi, nameOf).map((c) => c.id), ['c']); // čekanje (d) i druga sekcija se ne računaju
  assert.deepEqual(groupLeaderCandidates('s1', grupe, clanovi, nameOf).map((c) => c.id), ['c']); // b vodi grupu, a je već u grupi: ko je u grupi ne nudi se za drugu
  assert.deepEqual(groupLeaderCandidates('s1', grupe, clanovi, nameOf, [{ korisnik_id: 'c' }]).map((c) => c.id), []); // sklonjen iz pregleda
});

test('grupe: član obrisane grupe je bez grupe; grupovođa raspoređuje samo u svoju', () => {
  const sirota = [{ sekcija_id: 's1', korisnik_id: 'a', status: 'odobren', grupa_id: 'nema' }];
  assert.deepEqual(ungroupedMembers('s1', grupe, sirota, nameOf).map((c) => c.id), ['a']);
  const g = groupsOfSection('s1', [...grupe, { id: 'g2', sekcija_id: 's1', grupovodja_id: 'a' }], clanovi, nameOf);
  assert.equal(assignableGroups(g, { manage: true, myId: 'b' }).length, 2);
  assert.deepEqual(assignableGroups(g, { manage: false, myId: 'b' }).map((x) => x.id), ['g1']);
  assert.deepEqual(myGroup('s1', 'a', grupe, clanovi, nameOf), { id: 'g1', grupovodja: 'Boris Bašić' });
  assert.equal(myGroup('s1', 'c', grupe, clanovi, nameOf), null);
});

test('grupe: HTML — upravljač vidi nova/ukloni, običan član samo spisak; XSS u imenu', () => {
  const groups = groupsOfSection('s1', grupe, clanovi, (id) => (id === 'a' ? '<img src=x onerror=1>' : nameOf(id)));
  const base = { groups, ungrouped: ungroupedMembers('s1', grupe, clanovi, nameOf), candidates: groupLeaderCandidates('s1', grupe, clanovi, nameOf), myId: 'c' };
  const man = groupsHtml({ ...base, manage: true, assignable: assignableGroups(groups, { manage: true, myId: 'c' }) });
  assert.match(man, /data-akcija="grupa-nova"/); assert.match(man, /data-akcija="grupa-ukloni"/); assert.match(man, /Grupa — grupovođa Boris Bašić/);
  assert.match(man, /Bez grupe \(1\)/); assert.match(man, /data-akcija="grupa-dodijeli"/);
  assert.ok(!man.includes('<img'));
  const cl = groupsHtml({ ...base, manage: false, assignable: [] });
  assert.ok(!cl.includes('grupa-nova') && !cl.includes('grupa-ukloni') && !cl.includes('grupa-dodijeli'));
  assert.match(groupsHtml({ ...base, groups: [], ungrouped: [], manage: false, assignable: [] }), /Još nema grupa/);
});

test('grupe: želja lovca — upravljač i grupovođa te grupe je odobravaju, običan član ne', () => {
  const kl = [...clanovi.slice(0, 3), { sekcija_id: 's1', korisnik_id: 'c', status: 'odobren', grupa_id: null, zeljena_grupa_id: 'g1' }].filter((c, i, a) => a.findIndex((x) => x.korisnik_id === c.korisnik_id) === i);
  const withWish = [{ sekcija_id: 's1', korisnik_id: 'c', status: 'odobren', grupa_id: null, zeljena_grupa_id: 'g1' }];
  const groups = groupsOfSection('s1', grupe, clanovi, nameOf);
  const bez = ungroupedMembers('s1', grupe, withWish, nameOf);
  assert.equal(bez[0].zeljena, 'g1');
  const model = { groups, ungrouped: bez, candidates: [], assignable: [] };
  assert.match(groupsHtml({ ...model, manage: true, myId: 'x' }), /data-akcija="grupa-odobri"[^>]*data-grupa="g1"/);
  assert.match(groupsHtml({ ...model, manage: false, myId: 'b' }), /grupa-odobri/, 'grupovođa grupe (b) odobrava');
  const clan = groupsHtml({ ...model, manage: false, myId: 'q' });
  assert.match(clan, /želi u grupu/); assert.ok(!clan.includes('grupa-odobri'));
  void kl;
});
