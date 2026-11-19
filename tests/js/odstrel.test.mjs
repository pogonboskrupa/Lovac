import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv, formatDecimalBs, parseDecimalBs, reportHtml, summarizeHarvest, harvestWarnings } from '../../static/js/odstrel.js';

test('decimalni zarez u oba smjera', () => {
  assert.equal(formatDecimalBs(18.5), '18,5');
  assert.equal(formatDecimalBs(null), '');
  assert.equal(parseDecimalBs('18,5'), 18.5);
  assert.equal(parseDecimalBs(' 102.25 '), 102.25);
  assert.equal(parseDecimalBs(''), null);
  assert.equal(parseDecimalBs('abc'), null);
});

test('CSV za Excel: BOM, tačka-zarez, decimalni zarez, navodnici i novi redovi', () => {
  const csv = toCsv([
    { a: 'Srna obična', b: 18.5, c: 'napomena; sa "navodnicima"\ni novim redom' },
    { a: 'Zec', b: null, c: '' },
  ], [
    { key: 'a', label: 'Vrsta' },
    { key: 'b', label: 'Težina (kg)', type: 'decimal' },
    { key: 'c', label: 'Napomena' },
  ]);
  assert.ok(csv.startsWith('﻿'), 'BOM da Excel pročita UTF-8 (č, ć, š, ž, đ)');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'Vrsta;Težina (kg);Napomena');
  assert.equal(lines[1], 'Srna obična;18,5;"napomena; sa ""navodnicima""\ni novim redom"');
  assert.equal(lines[2], 'Zec;;');
});

test('CSV ne dozvoljava formule (=, +, -, @ na početku ćelije)', () => {
  const csv = toCsv([{ a: '=HYPERLINK("x")' }], [{ key: 'a', label: 'A' }]);
  assert.match(csv, /'=HYPERLINK/);
});

test('izvještaj za PDF: escapovan HTML i napomena da ne zamjenjuje službeni dnevnik', () => {
  const html = reportHtml({ naslov: 'Odstrel <2026>', redovi: [{ a: '<script>x</script>' }], kolone: [{ key: 'a', label: 'A' }], napomena: 'Ne zamjenjuje službeni lovački dnevnik.' });
  assert.ok(!html.includes('<script>x'), 'nema ubacivanja HTML-a');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Odstrel &lt;2026&gt;/);
  assert.match(html, /Ne zamjenjuje službeni lovački dnevnik/);
  assert.match(html, /<meta charset="utf-8">/);
});

test('zbir odstrela po vrsti', () => {
  const s = summarizeHarvest([{ vrsta: 'srna', tezina: 18 }, { vrsta: 'srna', tezina: 20.5 }, { vrsta: 'zec', tezina: null }]);
  assert.deepEqual(s, [{ vrsta: 'srna', komada: 2, tezina: 38.5 }, { vrsta: 'zec', komada: 1, tezina: 0 }]);
});

test('upozorenja: lovostaj i van lovnog vremena', () => {
  const lovostaj = [{ vrsta_kod: 'srna', kategorija_kod: 'srndac', otvoreno_od: '05-01', otvoreno_do: '09-30', aktivno: true }];
  const w = { od: Date.parse('2026-11-19T05:00:00Z'), do: Date.parse('2026-11-19T16:30:00Z') };
  const t = Date.parse('2026-11-19T20:00:00Z');
  const res = harvestWarnings({ vrsta: 'srna', kategorija: 'srndac', vrijeme: t }, lovostaj, w);
  assert.equal(res.length, 2);
  assert.match(res[0], /lovostaju/);
  assert.match(res[1], /van lovnog vremena/);
  assert.deepEqual(harvestWarnings({ vrsta: 'srna', kategorija: 'srndac', vrijeme: Date.parse('2026-06-01T10:00:00Z') }, lovostaj, null), []);
});
