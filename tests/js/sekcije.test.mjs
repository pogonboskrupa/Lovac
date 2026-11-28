import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  myStatus, canManage, creatableRevirIds, editsRevir, groupByRevir, pendingRequests, candidatesToAdd, validateSekcija, pristupText, mySectionsAsLeader,
} from '../../static/js/sekcije.js';

const ADMIN = { id: 'a', is_admin: true, odobren: true };
const GV = { id: 'g1', odobren: true };
const LOVAC = { id: 'l1', odobren: true };
const REVIRI = [{ id: 'r1', naziv: 'Krupa' }, { id: 'r2', naziv: 'Otoka' }, { id: 'r3', naziv: 'Jezerski' }];
const SEK = [
  { id: 's1', revir_id: 'r1', naziv: 'Krupa 1', grupovodja_id: 'g1', lovocuvar_id: 'c1', aktivno: true },
  { id: 's2', revir_id: 'r2', naziv: 'Otoka 1', grupovodja_id: 'g2', lovocuvar_id: null, aktivno: true },
  { id: 's3', revir_id: 'r1', naziv: 'Stara', grupovodja_id: null, lovocuvar_id: null, aktivno: false },
];
const CL = [
  { sekcija_id: 's1', korisnik_id: 'l1', status: 'odobren' },
  { sekcija_id: 's1', korisnik_id: 'l2', status: 'ceka' },
  { sekcija_id: 's2', korisnik_id: 'l1', status: 'ceka' },
];

test('moj status u sekciji: lovovođa sekcije, lovočuvar, član, čeka odobrenje, nema pristupa', () => {
  assert.equal(myStatus(SEK[0], CL, 'g1'), 'grupovodja');
  assert.equal(myStatus(SEK[0], CL, 'c1'), 'lovocuvar');
  assert.equal(myStatus(SEK[0], CL, 'l1'), 'clan');
  assert.equal(myStatus(SEK[0], CL, 'l2'), 'ceka');
  assert.equal(myStatus(SEK[1], CL, 'l1'), 'ceka');
  assert.equal(myStatus(SEK[1], CL, 'nepoznat'), 'nema');
  assert.equal(myStatus(SEK[0], CL, 'a', true), 'admin');
});

test('statusi se kažu jasno; bez odobrenja piše da nema ulaza', () => {
  assert.match(pristupText('ceka'), /čeka odobrenje/i);
  assert.match(pristupText('nema'), /nema pristupa/i);
  assert.match(pristupText('clan'), /član/i);
});

test('ko upravlja sekcijom: admin i njen lovovođa sekcije, niko drugi', () => {
  assert.equal(canManage(SEK[0], ADMIN), true);
  assert.equal(canManage(SEK[0], GV), true);
  assert.equal(canManage(SEK[1], GV), false);
  assert.equal(canManage(SEK[0], LOVAC), false);
});

test('u kojim revirima korisnik smije praviti sekciju', () => {
  assert.deepEqual(creatableRevirIds(ADMIN, [], REVIRI), ['r1', 'r2', 'r3']);
  assert.deepEqual(creatableRevirIds(GV, [{ korisnik_id: 'g1', revir_id: 'r2' }], REVIRI), ['r2']);
  assert.deepEqual(creatableRevirIds(LOVAC, [{ korisnik_id: 'g1', revir_id: 'r2' }], REVIRI), []);
});

test('sekcije grupisane po reviru (aktivne), revir bez sekcija ostaje prazan', () => {
  const g = groupByRevir(REVIRI, SEK);
  assert.deepEqual(g.map((x) => [x.revir.naziv, x.sekcije.map((s) => s.naziv)]), [['Krupa', ['Krupa 1']], ['Otoka', ['Otoka 1']], ['Jezerski', []]]);
});

test('zahtjevi na čekanju i kandidati za dodavanje', () => {
  assert.deepEqual(pendingRequests('s1', CL).map((c) => c.korisnik_id), ['l2']);
  const users = [{ id: 'g1' }, { id: 'c1' }, { id: 'l1' }, { id: 'l2' }, { id: 'l3' }];
  assert.deepEqual(candidatesToAdd(SEK[0], CL, users).map((u) => u.id), ['l3'], 'bez lovovođe sekcije, lovočuvara, članova i onih sa zahtjevom');
});

test('forma sekcije', () => {
  assert.equal(validateSekcija({ naziv: 'Krupa 3', revir_id: 'r1' }), null);
  assert.match(validateSekcija({ naziv: 'K', revir_id: 'r1' }), /naziv/i);
  assert.match(validateSekcija({ naziv: 'Krupa 3', revir_id: '' }), /revir/i);
});

