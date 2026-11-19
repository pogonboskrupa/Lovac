// Provjera nove verzije APK-a i ažuriranje jednim tapom (preko AndroidUpdate mosta).

import { RELEASES_API, APK_URL, VERSION_URL } from './config.js';
import { fetchWithTimeout } from './net.js';

export function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  return m ? m.slice(1).map(Number) : null;
}

export function isNewer(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  if (!r || !l) return false;
  for (let i = 0; i < 3; i++) {
    if (r[i] !== l[i]) return r[i] > l[i];
  }
  return false;
}

async function versionFromFile() {
  const res = await fetchWithTimeout(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' }, 10000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).verzija;
}

async function versionFromApi() {
  const res = await fetchWithTimeout(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } }, 10000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).tag_name;
}

// Greška se baca (ne vraća se null): "provjera nije uspjela" nije isto što i "nema nove verzije".
export async function fetchLatestVersion() {
  const errors = [];
  for (const [name, source] of [['verzija', versionFromFile], ['api', versionFromApi]]) {
    try {
      const v = await source();
      if (parseVersion(v)) return v;
      errors.push(`${name}: neispravna verzija`);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

export async function checkForUpdate(localVersion) {
  const latest = await fetchLatestVersion();
  return isNewer(latest, localVersion) ? latest : null;
}

// U APK-u su fajlovi lokalni, a SW bi nakon instalacije nove verzije servirao stari keš.
export function shouldUseServiceWorker(loc, hasAndroidBridge) {
  return !hasAndroidBridge && loc?.hostname !== 'appassets.androidplatform.net';
}

export function installUpdate() {
  const bridge = globalThis.AndroidUpdate;
  if (bridge?.downloadAndInstall) {
    bridge.downloadAndInstall(APK_URL);
    return 'apk';
  }
  globalThis.location.reload();
  return 'reload';
}
