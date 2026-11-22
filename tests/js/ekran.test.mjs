import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const main = readFileSync('android/app/src/main/java/ba/grmec/lovac/MainActivity.java', 'utf8');

test('aplikacija je zaključana u uspravan položaj (karta se ne okreće sa telefonom)', () => {
  assert.match(manifest, /android:screenOrientation="portrait"/);
});

test('sistemske trake (nazad/početna/zadnje) se sakrivaju pri pokretanju i povratku fokusa', () => {
  assert.match(main, /hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/);
  assert.match(main, /onWindowFocusChanged[\s\S]*hideSystemBars\(\)/);
  assert.match(main, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
});
