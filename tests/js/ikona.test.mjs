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
