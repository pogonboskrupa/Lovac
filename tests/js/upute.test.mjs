import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPUTE, UPUTE_NAPOMENA, filterUpute, matchingItems } from '../../static/js/upute.js';

test('upute: jedinstveni id-evi, svaka sekcija ima naslov, uvod i stavke', () => {
  const ids = UPUTE.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of UPUTE) {
    assert.ok(s.naslov && s.uvod && s.stavke.length >= 2, s.id);
    for (const st of s.stavke) assert.equal(st.length, 2, `${s.id}: stavka je [naslov, tekst]`);
  }
});
test('upute ne zakucavaju propise: nema datuma lovostaja ni lovnog vremena', () => {
  const all = JSON.stringify(UPUTE);
  assert.doesNotMatch(all, /\b\d{1,2}\.\s?\d{1,2}\.(\s|\b)/, 'datum dd.mm.');
  assert.doesNotMatch(all, /\b\d{1,2}:\d{2}\b/, 'sat u danu');
});
test('upute: napomena kaže da ne zamjenjuje pravila lova', () => {
  assert.match(UPUTE_NAPOMENA, /ne zamjenjuje pravila lova/i);
});
test('pretraga bez dijakritika nalazi sekciju i sužava stavke', () => {
  const r = filterUpute(UPUTE, 'kompas');
  assert.ok(r.length >= 1);
  assert.ok(r.some((s) => s.id === 'lokacija'));
  assert.equal(filterUpute(UPUTE, '').length, UPUTE.length);
  assert.equal(filterUpute(UPUTE, 'zzzqqq').length, 0);
  const lok = UPUTE.find((s) => s.id === 'lokacija');
  assert.ok(matchingItems(lok, 'pravac gledanja').length < lok.stavke.length);
  assert.equal(matchingItems(lok, '').length, lok.stavke.length);
});
