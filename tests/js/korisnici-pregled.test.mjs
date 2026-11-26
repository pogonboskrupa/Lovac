import test from 'node:test';
import assert from 'node:assert/strict';
import { userState, usersOverview, filterUsers, filterCounts, reviewOrder, sectionLines, pendingBadgeText } from '../../static/js/korisnici-pregled.js';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const U = [
  { id: 'a', ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: true },
  { id: 'b', ime: 'Novo', prezime: 'Lice', nadimak: '127', odobren: false },
  { id: 'c', ime: 'Pero', prezime: 'Probni', odobren: false, probni_do: '2026-11-26T08:00:00Z' },
  { id: 'd', ime: 'Mujo', prezime: 'Čehić', odobren: true },
  { id: 'e', ime: 'Stari', prezime: 'Probni', odobren: false, probni_do: '2026-11-20T08:00:00Z' },
];

test('stanje se izvodi iz kolona servera: istekao probni period = čeka odluku, ne "probni"', () => {
  assert.deepEqual(U.map((u) => userState(u, NOW)), ['admin', 'ceka', 'probni', 'odobren', 'ceka']);
});

test('pregled: brojke, filteri sa brojevima i pretraga bez dijakritika (i po sekciji)', () => {
  assert.deepEqual(usersOverview(U, NOW), { ukupno: 5, ceka: 2, probni: 1, odobreni: 2, admini: 1 });
  assert.deepEqual(filterCounts(U, NOW), { svi: 5, cekaju: 3, odobreni: 2, vodstvo: 1, admini: 1, bez: 1 });
  assert.deepEqual(filterUsers(U, { filter: 'cekaju', now: NOW }).map((u) => u.id), ['b', 'c', 'e']);
  assert.deepEqual(filterUsers(U, { q: 'cehic', now: NOW }).map((u) => u.id), ['d']);
  assert.deepEqual(filterUsers(U, { q: '127', now: NOW }).map((u) => u.id), ['b']);
  assert.deepEqual(filterUsers(U, { q: 'krupa', now: NOW, extra: (u) => (u.id === 'c' ? 'Krupa 1 (Krupa)' : '') }).map((u) => u.id), ['c']);
});

test('redoslijed: prvo ko čeka, pa probni (kome prije ističe), pa odobreni po prezimenu', () => {
  assert.deepEqual(reviewOrder(U, NOW).map((u) => u.id), ['b', 'e', 'c', 'a', 'd']);
});

test('sekcije korisnika iz keša: traži / član; sekcija koje nema u kešu se preskaču', () => {
  const data = {
    reviri: [{ id: 'r1', naziv: 'Krupa' }],
    sekcije: [{ id: 's1', naziv: 'Krupa 1', revir_id: 'r1' }],
    clanovi: [{ sekcija_id: 's1', korisnik_id: 'c', status: 'ceka' }, { sekcija_id: 's1', korisnik_id: 'd', status: 'odobren' }, { sekcija_id: 'x', korisnik_id: 'd', status: 'odobren' }],
  };
  assert.deepEqual(sectionLines('c', data), { traze: ['Krupa 1 (Krupa)'], clan: [] });
  assert.deepEqual(sectionLines('d', data), { traze: [], clan: ['Krupa 1 (Krupa)'] });
  assert.equal(pendingBadgeText(0), '');
  assert.equal(pendingBadgeText(3), '3 čeka odluku');
});

test('"Odobri i primi u sekciju": zahtjevi koje admin može odobriti, natpis dugmeta i datum registracije', async () => {
  const { approvableRequests, approveLabel, registeredText } = await import('../../static/js/korisnici-pregled.js');
  const data = {
    sekcije: [{ id: 's1', naziv: 'Krupa 1' }, { id: 's2', naziv: 'Otoka 1' }],
    clanovi: [
      { sekcija_id: 's1', korisnik_id: 'c', status: 'ceka' },
      { sekcija_id: 's2', korisnik_id: 'c', status: 'ceka', pozvao_id: 'x' }, // predloženi nalog: ide kroz odobri_pozvanog
      { sekcija_id: 's2', korisnik_id: 'c', status: 'odobren' },
    ],
  };
  const r = approvableRequests('c', data);
  assert.deepEqual(r, [{ sekcija_id: 's1', naziv: 'Krupa 1' }]);
  assert.equal(approveLabel(r), 'Odobri i primi u Krupa 1');
  assert.equal(approveLabel([]), 'Odobri');
  assert.equal(approveLabel([r[0], r[0]]), 'Odobri i primi u sekcije (2)');
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(registeredText({ created_at: '2026-11-25T08:00:00Z' }, now), 'Registrovan danas');
  assert.equal(registeredText({ created_at: '2026-11-24T08:00:00Z' }, now), 'Registrovan jučer');
  assert.equal(registeredText({ created_at: '2026-11-20T08:00:00Z' }, now), 'Registrovan prije 5 dana');
  assert.equal(registeredText({}, now), '');
});

