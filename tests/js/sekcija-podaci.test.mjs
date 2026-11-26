import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myStatus, pristupText } from '../../static/js/sekcije.js';
import {
  mySections, currentHunt, memberActivity, sectionMembers, ACTIVE_MS, activityText,
} from '../../static/js/sekcija-podaci.js';
import {
  validateMessage, newMessage, mergeMessages, unreadCount, formatMessageTime, QUICK_MESSAGES,
} from '../../static/js/poruke.js';

const SEK = [
  { id: 's1', revir_id: 'r1', naziv: 'Krupa A', grupovodja_id: 'g1', aktivno: true },
  { id: 's2', revir_id: 'r1', naziv: 'Krupa B', grupovodja_id: null, aktivno: true },
  { id: 's3', revir_id: 'r2', naziv: 'Otoka A', grupovodja_id: 'g2', aktivno: true },
  { id: 's4', revir_id: 'r1', naziv: 'Skrivena', grupovodja_id: null, aktivno: false },
];
const CL = [
  { sekcija_id: 's1', korisnik_id: 'l1', status: 'odobren' },
  { sekcija_id: 's1', korisnik_id: 'l2', status: 'ceka' },
  { sekcija_id: 's3', korisnik_id: 'l1', status: 'odobren' },
];
const LOVOCUVARI = [{ revir_id: 'r1', korisnik_id: 'c1' }];

test('lovočuvar je lovočuvar CIJELOG revira (obje sekcije Krupe, ne Otoke)', () => {
  assert.equal(myStatus(SEK[0], CL, 'c1', false, LOVOCUVARI), 'lovocuvar');
  assert.equal(myStatus(SEK[1], CL, 'c1', false, LOVOCUVARI), 'lovocuvar');
  assert.equal(myStatus(SEK[2], CL, 'c1', false, LOVOCUVARI), 'nema');
  assert.match(pristupText('lovocuvar'), /lovočuvar revira/i);
  assert.equal(myStatus(SEK[0], CL, 'g1', false, LOVOCUVARI), 'grupovodja');
});

test('moje sekcije: član u više sekcija, grupovođa, lovočuvar revira, admin sve', () => {
  const ctx = { sekcije: SEK, clanovi: CL, lovocuvari: LOVOCUVARI };
  assert.deepEqual(mySections(ctx, { id: 'l1' }).map((s) => s.id), ['s1', 's3'], 'lovac može biti u više sekcija');
  assert.deepEqual(mySections(ctx, { id: 'l2' }).map((s) => s.id), [], 'zahtjev na čekanju nije pristup');
  assert.deepEqual(mySections(ctx, { id: 'g1' }).map((s) => s.id), ['s1']);
  assert.deepEqual(mySections(ctx, { id: 'c1' }).map((s) => s.id), ['s1', 's2'], 'lovočuvar prati samo svoj revir (bez skrivene)');
  assert.deepEqual(mySections(ctx, { id: 'a', is_admin: true }).map((s) => s.id), ['s1', 's2', 's3']);
});

const NOW = Date.parse('2026-12-05T10:00:00Z');
const LOVOVI = [
  { lov: { id: 'l-star', sekcija_id: 's1', status: 'zavrsen', datum: '2026-11-01' } },
  { lov: { id: 'l-toku', sekcija_id: 's1', status: 'u_toku', datum: '2026-12-05' } },
  { lov: { id: 'l-sutra', sekcija_id: 's1', status: 'planiran', datum: '2026-12-06' } },
  { lov: { id: 'l-kasnije', sekcija_id: 's1', status: 'planiran', datum: '2026-12-20' } },
  { lov: { id: 'l-tudji', sekcija_id: 's3', status: 'u_toku', datum: '2026-12-05' } },
];

test('tekući lov sekcije: u toku, inače sljedeći planirani; tuđa sekcija se ne miješa', () => {
  assert.deepEqual([currentHunt(LOVOVI, 's1', NOW).tip, currentHunt(LOVOVI, 's1', NOW).zapis.lov.id], ['u_toku', 'l-toku']);
  const bezToka = LOVOVI.filter((x) => x.lov.id !== 'l-toku');
  assert.deepEqual([currentHunt(bezToka, 's1', NOW).tip, currentHunt(bezToka, 's1', NOW).zapis.lov.id], ['sljedeci', 'l-sutra']);
  assert.equal(currentHunt([LOVOVI[0]], 's1', NOW), null, 'završen lov nije tekući');
  assert.equal(currentHunt(LOVOVI, 's2', NOW), null);
});

