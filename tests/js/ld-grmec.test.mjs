import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeLd, ldTree } from '../../static/js/ld-grmec.js';
import { ldHtml } from '../../static/js/ld-grmec-ui.js';

const names = { p: 'Petar Predsjednik', l1: 'Luka Prvi', l2: 'Luka Drugi', ld: 'Vođa Udruženja', rv: 'Vođa Revira', s1: 'Sekcija Prvi', g1: 'Goran Grupovođa', x: 'Obični Lovac' };
const nameOf = (id) => names[id] || '';
const ctx = {
  reviri: [{ id: 'r1', naziv: 'Krupa' }, { id: 'r2', naziv: 'Otoka' }, { id: 'r3', naziv: 'Jezerski' }],
  sekcije: [{ id: 's1', naziv: 'Krupa 1', revir_id: 'r1', grupovodja_id: 's1', aktivno: true }, { id: 's2', naziv: 'Krupa 2', revir_id: 'r1', grupovodja_id: null, aktivno: true }],
  clanovi: [{ sekcija_id: 's1', korisnik_id: 'g1', status: 'odobren', grupa_id: 'g' }, { sekcija_id: 's1', korisnik_id: 'x', status: 'odobren', grupa_id: 'g' }, { sekcija_id: 's1', korisnik_id: 'q', status: 'ceka' }],
  grupe: [{ id: 'g', sekcija_id: 's1', grupovodja_id: 'g1' }],
  drustvoUloge: [{ korisnik_id: 'p', uloga: 'predsjednik' }, { korisnik_id: 'l1', uloga: 'lovocuvar' }, { korisnik_id: 'ld', uloga: 'lovovodja_drustva' }],
  revirVodje: [{ revir_id: 'r1', korisnik_id: 'rv' }], lovocuvari: [],
};

test('LD Grmeč: ko vidi tab (rukovodioci), a ko ne', () => {
  for (const id of ['p', 'l1', 'ld', 'rv', 's1']) assert.ok(canSeeLd({ id }, ctx), id);
  assert.ok(canSeeLd({ id: 'a', is_admin: true }, ctx));
  assert.ok(!canSeeLd({ id: 'x' }, ctx), 'obični lovac');
  assert.ok(!canSeeLd({ id: 'g1' }, ctx), 'grupovođa grupe nije među rukovodiocima taba');
  assert.ok(!canSeeLd(null, ctx));
});

test('LD Grmeč: stablo — predsjednik, 2 lovočuvara i lovovođa udruženja, ispod njega revir → sekcija → grupa', () => {
  const { korijen, sazetak } = ldTree(ctx, nameOf);
  assert.equal(korijen.nivo, 'predsjednik');
  assert.equal(korijen.ime, 'Petar Predsjednik');
  assert.deepEqual(korijen.djeca.map((c) => c.nivo), ['lovocuvar', 'lovocuvar', 'lovovodja']);
  assert.equal(korijen.djeca[0].ime, 'Luka Prvi');
  assert.equal(korijen.djeca[1].ime, ''); // drugo mjesto slobodno
  const lv = korijen.djeca[2];
  assert.equal(lv.ime, 'Vođa Udruženja');
  assert.deepEqual(lv.djeca.map((r) => r.uloga), ['Revir Jezerski', 'Revir Krupa', 'Revir Otoka']); // 3 revira
  const krupa = lv.djeca.find((r) => r.uloga === 'Revir Krupa');
  assert.equal(krupa.ime, 'Vođa Revira');
  assert.deepEqual(krupa.djeca.map((s) => s.uloga), ['Krupa 1', 'Krupa 2']);
  assert.equal(krupa.djeca[0].ime, 'Sekcija Prvi');
  assert.equal(krupa.djeca[1].ime, ''); // sekcija bez lovovođe
  assert.equal(krupa.djeca[0].napomena, '2 članova'); // član na čekanju se ne broji
  assert.equal(krupa.djeca[0].djeca[0].ime, 'Goran Grupovođa');
  assert.equal(krupa.djeca[0].djeca[0].napomena, '2 lovaca');
  assert.deepEqual(sazetak, { reviri: 3, sekcija: 2, grupa: 1 });
});

test('LD Grmeč: HTML stablo je ugniježđeno, prazna mjesta se kažu, a ime se escapuje', () => {
  const prazno = ldHtml(ldTree({ reviri: [{ id: 'r1', naziv: 'Krupa' }] }, nameOf));
  assert.match(prazno, /Slobodno mjesto/); assert.match(prazno, /Nije postavljen/); assert.match(prazno, /Lovočuvar udruženja 2/);
  const puno = ldHtml(ldTree(ctx, nameOf));
  assert.match(puno, /data-nivo="predsjednik"/); assert.match(puno, /data-nivo="grupa"/);
  assert.ok(puno.indexOf('data-nivo="revir"') > puno.indexOf('data-nivo="lovovodja"'), 'revir je ispod lovovođe udruženja');
  assert.equal((puno.match(/<ul/g) || []).length, (puno.match(/<\/ul>/g) || []).length);
  const html = ldHtml(ldTree({ ...ctx, drustvoUloge: [{ korisnik_id: 'p', uloga: 'predsjednik' }] }, () => '<img src=x>'));
  assert.ok(!html.includes('<img'));
});

import { ldCandidates } from '../../static/js/ld-grmec.js';

test('LD Grmeč: kandidati — ne nude one koji ulogu već imaju; nova grupa samo iz članova sekcije bez grupe', () => {
  const users = [{ id: 'p' }, { id: 'l1' }, { id: 'x' }, { id: 'g1' }, { id: 'n', odobren: false }];
  const imena = { ...names, n: 'Neodobren' };
  const nm = (id) => imena[id] || '';
  assert.deepEqual(ldCandidates({ uloga: 'predsjednik', korisnikId: 'p' }, ctx, users, nm).map((c) => c.id).sort(), ['g1', 'l1', 'x']);
  // drugi lovočuvar: prvi (l1) se ne nudi ponovo
  assert.ok(!ldCandidates({ uloga: 'lovocuvar', korisnikId: null }, ctx, users, nm).some((c) => c.id === 'l1'));
  // nova grupa u s1: g1 već vodi grupu, x je član bez grupe vođe
  const g = ldCandidates({ sekcijaId: 's1' }, ctx, users, nm, 'grupa').map((c) => c.id);
  assert.deepEqual(g, ['x']);
});

test('LD Grmeč: uređivanje je samo za admina; prazno mjesto nudi "Napravi nalog", zauzeto "Skini"', () => {
  const tree = ldTree(ctx, nameOf);
  const cand = () => [{ id: 'x', ime: 'Obični Lovac' }];
  const pregled = ldHtml(tree);
  assert.ok(!pregled.includes('data-ld-akcija'), 'bez uređivanja nema dugmadi');
  const edit = ldHtml(tree, { edit: true, candidates: cand });
  assert.match(edit, /data-ld-akcija="dodijeli"/); assert.match(edit, /data-ld-akcija="nalog"/); assert.match(edit, /data-ld-akcija="skini"/);
  assert.match(edit, /data-ld-akcija="grupa-nova"/); assert.match(edit, /Ukloni grupu/);
  // slobodan lovočuvar nudi nalog, zauzeti skidanje
  const lc = tree.korijen.djeca.filter((d) => d.nivo === 'lovocuvar');
  assert.ok(lc[0].meta.korisnikId && !lc[1].meta.korisnikId);
});
