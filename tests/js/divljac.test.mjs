import test from 'node:test';
import assert from 'node:assert/strict';
import { VRSTE_DIVLJACI, filterSpecies, allSpeciesText, DIVLJAC_NAPOMENA } from '../../static/js/divljac.js';
import { DEFAULT_SPISKOVI } from '../../static/js/spiskovi.js';

test('divljač: svih sedam traženih vrsta, sa svim dijelovima sadržaja', () => {
  assert.deepEqual(VRSTE_DIVLJACI.map((v) => v.kod), ['divlja_svinja', 'srna', 'medvjed', 'vuk', 'cagalj', 'fazan', 'zec']);
  for (const v of VRSTE_DIVLJACI) {
    assert.ok(v.naziv && v.latinski && v.kratko, v.kod);
    assert.ok(v.brojke.length >= 3, `${v.kod}: brojke`);
    const naslovi = v.sekcije.map(([n]) => n);
    for (const n of ['Izgled i karakteristike', 'Biologija i razmnožavanje', 'Ponašanje i prehrana', 'Tragovi i znakovi', 'Značajno za lov']) {
      assert.ok(naslovi.includes(n), `${v.kod}: nedostaje "${n}"`);
    }
    for (const [, tacke] of v.sekcije) assert.ok(tacke.length >= 1);
  }
});

test('divljač: datumi lovostaja i lovnog vremena se ne zakucavaju u tekst (unosi ih administrator)', () => {
  const text = VRSTE_DIVLJACI.flatMap(allSpeciesText).join('\n');
  assert.doesNotMatch(text, /\b\d{1,2}\.\s?\d{1,2}\.(?!\d)/, 'datum dd.mm.');
  assert.doesNotMatch(text, /lovostaj (traje|je od)|lovna sezona (traje|počinje)/i);
  assert.match(DIVLJAC_NAPOMENA, /administrator/);
});

test('divljač: pretraga bez dijakritika i po sadržaju; kodovi vrsta postoje u zadanom spisku (osim čaglja)', () => {
  assert.deepEqual(filterSpecies('cagalj').map((v) => v.kod), ['cagalj']);
  assert.deepEqual(filterSpecies('ČAGALJ').map((v) => v.kod), ['cagalj']);
  assert.ok(filterSpecies('trihinel').some((v) => v.kod === 'divlja_svinja'));
  assert.equal(filterSpecies('').length, 7);
  assert.equal(filterSpecies('nepostojecaRijec').length, 0);
  const kodovi = new Set(DEFAULT_SPISKOVI.vrste.map((v) => v.kod));
  for (const v of VRSTE_DIVLJACI.filter((x) => x.kod !== 'cagalj')) assert.ok(kodovi.has(v.kod), v.kod);
});

import { calendarRows, activityRows } from '../../static/js/divljac.js';

test('divljač: svaka vrsta ima dodatne dijelove (spol/dob, zdravlje, poslije odstrela), a "Značajno za lov" ostaje zadnje', () => {
  for (const v of VRSTE_DIVLJACI) {
    const n = v.sekcije.map(([x]) => x);
    for (const x of ['Spol i dob (kako procijeniti)', 'Zdravlje i bolesti', 'Poslije odstrela']) assert.ok(n.includes(x), `${v.kod}: ${x}`);
    assert.equal(n[n.length - 1], 'Značajno za lov', v.kod);
  }
});

test('divljač: biološki kalendar (12 mjeseci) i dnevna aktivnost (0–3) za svaku vrstu', () => {
  for (const v of VRSTE_DIVLJACI) {
    const rows = calendarRows(v);
    assert.ok(rows.length >= 1, v.kod);
    for (const r of rows) { assert.equal(r.mjeseci.length, 12); assert.ok(r.mjeseci.some(Boolean), `${v.kod}/${r.kod}`); }
    const akt = activityRows(v);
    assert.deepEqual(akt.map((a) => a.kod), ['zora', 'dan', 'sumrak', 'noc']);
    for (const a of akt) assert.ok(a.nivo >= 0 && a.nivo <= 3);
  }
  const med = calendarRows(VRSTE_DIVLJACI.find((v) => v.kod === 'medvjed'));
  assert.ok(med.some((r) => r.kod === 'san' && r.mjeseci[0] && r.mjeseci[6] === false), 'zimski san u januaru, ne u julu');
  assert.ok(activityRows(VRSTE_DIVLJACI.find((v) => v.kod === 'fazan')).find((a) => a.kod === 'noc').nivo === 0);
});

