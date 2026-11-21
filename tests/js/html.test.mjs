import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildIndexHtml } from '../../scripts/build-html.mjs';

test('index.html je sastavljen iz html/ (pokreni: npm run build:html)', () => {
  assert.equal(readFileSync('index.html', 'utf8'), buildIndexHtml(), 'index.html se razlikuje od html/ — izmjene idu u html/, pa npm run build:html');
});

test('svaki dio ekrana ima marker u šablonu i obrnuto', () => {
  const tpl = readFileSync('html/index.tpl.html', 'utf8');
  const markers = [...tpl.matchAll(/<!--@ekran:([a-z0-9-]+)-->/g)].map((m) => m[1]).sort();
  const files = readdirSync('html/ekrani').map((f) => f.replace(/\.html$/, '')).sort();
  assert.deepEqual(markers, files);
  assert.equal(new Set(markers).size, markers.length, 'marker se ponavlja');
});