test('aktivnost člana u lovu: aktivan (svježa pozicija), u lovu bez signala, pozvan, nije u lovu', () => {
  const lov = { id: 'l', status: 'u_toku' };
  const uc = [{ korisnik_id: 'a', uloga: 'strijelac' }, { korisnik_id: 'b', uloga: 'pogonic' }, { korisnik_id: 'c', uloga: 'strijelac' }];
  const poz = [
    { korisnik_id: 'a', t: new Date(NOW - 2 * 60000).toISOString(), lat: 1, lon: 1 },
    { korisnik_id: 'b', t: new Date(NOW - 40 * 60000).toISOString(), lat: 1, lon: 1 },
  ];
  assert.equal(memberActivity('a', lov, uc, poz, NOW).stanje, 'aktivan');
  assert.equal(memberActivity('b', lov, uc, poz, NOW).stanje, 'bez-signala', 'pozicija starija od 10 min');
  assert.equal(memberActivity('c', lov, uc, poz, NOW).stanje, 'bez-signala', 'u lovu, a nikad javio poziciju');
  assert.equal(memberActivity('x', lov, uc, poz, NOW).stanje, 'nije-u-lovu');
  assert.equal(memberActivity('a', null, uc, poz, NOW).stanje, 'nije-u-lovu');
  assert.equal(memberActivity('a', { id: 'l', status: 'planiran' }, uc, [], NOW).stanje, 'pozvan');
  assert.equal(ACTIVE_MS, 10 * 60000);
  assert.match(activityText(memberActivity('a', lov, uc, poz, NOW), NOW), /Aktivan u lovu · prije 2 min/);
  assert.match(activityText(memberActivity('x', lov, uc, poz, NOW), NOW), /Nije u lovu/);
  assert.equal(memberActivity('a', lov, uc, poz, NOW).uloga, 'strijelac');
});

test('članovi sekcije: grupovođa, lovočuvar revira, pa članovi po abecedi; bez zahtjeva na čekanju', () => {
  const users = [
    { id: 'g1', ime: 'Goran', prezime: 'Grupovođa' }, { id: 'c1', ime: 'Cvjetko', prezime: 'Čuvar' },
    { id: 'l1', ime: 'Zoran', prezime: 'Zec' }, { id: 'l2', ime: 'Adnan', prezime: 'Ajanović' }, { id: 'l3', ime: 'Ćamil', prezime: 'Ćosić' },
  ];
  const cl = [...CL, { sekcija_id: 's1', korisnik_id: 'l3', status: 'odobren' }, { sekcija_id: 's1', korisnik_id: 'l2', status: 'odobren' }];
  const rows = sectionMembers(SEK[0], cl, LOVOCUVARI, users);
  assert.deepEqual(rows.map((r) => [r.id, r.uloga]), [['g1', 'grupovodja'], ['c1', 'lovocuvar'], ['l2', 'clan'], ['l3', 'clan'], ['l1', 'clan']],
    'redoslijed: grupovođa, lovočuvar, članovi po prezimenu (bosanska abeceda: Ajanović, Ćosić, Zec)');
  assert.equal(rows.filter((r) => r.id === 'l2').length, 1, 'bez duplikata');
});

test('poruke: validacija, nova poruka sa klijentskim UUID-om, spajanje bez duplikata, nepročitane', () => {
  assert.equal(validateMessage('  '), 'Upiši poruku');
  assert.match(validateMessage('x'.repeat(1001)), /predugačka/i);
  assert.equal(validateMessage(' Stigao '), null);
  const m = newMessage({ sekcija_id: 's1', autor_id: 'l1', tekst: ' Stigao na stan ', lov_id: 'l' }, NOW);
  assert.match(m.id, /^[0-9a-f-]{36}$/);
  assert.equal(m.tekst, 'Stigao na stan');
  assert.equal(m.sinhronizovano, false);
  assert.equal(m.created_at, new Date(NOW).toISOString());
  const remote = [{ ...m, sinhronizovano: undefined }, { id: 'srv-1', sekcija_id: 's1', autor_id: 'g1', tekst: 'Pogon u 7', created_at: new Date(NOW - 5000).toISOString() }];
  const merged = mergeMessages([m], remote);
  assert.deepEqual(merged.map((x) => x.id), ['srv-1', m.id], 'sortirano po vremenu, bez duplikata');
  assert.equal(merged.find((x) => x.id === m.id).sinhronizovano, true, 'poslana poruka postaje sinhronizovana');
  assert.equal(unreadCount(merged, new Date(NOW - 10000).toISOString(), 'l1'), 1, 'tuđa poruka poslije zadnjeg čitanja; moje se ne broje');
  assert.equal(unreadCount(merged, new Date(NOW + 1000).toISOString(), 'l1'), 0);
  assert.equal(unreadCount(merged, null, 'l1'), 1);
  assert.ok(QUICK_MESSAGES.length >= 3);
});

test('vrijeme poruke: danas samo sat, ranije datum i sat', () => {
  const now = new Date(2026, 11, 5, 15, 0).getTime();
  assert.equal(formatMessageTime(new Date(2026, 11, 5, 9, 5).toISOString(), now), '09:05');
  assert.equal(formatMessageTime(new Date(2026, 11, 4, 18, 30).toISOString(), now), '4.12. 18:30');
});

import { newTodayHunt, huntPresence, addableMembers } from '../../static/js/sekcija-podaci.js';

