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

test('instalacija ide kroz PackageInstaller sesiju (rezerva ACTION_VIEW), uz ručno "Instaliraj preuzeto"', () => {
  assert.match(bridge, /PackageInstaller\.SessionParams\.MODE_FULL_INSTALL/);
  assert.match(bridge, /STATUS_PENDING_USER_ACTION/);
  assert.match(bridge, /installViaIntent\(apk\)/);
  assert.match(bridge, /public void instalirajPreuzeto\(\)/);
  assert.match(bridge, /__updateStatus/);
  // prekinut download (manje bajtova od Content-Length) se ne instalira
  assert.match(bridge, /tmp\.length\(\) < total/);
});

test('link na zadnju verziju u WebView-u se preuzima u aplikaciji, a ostala preuzimanja idu u Preuzimanja', () => {
  assert.match(main, /UpdateBridge\.isTrustedApkUrl\(uri\.toString\(\)\)[\s\S]*updateBridge\.preuzmi/);
  assert.match(main, /setDownloadListener/);
  assert.match(main, /setDestinationInExternalPublicDir\(Environment\.DIRECTORY_DOWNLOADS/);
});

test('preuzeti APK se sačuva i u javne Preuzimanja/Lovac (MediaStore), prije pokretanja instalacije', () => {
  assert.match(bridge, /MediaStore\.Downloads\.EXTERNAL_CONTENT_URI/);
  assert.match(bridge, /DIRECTORY_DOWNLOADS \+ "\/Lovac"/);
  assert.match(bridge, /APK je sačuvan u /);
  assert.match(bridge, /saveToDownloads\(apk\)[\s\S]*installOrAsk\(apk\)/);
});
