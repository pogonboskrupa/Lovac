import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync('android/app/src/main/java/ba/grmec/lovac/UpdateBridge.java', 'utf8');
const main = readFileSync('android/app/src/main/java/ba/grmec/lovac/MainActivity.java', 'utf8');

test('nova verzija se preuzima u aplikaciji (napredak, greška, kraj) i samo sa provjerenog GitHub linka', () => {
  assert.match(bridge, /public void preuzmi\(String url\)/);
  assert.match(bridge, /isTrustedApkUrl\(url\)/);
  for (const fn of ['__updateNapredak', '__updateGreska', '__updatePreuzeto']) assert.ok(bridge.includes(fn), fn);
  assert.match(bridge, /\.dio"/); // prvo privremeni fajl, pa preimenovanje (prekinut download ne ostavlja pokvaren APK)
});

test('instalacija se nastavi kad se lovac vrati iz postavki dozvole', () => {
  assert.match(bridge, /void resumePendingInstall\(\)/);
  assert.match(main, /onResume\(\)[\s\S]*resumePendingInstall\(\)/);
});
