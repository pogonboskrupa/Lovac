import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const RES = 'android/app/src/main/res';

test('ikona aplikacije: logo je PNG foreground, nema duplog resursa (XML + PNG) i pozadina postoji', () => {
  assert.ok(existsSync(`${RES}/drawable-nodpi/ic_launcher_fg.png`), 'foreground PNG');
  assert.ok(!existsSync(`${RES}/drawable/ic_launcher_fg.xml`), 'isto ime resursa u XML-u bi srušilo build');
  assert.match(readFileSync(`${RES}/values/launcher.xml`, 'utf8'), /name="launcher_pozadina"/);
  for (const f of ['mipmap-anydpi-v26', 'mipmap-anydpi']) {
    const xml = readFileSync(`${RES}/${f}/ic_launcher.xml`, 'utf8');
    assert.match(xml, /@drawable\/ic_launcher_fg/);
    assert.match(xml, /@color\/launcher_pozadina/);
  }
});

test('logo u webu: favicon i ekran prijave koriste istu sliku, a service worker je kešira', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<link rel="icon"[^>]+static\/img\/logo-192\.png/);
  assert.match(html, /class="logo-prijava"[^>]+static\/img\/logo-192\.png/);
  assert.ok(existsSync('static/img/logo-192.png') && existsSync('static/img/logo-512.png'));
  assert.match(readFileSync('sw.js', 'utf8'), /static\/img\/logo-192\.png/);
});

import { loadTileWithRetry, tileTimeoutMs, TILE_RETRY_DELAYS } from '../../static/js/tiles.js';

test('pločice: neuspjela se ponavlja (leaflet sam ne ponavlja pa karta ostane crna), rok raste sa pokušajem', async () => {
  const slept = [];
  let calls = 0;
  const load = async (_u, _s, attempt) => { calls++; if (attempt < 2) throw new Error('timeout'); return 'blob'; };
  const r = await loadTileWithRetry('u', undefined, { load, sleep: async (ms) => slept.push(ms) });
  assert.equal(r, 'blob');
  assert.equal(calls, 3);
  assert.deepEqual(slept, TILE_RETRY_DELAYS.slice(0, 2));
  // poslije zadnjeg pokušaja baca zadnju grešku
  await assert.rejects(loadTileWithRetry('u', undefined, { load: async () => { throw new Error('mrtva veza'); }, sleep: async () => {} }), /mrtva veza/);
  // prekinuta pločica (napustila ekran) staje odmah, bez ponavljanja
  const ctrl = new AbortController();
  let n = 0;
  await assert.rejects(loadTileWithRetry('u', ctrl.signal, { load: async () => { n++; ctrl.abort(); throw new Error('abort'); }, sleep: async () => {} }));
  assert.equal(n, 1);
  assert.ok(tileTimeoutMs('slaba', 0) > tileTimeoutMs('dobro', 0) && tileTimeoutMs('dobro', 2) > tileTimeoutMs('dobro', 0));
  assert.equal(tileTimeoutMs('nema', 0), 3000);
});
