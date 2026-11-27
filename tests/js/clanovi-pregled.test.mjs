import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewScope, buildOverview, filterOverview, csvRows, menuText } from '../../static/js/clanovi-pregled.js';
import { matchesQuery } from '../../static/js/pretraga.js';

const ctx = {
  reviri: [{ id: 'r1', naziv: 'Krupa' }, { id: 'r2', naziv: 'Otoka' }],
  sekcije: [{ id: 's1', revir_id: 'r1', naziv: 'Krupa 1', grupovodja_id: 'vs1' }, { id: 's2', revir_id: 'r2', naziv: 'Otoka 1', grupovodja_id: null }],
  grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'a' }],
  clanovi: [
    { sekcija_id: 's1', korisnik_id: 'a', status: 'odobren', grupa_id: 'g1' }, { sekcija_id: 's1', korisnik_id: 'b', status: 'odobren', grupa_id: 'g1' },
    { sekcija_id: 's1', korisnik_id: 'c', status: 'odobren', grupa_id: null }, { sekcija_id: 's1', korisnik_id: 'd', status: 'ceka', grupa_id: null },
    { sekcija_id: 's2', korisnik_id: 'e', status: 'odobren', grupa_id: null },
  ],
  drustvoUloge: [{ korisnik_id: 'pred', uloga: 'predsjednik' }, { korisnik_id: 'lc', uloga: 'lovocuvar' }, { korisnik_id: 'ldd', uloga: 'lovovodja_drustva' }],
  revirVodje: [{ korisnik_id: 'lvr', revir_id: 'r1' }],
  lovocuvari: [{ korisnik_id: 'lc', revir_id: 'r1', drustvo: true }, { korisnik_id: 'lc', revir_id: 'r2', drustvo: true }, { korisnik_id: 'lcr', revir_id: 'r2' }],
};
const names = { a: 'Ado Prvi', b: 'Beno Drugi', c: 'Cero Treći', d: 'Dino', e: 'Edo', vs1: 'Vođa Sekcije' };
const nameOf = (id) => names[id] || id;

