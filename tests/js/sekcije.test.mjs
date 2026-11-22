import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  myStatus, canManage, creatableRevirIds, groupByRevir, pendingRequests, candidatesToAdd, validateSekcija, pristupText, mySectionsAsLeader,
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

test('moj status u sekciji: grupovođa, lovočuvar, član, čeka odobrenje, nema pristupa', () => {
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

test('ko upravlja sekcijom: admin i njen grupovođa, niko drugi', () => {
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
  assert.deepEqual(candidatesToAdd(SEK[0], CL, users).map((u) => u.id), ['l3'], 'bez grupovođe, lovočuvara, članova i onih sa zahtjevom');
});

test('forma sekcije', () => {
  assert.equal(validateSekcija({ naziv: 'Krupa 3', revir_id: 'r1' }), null);
  assert.match(validateSekcija({ naziv: 'K', revir_id: 'r1' }), /naziv/i);
  assert.match(validateSekcija({ naziv: 'Krupa 3', revir_id: '' }), /revir/i);
});

test('sekcije kojima sam grupovođa (za organizaciju lova)', () => {
  assert.deepEqual(mySectionsAsLeader(SEK, 'g1').map((s) => s.id), ['s1']);
});

import { creationMode } from '../../static/js/sekcije.js';
test('ko smije praviti naloge: admin/grupovođa/lovočuvar direktno, član predlaže, ostali ne', () => {
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