test('lov za danas: naziv sa datumom, status planiran, revir sekcije', () => {
  const h = newTodayHunt({ id: 'S1', revir_id: 'R1', naziv: 'Krupa 1' }, 'L1', new Date(2026, 10, 9, 8, 0));
  assert.deepEqual(h, { id: 'L1', revir_id: 'R1', sekcija_id: 'S1', status: 'planiran', datum: '2026-11-09', naziv: 'Krupa 1 — 09.11.2026.' });
});

test('prisustvo: član se može prijaviti i odjaviti samo svoju samoprijavu; grupovođa i vanjski ne', () => {
  const z = { lov: { status: 'planiran' }, ucesnici: [{ korisnik_id: 'gv', uloga: 'vodja', samoprijava: false }, { korisnik_id: 'a', uloga: 'strijelac', samoprijava: true }, { korisnik_id: 'b', uloga: 'strijelac', samoprijava: false }] };
  assert.deepEqual(huntPresence(z, 'c', 'clan'), { mine: null, canJoin: true, canLeave: false });
  assert.equal(huntPresence(z, 'a', 'clan').canLeave, true);
  assert.equal(huntPresence(z, 'a', 'clan').canJoin, false);
  assert.equal(huntPresence(z, 'b', 'clan').canLeave, false); // dodao ga je grupovođa
  assert.equal(huntPresence(z, 'gv', 'grupovodja').canJoin, false);
  assert.equal(huntPresence(z, 'x', 'ceka').canJoin, false);
  assert.equal(huntPresence(z, 'x', 'lovocuvar').canJoin, false);
  assert.equal(huntPresence({ ...z, lov: { status: 'zavrsen' } }, 'c', 'clan').canJoin, false);
  assert.equal(huntPresence(null, 'c', 'clan').canJoin, false);
});

test('članovi koje grupovođa još može dodati u lov', () => {
  const clanovi = [
    { sekcija_id: 'S1', korisnik_id: 'a', status: 'odobren' }, { sekcija_id: 'S1', korisnik_id: 'b', status: 'odobren' },
    { sekcija_id: 'S1', korisnik_id: 'c', status: 'ceka' }, { sekcija_id: 'S2', korisnik_id: 'd', status: 'odobren' },
  ];
  assert.deepEqual(addableMembers({ id: 'S1' }, clanovi, [{ korisnik_id: 'a' }]), ['b']);
});

import { huntersCounts, filterHunters, faceStrip } from '../../static/js/sekcija-podaci.js';
import { matchesQuery } from '../../static/js/pretraga.js';

const redovi = [
  { id: 'g', uloga: 'grupovodja', ime: 'Goran Šabić' },
  { id: 'l', uloga: 'lovocuvar', ime: 'Lejla Ćosić' },
  { id: 'a', uloga: 'clan', ime: 'Adnan Đulić' },
  { id: 'b', uloga: 'clan', ime: 'Berin Kos' },
];
const stanja = { g: 'aktivan', l: 'nije-u-lovu', a: 'aktivan', b: 'bez-signala' };
const actOf = (id) => ({ stanje: stanja[id] });

test('lovci sekcije: brojevi po stanju i vodstvo', () => {
  assert.deepEqual(huntersCounts(redovi, actOf), { svi: 4, aktivni: 2, bezSignala: 1, vodstvo: 2 });
});
test('lovci sekcije: filter i pretraga bez dijakritika', () => {
  assert.deepEqual(filterHunters(redovi, actOf, 'aktivni', '', matchesQuery).map((r) => r.id), ['g', 'a']);
  assert.deepEqual(filterHunters(redovi, actOf, 'vodstvo', '', matchesQuery).map((r) => r.id), ['g', 'l']);
  assert.deepEqual(filterHunters(redovi, actOf, 'svi', 'dulic', matchesQuery).map((r) => r.id), ['a']);
});
test('traka lica: prvih n i ostatak', () => {
  assert.deepEqual(faceStrip(redovi, 3).ostalo, 1);
  assert.equal(faceStrip(redovi, 10).lica.length, 4);
});

test('najaktivniji prvi: broj lovova sekcije po članu, isti broj zadržava redoslijed', async () => {
  const { huntCountsByMember, sortByActivity, huntsText } = await import('../../static/js/sekcija-podaci.js');
  const lovovi = [
    { lov: { sekcija_id: 'S' }, ucesnici: [{ korisnik_id: 'b' }, { korisnik_id: 'c' }] },
    { lov: { sekcija_id: 'S' }, ucesnici: [{ korisnik_id: 'b' }] },
    { lov: { sekcija_id: 'DRUGA' }, ucesnici: [{ korisnik_id: 'a' }, { korisnik_id: 'a' }] },
  ];
  const n = huntCountsByMember(lovovi, 'S');
  assert.equal(n.get('b'), 2);
  assert.equal(n.get('a'), undefined);
  const rows = [{ id: 'a' }, { id: 'c' }, { id: 'b' }, { id: 'd' }];
  assert.deepEqual(sortByActivity(rows, n).map((r) => r.id), ['b', 'c', 'a', 'd']);
  assert.equal(huntsText(0), 'bez lovova');
  assert.equal(huntsText(1), '1 lov');
  assert.equal(huntsText(5), '5 lovova');
});
