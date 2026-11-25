// Minirana područja (BHMAC): preuzimanje u aplikaciji i kartica u "Granice lovišta". Sloj crta slojevi-ui (isti store
// "slojevi"); ovdje je samo preuzimanje (automatski kad ima veze, jednom sedmično) i ručno "Ažuriraj".

import { MINIRANO_URL } from './config.js';
import { idbGet, idbPut } from './db.js';
import { fetchWithTimeout, connectionQuality } from './net.js';
import { parseKml } from './slojevi.js';
import { MINIRANO_ID, buildLayer, needsRefresh, minefieldStatusText, downloadErrorText, NAPOMENA } from './minirano.js';
import { toast } from './ui.js';

const STORE = 'slojevi';
const DOWNLOAD_TIMEOUT_MS = 60000; // fajl je ~300 KB, ali spora veza u lovištu je realnost
const CHECK_EVERY_MS = 6 * 3600 * 1000;
const $ = (id) => document.getElementById(id);

let busy = false;

// Vraća { ok, poruka }. force = ručno dugme (preuzima i kad nije prošla sedmica).
export async function downloadMinefields({ force = false } = {}) {
  if (busy) return { ok: false, poruka: 'Preuzimanje je već u toku' };
  const prev = await idbGet(STORE, MINIRANO_ID);
  if (!force && !needsRefresh(prev)) return { ok: true, poruka: 'Aktuelno' };
  if (connectionQuality() === 'nema') return { ok: false, poruka: downloadErrorText(0, 'nema veze') };
  busy = true;
  try {
    const res = await fetchWithTimeout(`${MINIRANO_URL}?t=${Date.now()}`, { cache: 'no-store' }, DOWNLOAD_TIMEOUT_MS);
    if (!res.ok) return { ok: false, poruka: downloadErrorText(res.status) };
    const layer = buildLayer(parseKml(await res.text()), Date.now(), prev);
    await idbPut(STORE, layer);
    document.dispatchEvent(new CustomEvent('slojevi:promjena'));
    return { ok: true, poruka: `Preuzeto ${layer.geojson.features.length} područja` };
  } catch (err) {
    return { ok: false, poruka: downloadErrorText(0, err.message) };
  } finally {
    busy = false;
  }
}

export function initMinirano() {
  const render = async () => {
    const layer = await idbGet(STORE, MINIRANO_ID);
    const st = $('minirano-stanje');
    if (st) st.textContent = minefieldStatusText(layer);
    const nap = $('minirano-napomena');
    if (nap) nap.textContent = NAPOMENA;
  };
  $('btn-minirano-preuzmi')?.addEventListener('click', async () => {
    const b = $('btn-minirano-preuzmi');
    b.disabled = true;
    b.textContent = 'Preuzimam…';
    const r = await downloadMinefields({ force: true });
    b.disabled = false;
    b.textContent = 'Ažuriraj';
    $('minirano-status').textContent = r.ok ? '' : r.poruka;
    if (r.ok) toast(r.poruka);
    await render();
  });
  document.addEventListener('slojevi:promjena', render);
  document.addEventListener('karte:otvori', render);
  render();

  // Automatski: pri pokretanju (kad se veza stabilizuje) i povremeno; bez veze ostaje zadnje preuzeto stanje.
  const auto = () => downloadMinefields().then((r) => { if (r.ok && r.poruka.startsWith('Preuzeto')) toast(`Minirana područja ažurirana (${r.poruka.replace('Preuzeto ', '')})`); }).catch(() => {});
  setTimeout(auto, 6000);
  setInterval(auto, CHECK_EVERY_MS);
}