import { roleInfo, sectionTargets, leaderTargets, keeperTargets, rolesOverview, rolesText, inSection, matchesFilter as mf, filterUsers as fu, filterCounts as fc, USER_FILTERS as UF } from '../../static/js/korisnici-pregled.js';

const DATA = {
  reviri: [{ id: 'r1', naziv: 'Krupa' }, { id: 'r2', naziv: 'Otoka' }],
  sekcije: [
    { id: 's1', naziv: 'Krupa 1', revir_id: 'r1', grupovodja_id: 'g1' },
    { id: 's2', naziv: 'Krupa 2', revir_id: 'r1', grupovodja_id: null },
    { id: 's3', naziv: 'Otoka 1', revir_id: 'r2', grupovodja_id: 'g1', aktivno: false },
  ],
  clanovi: [
    { sekcija_id: 's1', korisnik_id: 'l1', status: 'odobren' },
    { sekcija_id: 's2', korisnik_id: 'l2', status: 'ceka', pozvao_id: 'x' },
  ],
  lovocuvari: [{ korisnik_id: 'k1', revir_id: 'r2' }],
};
const KU = (id, extra = {}) => ({ id, ime: id, prezime: 'P', odobren: true, is_admin: false, ...extra });
const USERS = [KU('a1', { is_admin: true }), KU('g1'), KU('k1'), KU('l1'), KU('l2'), KU('b1'), KU('n1', { odobren: false })];

test('roleInfo: vodi sekcije, lovočuvar revira, član i zahtjevi iz keša sekcija', () => {
  const g = roleInfo('g1', DATA);
  assert.deepEqual(g.vodi.map((x) => x.id), ['s1', 's3']);
  assert.equal(g.vodi[0].tekst, 'Krupa 1 (Krupa)');
  assert.deepEqual(roleInfo('k1', DATA).lovocuvar, [{ id: 'r2', tekst: 'Otoka' }]);
  assert.equal(roleInfo('l1', DATA).clan[0].tekst, 'Krupa 1 (Krupa)');
  assert.equal(roleInfo('l2', DATA).traze[0].pozvao_id, 'x');
  assert.deepEqual(roleInfo('niko', DATA), { vodi: [], lovocuvar: [], clan: [], traze: [] });
  assert.deepEqual(roleInfo('l1', {}), { vodi: [], lovocuvar: [], clan: [], traze: [] });
});

test('filteri Vodstvo i Bez sekcije; brojevi i sekcija', () => {
  const ids = (f, extra = {}) => fu(USERS, { filter: f, data: DATA, ...extra }).map((u) => u.id);
  assert.deepEqual(ids('vodstvo'), ['a1', 'g1', 'k1']);
  assert.deepEqual(ids('bez'), ['k1', 'l2', 'b1']);
  assert.deepEqual(ids('svi', { sekcija: 's1' }), ['g1', 'l1']);
  assert.deepEqual(ids('svi', { sekcija: 's2' }), ['l2']);
  assert.deepEqual(ids('svi', { sekcija: 'bez' }), ['a1', 'k1', 'b1', 'n1']);
  assert.ok(!mf(USERS[6], 'vodstvo', Date.now(), DATA), 'neodobren nije u vodstvu');
  const c = fc(USERS, Date.now(), DATA);
  assert.equal(c.vodstvo, 3);
  assert.equal(c.bez, 3);
  assert.deepEqual(UF.map(([k]) => k), ['svi', 'cekaju', 'odobreni', 'vodstvo', 'admini', 'bez']);
  assert.ok(inSection('l1', '', DATA));
});

test('ciljevi: premještanje bez sekcija gdje već jesi, imenovanje pokazuje trenutnog vođu, lovočuvar bez revira gdje već jesi', () => {
  assert.deepEqual(sectionTargets('l1', DATA).map((t) => t.id), ['s2']); // s1 već član, s3 neaktivna
  assert.deepEqual(sectionTargets('b1', DATA).map((t) => t.id), ['s1', 's2']);
  const lt = leaderTargets('l1', USERS, DATA);
  assert.deepEqual(lt.map((t) => [t.id, t.trenutni]), [['s1', 'g1 P'], ['s2', '']]);
  assert.deepEqual(leaderTargets('g1', USERS, DATA).map((t) => t.id), ['s2']); // s1 već vodi
  assert.deepEqual(keeperTargets('k1', DATA).map((t) => t.id), ['r1']);
  assert.deepEqual(keeperTargets('b1', DATA).map((t) => t.id), ['r1', 'r2']);
});

test('pregled uloga: broji različite ljude, ne redove', () => {
  const o = rolesOverview(USERS, DATA);
  assert.deepEqual(o, { grupovodje: 1, lovocuvari: 1, bez: 3 });
  assert.equal(rolesText(o), '1 lovovođa sekcije · 1 lovočuvara · 3 bez sekcije');
});
