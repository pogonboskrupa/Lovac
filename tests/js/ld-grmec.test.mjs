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
  assert.equal(sazetak.reviri, 3); assert.equal(sazetak.sekcija, 2); assert.equal(sazetak.grupa, 1);
  // mjesta: predsjednik, 2 lovočuvara, lovovođa udruženja, 3 revira, 2 sekcije = 9; popunjeno: predsjednik, lovočuvar 1, lovovođa, revir Krupa, sekcija Krupa 1
  assert.equal(sazetak.mjesta, 9); assert.equal(sazetak.popunjeno, 5); assert.equal(sazetak.slobodno, 4);
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

import { canAddToGroup, groupAddable } from '../../static/js/ld-grmec.js';
test('LD Grmeč: ko dodaje lovce u grupu, ko se nudi, i dugmad u HTML-u', () => {
  assert.ok(canAddToGroup({ id: 'a', is_admin: true }, ctx, 's1'));
  assert.ok(canAddToGroup({ id: 's1' }, ctx, 's1'), 'lovovođa sekcije');
  assert.ok(canAddToGroup({ id: 'rv' }, ctx, 's1'), 'lovovođa revira');
  assert.ok(canAddToGroup({ id: 'ld' }, ctx, 's1'), 'lovovođa udruženja');
  assert.ok(!canAddToGroup({ id: 'g1' }, ctx, 's1'), 'grupovođa grupe ne dodaje (uslov: lovovođe)');
  assert.ok(!canAddToGroup({ id: 'x' }, ctx, 's1'));
  assert.deepEqual(groupAddable('s1', ctx, nameOf).map((c) => c.id), []); // svi odobreni su već u grupi g
  const tree = ldTree(ctx, nameOf);
  const html = ldHtml(tree, { canAdd: () => true, addable: () => [{ id: 'x', ime: 'Obični Lovac' }] });
  assert.match(html, /data-ld-akcija="lovac-u-grupi"/); assert.match(html, /data-ld-akcija="u-grupu"/);
  assert.ok(!ldHtml(tree, { canAdd: () => false }).includes('lovac-u-grupi'));
  assert.ok(!html.includes('data-ld-akcija="skini"'), 'uklanjanje grupe samo uz uređivanje');
  // sklapanje: sklopljeni revir ne crta djecu
  const rid = tree.korijen.djeca[2].djeca.find((r) => r.uloga === 'Revir Krupa').kljuc;
  const sklopljen = ldHtml(tree, { sklopljeno: new Set([rid]) });
  assert.ok(!sklopljen.includes('data-nivo="sekcija"'));
});

test('LD Grmeč: lovci su prikazani ispod grupe (bez grupovođe), članovi bez grupe u zasebnom čvoru, čekaoci se ne prikazuju', () => {
  const c2 = { ...ctx, clanovi: [...ctx.clanovi, { sekcija_id: 's1', korisnik_id: 'y', status: 'odobren', grupa_id: null }] };
  const nm = (id) => ({ ...names, y: 'Bez Grupe' }[id] || '');
  const { korijen, sazetak } = ldTree(c2, nm);
  const sek = korijen.djeca.find((d) => d.nivo === 'lovovodja').djeca.find((r) => r.meta.revirId === 'r1').djeca.find((s) => s.meta.sekcijaId === 's1');
  const grupa = sek.djeca.find((d) => d.nivo === 'grupa');
  assert.deepEqual(grupa.djeca.map((d) => d.ime), ['Obični Lovac']);
  const bez = sek.djeca.find((d) => d.nivo === 'bez-grupe');
  assert.deepEqual(bez.djeca.map((d) => d.ime), ['Bez Grupe']);
  assert.ok(!sek.djeca.flatMap((d) => d.djeca).some((d) => d.nivo === 'lovac' && d.ime === 'Nepoznat član'));
  assert.equal(sazetak.grupa, 1);
  // lovci i čvor "bez grupe" nisu mjesta za popunjavanje
  assert.equal(ldTree(ctx, nameOf).sazetak.mjesta, sazetak.mjesta);
  const html = ldHtml(ldTree(c2, nm));
  assert.match(html, /data-nivo="lovac"/); assert.match(html, /Obični Lovac/); assert.match(html, /Članovi bez grupe/);
});


import { ungroupedMembers, groupsOfSection } from '../../static/js/grupe.js';
import { buildOverview, overviewScope } from '../../static/js/clanovi-pregled.js';

test('grupovođa čiji red u članstvu nema grupu ne nudi se za "Dodaj u grupu" niti je "bez grupe", a broji se u svojoj grupi', () => {
  const c = { ...ctx, clanovi: [{ sekcija_id: 's1', korisnik_id: 'g1', status: 'odobren', grupa_id: null }, { sekcija_id: 's1', korisnik_id: 'x', status: 'odobren', grupa_id: null }] };
  assert.deepEqual(groupAddable('s1', c, nameOf).map((m) => m.id), ['x']);
  assert.deepEqual(ungroupedMembers('s1', c.grupe, c.clanovi, nameOf).map((m) => m.id), ['x']);
  assert.ok(groupsOfSection('s1', c.grupe, c.clanovi, nameOf)[0].clanovi.some((m) => m.id === 'g1'));
  const sek = ldTree(c, nameOf).korijen.djeca.find((d) => d.nivo === 'lovovodja').djeca.find((r) => r.meta.revirId === 'r1').djeca.find((s) => s.meta.sekcijaId === 's1');
  assert.deepEqual(sek.djeca.find((d) => d.nivo === 'bez-grupe').djeca.map((d) => d.ime), ['Obični Lovac']);
  assert.equal(sek.djeca.find((d) => d.nivo === 'grupa').napomena, '1 lovaca');
  const ov = buildOverview(c, overviewScope({ id: 'p' }, c), nameOf);
  const s1 = ov.reviri.find((r) => r.id === 'r1').sekcije.find((s) => s.id === 's1');
  assert.deepEqual(s1.bezGrupe.map((m) => m.id), ['x']);
  assert.ok(s1.grupe[0].clanovi.some((m) => m.id === 'g1' && m.vodja));
});
