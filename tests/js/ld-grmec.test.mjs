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