import { GRUPE, DETALJ_TABOVI, sectionsOfTab, filterByGroup, bestTimes, monthEvents } from '../../static/js/divljac.js';

test('divljač: svaki dio sadržaja ide u TAČNO jedan tab detalja i ništa se ne gubi', () => {
  for (const v of VRSTE_DIVLJACI) {
    const used = DETALJ_TABOVI.flatMap(([k]) => sectionsOfTab(v, k).map(([n]) => n));
    assert.deepEqual([...used].sort(), v.sekcije.map(([n]) => n).sort(), v.kod);
    assert.equal(new Set(used).size, used.length, `${v.kod}: dupli dio`);
  }
});

test('divljač: grupe, najaktivnije doba i događaji u mjesecu (biološki kalendar)', () => {
  assert.deepEqual(GRUPE.map(([k]) => k), ['sve', 'krupna', 'sitna', 'zvijer']);
  assert.deepEqual(filterByGroup(VRSTE_DIVLJACI, 'zvijer').map((v) => v.kod), ['medvjed', 'vuk', 'cagalj']);
  assert.deepEqual(filterByGroup(VRSTE_DIVLJACI, 'sitna').map((v) => v.kod), ['fazan', 'zec']);
  assert.equal(filterByGroup(VRSTE_DIVLJACI, 'sve').length, 7);
  assert.equal(bestTimes(VRSTE_DIVLJACI.find((v) => v.kod === 'srna')), 'zora i sumrak');
  assert.equal(bestTimes(VRSTE_DIVLJACI.find((v) => v.kod === 'divlja_svinja')), 'sumrak i noć');
  const jul = monthEvents(7);
  assert.ok(jul.some((e) => e.vrsta === 'srna' && e.kod === 'parenje'));
  assert.ok(jul.some((e) => e.vrsta === 'medvjed' && e.kod === 'parenje'));
  assert.ok(!jul.some((e) => e.vrsta === 'medvjed' && e.kod === 'san'), 'zimski san nije u julu');
  assert.ok(monthEvents(1).some((e) => e.vrsta === 'medvjed' && e.kod === 'san'));
  for (const v of VRSTE_DIVLJACI) assert.match(v.boja, /^#[0-9a-f]{6}$/i) && assert.ok(v.znak.length >= 2);
});

test('divljač: tekst je na bosanskom (rogovi, lanad, insekti, puše — ne hrvatski/srpski oblici)', () => {
  const tekst = VRSTE_DIVLJACI.flatMap((v) => [...allSpeciesText(v), ...(v.kalendar || []).map(([, n]) => n)]).join(' \n ');
  const ZABRANJENO = [/rogovlj/i, /\blanet/i, /\bkukc/i, /\bnametni/i, /\bduva/i, /\bpotkošulj/i, /\btjed/i, /\btočk/i, /\bkamo\b/i, /\btko\b/i];
  for (const re of ZABRANJENO) assert.ok(!re.test(tekst), `nebosanski oblik ${re}: ${tekst.match(new RegExp(`.{0,40}${re.source}.{0,40}`, 'i'))?.[0]}`);
  assert.match(tekst, /Rogove nosi samo srndać/);
  assert.match(tekst, /Lanad se rađa/);
});

test('aplikacija: vjetar "puše", ne "duva"', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../../static/js/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    assert.ok(!/\bduva/i.test(readFileSync(new URL(f, dir), 'utf8')), f);
  }
});
