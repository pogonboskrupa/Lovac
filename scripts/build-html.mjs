// Sastavlja index.html iz html/index.tpl.html i html/ekrani/*.html (markeri <!--@ekran:id-->).
// Izvor istine su dijelovi u html/; index.html je generisan i commit-uje se (APK i Pages ga serviraju).
// Pokretanje: npm run build:html

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildIndexHtml(base = root) {
  const tpl = readFileSync(join(base, 'html/index.tpl.html'), 'utf8');
  return tpl.replace(/<!--@ekran:([a-z0-9-]+)-->/g, (_, id) => readFileSync(join(base, `html/ekrani/${id}.html`), 'utf8').replace(/\n$/, ''));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(root, 'index.html'), buildIndexHtml());
  console.log('index.html sastavljen');
}