test('sekcije kojima sam lovovođa sekcije (za organizaciju lova)', () => {
  assert.deepEqual(mySectionsAsLeader(SEK, 'g1').map((s) => s.id), ['s1']);
});

import { creationMode } from '../../static/js/sekcije.js';
test('ko smije praviti naloge: admin/lovovođa sekcije/lovočuvar direktno, član predlaže, ostali ne', () => {
  assert.equal(creationMode('admin'), 'direct');
  assert.equal(creationMode('grupovodja'), 'direct');
  assert.equal(creationMode('lovocuvar'), 'direct');
  assert.equal(creationMode('clan'), 'predlog');
  assert.equal(creationMode('ceka'), null);
  assert.equal(creationMode('nema'), null);
});

test('bez profila niko nije vođa ni lovočuvar (undefined === undefined zamka)', () => {
  assert.equal(myStatus({ id: 'S', revir_id: 'R', grupovodja_id: undefined, lovocuvar_id: undefined }, [], undefined, false, []), 'nema');
  assert.equal(myStatus({ id: 'S', revir_id: 'R', grupovodja_id: null }, [], null, false, [{ revir_id: 'R', korisnik_id: undefined }]), 'nema');
});

import { isLeadership } from '../../static/js/sekcije.js';
import { newMessage as newMsg2, KANAL_RUKOVODSTVO as KANAL2 } from '../../static/js/poruke.js';
test('rukovodstvo: ko ulazi u kanal i poruka rukovodstva nema sekciju', () => {
  const ctx = { grupovodje: [{ korisnik_id: 'g1', revir_id: 'R' }], sekcije: [{ id: 'S', grupovodja_id: 'g2', aktivno: true }], lovocuvari: [{ korisnik_id: 'l1', revir_id: 'R' }] };
  assert.equal(isLeadership({ id: 'g1' }, ctx), true);
  assert.equal(isLeadership({ id: 'g2' }, ctx), true);
  assert.equal(isLeadership({ id: 'l1' }, ctx), true);
  assert.equal(isLeadership({ id: 'a', is_admin: true }, {}), true);
  assert.equal(isLeadership({ id: 'clan' }, ctx), false);
  assert.equal(isLeadership(null, ctx), false);
  assert.equal(isLeadership({ id: 'g2' }, { sekcije: [{ grupovodja_id: 'g2', aktivno: false }] }), false);
  const m = newMsg2({ kanal: KANAL2, sekcija_id: 'S', autor_id: 'g1', tekst: ' Zdravo ' });
  assert.equal(m.kanal, 'rukovodstvo');
  assert.equal(m.sekcija_id, null);
  assert.equal(m.tekst, 'Zdravo');
  assert.equal(newMsg2({ sekcija_id: 'S', autor_id: 'x', tekst: 'a' }).kanal, 'sekcija');
});

import { isMine, approvalsForMe, sectionsOverview, filterSections, menuSummary } from '../../static/js/sekcije.js';

const D = {
  reviri: [{ id: 'R1', naziv: 'Krupa' }, { id: 'R2', naziv: 'Otoka' }],
  sekcije: [
    { id: 'S1', revir_id: 'R1', naziv: 'Krupa 1', grupovodja_id: 'gv', aktivno: true },
    { id: 'S2', revir_id: 'R1', naziv: 'Krupa 2', grupovodja_id: 'gv2', aktivno: true },
    { id: 'S3', revir_id: 'R2', naziv: 'Otoka 1', grupovodja_id: null, aktivno: true },
    { id: 'S4', revir_id: 'R2', naziv: 'Sakrivena', grupovodja_id: 'gv', aktivno: false },
  ],
  clanovi: [
    { sekcija_id: 'S1', korisnik_id: 'l1', status: 'odobren' },
    { sekcija_id: 'S1', korisnik_id: 'l2', status: 'ceka', created_at: '2026-11-02' },
    { sekcija_id: 'S1', korisnik_id: 'l3', status: 'ceka', created_at: '2026-11-01' },
    { sekcija_id: 'S2', korisnik_id: 'l1', status: 'ceka' },
    { sekcija_id: 'S4', korisnik_id: 'l9', status: 'ceka' },
  ],
  lovocuvari: [{ revir_id: 'R2', korisnik_id: 'lc' }],
};
const U = (id, o = {}) => ({ id, odobren: true, ...o });