test('opseg: vodstvo društva vidi sve, lovovođa i lovočuvar revira samo svoj revir, ostali ništa', () => {
  assert.equal(overviewScope({ id: 'x', is_admin: true }, ctx).sve, true);
  for (const id of ['pred', 'lc', 'ldd']) assert.equal(overviewScope({ id }, ctx).sve, true, id);
  assert.equal(overviewScope({ id: 'pred' }, ctx).uloga, 'Predsjednik');
  const v = overviewScope({ id: 'lvr' }, ctx);
  assert.equal(v.sve, false); assert.deepEqual([...v.reviri], ['r1']); assert.equal(v.uloga, 'Lovovođa revira');
  const l = overviewScope({ id: 'lcr' }, ctx);
  assert.deepEqual([...l.reviri], ['r2']); assert.equal(l.uloga, 'Lovočuvar revira');
  assert.equal(overviewScope({ id: 'vs1' }, ctx), null);
  assert.equal(overviewScope({ id: 'obican' }, ctx), null);
  assert.equal(overviewScope(null, ctx), null);
});
test('stablo: lovovođa revira vidi samo Krupu, cijelo društvo oba revira; brojke', () => {
  const sve = buildOverview(ctx, overviewScope({ id: 'pred' }, ctx), nameOf);
  assert.deepEqual(sve.reviri.map((r) => r.naziv), ['Krupa', 'Otoka']);
  assert.deepEqual(sve.totals, { reviri: 2, sekcija: 2, grupa: 1, clanova: 4, bezGrupe: 2, cekaju: 1 });
  const k = buildOverview(ctx, overviewScope({ id: 'lvr' }, ctx), nameOf);
  assert.deepEqual(k.reviri.map((r) => r.naziv), ['Krupa']);
  assert.equal(k.totals.clanova, 3);
  const s1 = k.reviri[0].sekcije[0];
  assert.equal(s1.vodja.ime, 'Vođa Sekcije'); assert.equal(s1.cekaju, 1);
  assert.deepEqual(s1.grupe[0].clanovi.map((m) => [m.ime, m.vodja]), [['Ado Prvi', true], ['Beno Drugi', false]]);
  assert.deepEqual(s1.bezGrupe.map((m) => m.ime), ['Cero Treći']);
});
test('stablo: član čija grupa nije u kešu računa se kao bez grupe, prazno bez opsega', () => {
  const c2 = { ...ctx, grupe: [] };
  assert.equal(buildOverview(c2, overviewScope({ id: 'pred' }, c2), nameOf).totals.bezGrupe, 4);
  assert.equal(buildOverview(ctx, null).reviri.length, 0);
});
test('filteri i pretraga', () => {
  const ov = buildOverview(ctx, overviewScope({ id: 'pred' }, ctx), nameOf);
  const bez = filterOverview(ov, { filter: 'bez-grupe' }, matchesQuery);
  assert.deepEqual(bez.reviri.flatMap((r) => r.sekcije.flatMap((s) => s.bezGrupe.map((m) => m.ime))).sort(), ['Cero Treći', 'Edo']);
  assert.equal(bez.reviri.flatMap((r) => r.sekcije.flatMap((s) => s.grupe)).length, 0);
  const cek = filterOverview(ov, { filter: 'cekaju' }, matchesQuery);
  assert.deepEqual(cek.reviri.map((r) => r.naziv), ['Krupa']);
  const vod = filterOverview(ov, { filter: 'vodstvo' }, matchesQuery);
  assert.deepEqual(vod.reviri[0].sekcije[0].grupe[0].clanovi.map((m) => m.ime), ['Ado Prvi']);
  const q = filterOverview(ov, { query: 'treci' }, matchesQuery);
  assert.deepEqual(q.reviri.flatMap((r) => r.sekcije.map((s) => s.naziv)), ['Krupa 1']);
  assert.deepEqual(q.reviri[0].sekcije[0].bezGrupe.map((m) => m.ime), ['Cero Treći']);
  const po = filterOverview(ov, { query: 'ado' }, matchesQuery); // pretraga po grupovođi pokazuje cijelu grupu
  assert.equal(po.reviri[0].sekcije[0].grupe[0].clanovi.length, 2);
  assert.equal(filterOverview(ov, { query: 'nepostoji' }, matchesQuery).reviri.length, 0);
});
test('CSV i tekst pločice', () => {
  const ov = buildOverview(ctx, overviewScope({ id: 'pred' }, ctx), nameOf);
  const rows = csvRows(ov);
  assert.equal(rows.length, 5); // vođa sekcije + 2 u grupi + 1 bez grupe (Krupa) + 1 bez grupe (Otoka)
  assert.ok(rows.some((r) => r.clan === 'Ado Prvi' && r.uloga === 'Grupovođa'));
  assert.match(menuText(ov), /4 članova · 1 grupa/);
});

test('korisnik koga je admin sklonio iz pregleda (izvanPregleda) se ne prikazuje i ne broji', () => {
  const ctx = {
    reviri: [{ id: 'r1', naziv: 'R' }], sekcije: [{ id: 's1', revir_id: 'r1', naziv: 'S' }], grupe: [],
    clanovi: [{ sekcija_id: 's1', korisnik_id: 'a', status: 'odobren' }, { sekcija_id: 's1', korisnik_id: 'b', status: 'odobren' }],
    izvanPregleda: [{ korisnik_id: 'b' }],
  };
  const ov = buildOverview(ctx, { sve: true, reviri: new Set() }, (id) => id);
  assert.equal(ov.totals.clanova, 1);
  assert.deepEqual(ov.reviri[0].sekcije[0].bezGrupe.map((m) => m.id), ['a']);
});
