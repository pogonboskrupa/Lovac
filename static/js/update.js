// Provjera nove verzije APK-a i ažuriranje jednim tapom (preko AndroidUpdate mosta).

import { RELEASES_API, APK_URL } from './config.js';
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

export async function checkForUpdate(localVersion) {
  const res = await fetchWithTimeout(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } }, 10000);
  if (!res.ok) return null;
  const rel = await res.json();
  return isNewer(rel.tag_name, localVersion) ? rel.tag_name : null;
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