test('sekcije: "moje" (član/lovovođa sekcije/lovočuvar/čeka; admin samo izričito), zahtjevi za odobrenje i pregled', () => {
  const ma = (s, id, admin = false) => isMine(s, D.clanovi, id, admin, D.lovocuvari);
  assert.equal(ma(D.sekcije[0], 'l1'), true);
  assert.equal(ma(D.sekcije[1], 'l1'), true, 'zahtjev na čekanju je "moje"');
  assert.equal(ma(D.sekcije[2], 'l1'), false);
  assert.equal(ma(D.sekcije[2], 'lc'), true, 'lovočuvar revira');
  assert.equal(ma(D.sekcije[0], 'adm', true), false, 'admin nije član svake sekcije');
  assert.equal(ma({ ...D.sekcije[0], grupovodja_id: 'adm' }, 'adm', true), true);
  // zahtjevi: lovovođa sekcije svoje, admin sve aktivne; najstariji prvi; sakrivena sekcija se ne računa
  assert.deepEqual(approvalsForMe(D, U('gv')).map((x) => x.zahtjev.korisnik_id), ['l3', 'l2']);
  assert.deepEqual(approvalsForMe(D, U('adm', { is_admin: true })).map((x) => x.zahtjev.korisnik_id), ['l3', 'l2', 'l1']);
  assert.deepEqual(approvalsForMe(D, U('l1')), []);
  assert.deepEqual(sectionsOverview(D, U('gv')), { ukupno: 3, moje: 1, zaOdobrenje: 2, mojiZahtjevi: 0 });
  assert.deepEqual(sectionsOverview(D, U('l1')), { ukupno: 3, moje: 2, zaOdobrenje: 0, mojiZahtjevi: 1 });
});

test('sekcije: filteri Moje / Za odobrenje / Bez pristupa / Sve i pretraga', () => {
  const f = (user, o) => filterSections(D, user, o).map((s) => s.id);
  assert.deepEqual(f(U('l1'), { filter: 'moje' }), ['S1', 'S2']);
  assert.deepEqual(f(U('l1'), { filter: 'slobodne' }), ['S3']);
  assert.deepEqual(f(U('gv'), { filter: 'zahtjevi' }), ['S1']);
  assert.deepEqual(f(U('l1'), { filter: 'zahtjevi' }), []);
  assert.deepEqual(f(U('l1'), { filter: 'sve' }), ['S1', 'S2', 'S3'], 'sakrivena se ne prikazuje');
  assert.deepEqual(f(U('l1'), { filter: 'sve', q: 'otoka' }), ['S3']);
  assert.deepEqual(f(U('l1'), { filter: 'sve', q: 'petar', textOf: (s) => (s.id === 'S2' ? 'Lovovođa sekcije Petar' : '') }), ['S2']);
});

test('sekcije: tekst za pločicu u Meniju', () => {
  assert.equal(menuSummary(D, U('gv')), '2 zahtjeva čekaju tvoje odobrenje'.replace('čekaju', 'čeka'));
  assert.equal(menuSummary({ ...D, clanovi: [D.clanovi[1]] }, U('gv')), '1 zahtjev čeka tvoje odobrenje');
  assert.equal(menuSummary(D, U('l1')), 'Tvoj zahtjev čeka odobrenje');
  assert.equal(menuSummary({ ...D, clanovi: [D.clanovi[0]] }, U('l1')), 'Moje sekcije: 1');
  assert.equal(menuSummary(D, U('niko')), 'Članstvo i odobrenja');
});

test('lovočuvar revira odobrava zahtjeve u sekcijama svog revira, ne tuđeg', async () => {
  const { approvalsForMe, canApprove } = await import('../../static/js/sekcije.js');
  const data = {
    sekcije: [{ id: 's1', revir_id: 'r1', aktivno: true }, { id: 's2', revir_id: 'r2', aktivno: true }],
    clanovi: [{ sekcija_id: 's1', korisnik_id: 'x', status: 'ceka' }, { sekcija_id: 's2', korisnik_id: 'y', status: 'ceka' }],
    lovocuvari: [{ korisnik_id: 'lc', revir_id: 'r1' }],
  };
  const lc = { id: 'lc' };
  assert.equal(canApprove(data.sekcije[0], lc, data.lovocuvari), true);
  assert.equal(canApprove(data.sekcije[1], lc, data.lovocuvari), false);
  assert.deepEqual(approvalsForMe(data, lc).map((a) => a.sekcija.id), ['s1']);
});

