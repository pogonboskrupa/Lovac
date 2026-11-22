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
