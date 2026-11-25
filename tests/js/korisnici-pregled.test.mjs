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
  assert.deepEqual(filterCounts(U, NOW), { svi: 5, cekaju: 3, odobreni: 2, admini: 1 });
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