test('javne sekcije za registraciju: grupisanje po reviru, bez duplikata i praznih redova', async () => {
  const { groupPublicSections } = await import('../../static/js/sekcije-javno.js');
  const rows = [
    { sekcija_id: 'a', naziv: 'A', revir_id: 'r1', revir: 'Krupa' },
    { sekcija_id: 'b', naziv: 'B', revir_id: 'r2', revir: 'Otoka' },
    { sekcija_id: 'c', naziv: 'C', revir_id: 'r1', revir: 'Krupa' },
    { sekcija_id: 'a', naziv: 'A', revir_id: 'r1', revir: 'Krupa' },
    { naziv: 'bez id-a' },
    { sekcija_id: null, naziv: null, revir_id: 'r3', revir: 'Jezerski' },
  ];
  const g = groupPublicSections(rows);
  assert.deepEqual(g.map((x) => [x.revir, x.sekcije.map((s) => s.id)]), [['Krupa', ['a', 'c']], ['Otoka', ['b']], ['Jezerski', []]]);
  assert.deepEqual(groupPublicSections(null), []);
});

test('pregled sekcija: uputa po ulozi, broj po filteru, starost zahtjeva, traka lica (lovovođa sekcije prvi)', async () => {
  const { sectionsHint, sectionFilterCounts, requestAgeText, memberFaces } = await import('../../static/js/sekcije.js');
  const data = {
    reviri: [{ id: 'r1' }],
    sekcije: [{ id: 's1', revir_id: 'r1', grupovodja_id: 'g', aktivno: true }, { id: 's2', revir_id: 'r1', aktivno: true }],
    clanovi: [
      { sekcija_id: 's1', korisnik_id: 'b', status: 'odobren' }, { sekcija_id: 's1', korisnik_id: 'g', status: 'odobren' },
      { sekcija_id: 's1', korisnik_id: 'a', status: 'odobren' }, { sekcija_id: 's1', korisnik_id: 'x', status: 'ceka' },
    ],
    lovocuvari: [{ korisnik_id: 'lc', revir_id: 'r1' }],
  };
  assert.match(sectionsHint({ id: 'adm', is_admin: true }, data), /sve revire/);
  assert.match(sectionsHint({ id: 'lc' }, data), /svog revira/);
  assert.match(sectionsHint({ id: 'g' }, data), /Vodiš svoju sekciju/);
  assert.match(sectionsHint({ id: 'a' }, data), /zatraži pristup/);
  assert.deepEqual(sectionFilterCounts(data, { id: 'g' }), { moje: 1, zahtjevi: 1, slobodne: 1, sve: 2 });
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(requestAgeText('2026-11-25T08:00:00Z', now), 'danas');
  assert.equal(requestAgeText('2026-11-22T08:00:00Z', now), 'prije 3 dana');
  assert.equal(requestAgeText(null, now), '');
  const names = { a: 'Ado', b: 'Bego', g: 'Goran' };
  const f = memberFaces(data.sekcije[0], data.clanovi, (id) => names[id], 2);
  assert.deepEqual(f.lica.map((x) => x.id), ['g', 'a']);
  assert.equal(f.ostalo, 1);
  assert.equal(f.ukupno, 3);
});

test('vodstvo pravi sekcije: predsjednik i lovovođa udruženja u svakom reviru, lovovođa revira u svom; lovac nigdje', () => {
  const hier = { drustvoUloge: [{ korisnik_id: 'p', uloga: 'predsjednik' }, { korisnik_id: 'ld', uloga: 'lovovodja_drustva' }, { korisnik_id: 'lc', uloga: 'lovocuvar' }], revirVodje: [{ korisnik_id: 'rv', revir_id: 'r2' }] };
  assert.deepEqual(creatableRevirIds({ id: 'p' }, [], REVIRI, [], hier), ['r1', 'r2', 'r3']);
  assert.deepEqual(creatableRevirIds({ id: 'ld' }, [], REVIRI, [], hier), ['r1', 'r2', 'r3']);
  assert.deepEqual(creatableRevirIds({ id: 'rv' }, [], REVIRI, [], hier), ['r2']);
  assert.deepEqual(creatableRevirIds({ id: 'lovac' }, [], REVIRI, [], hier), []);
  assert.equal(editsRevir({ id: 'rv' }, 'r2', [], hier), true);
  assert.equal(editsRevir({ id: 'rv' }, 'r1', [], hier), false);
  assert.equal(editsRevir({ id: 'p' }, 'r3', [], hier), true);
});
