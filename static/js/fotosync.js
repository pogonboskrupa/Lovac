// Fotografije objekata, opažanja i odstrela na serveru (štedljivo): sličica ostaje, velika slika (900 px) traje samo
// slike_rok() (14 dana, migracija 018), pa se briše. Šalju se SAMO fotografije sinhronizovanih vlastitih zapisa; vidljivost
// slike slijedi vidljivost zapisa (privatna slika vidi samo vlasnik). Originali ostaju na telefonu vlasnika.

import { getClient } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { listRecords } from './zapisi.js';
import { loadJSON, saveSoft } from './storage.js';
import { makeThumbnail, resizeToDataUrl, setRemotePhotoLoader } from './foto.js';

export const SYNC_PHOTO_STORES = ['objekti', 'opazanja', 'odstrel'];
const SENT_KEY = 'lovac.foto.poslane';
const CLEAN_KEY = 'lovac.foto.ciscenje';
const POLL_MS = 60000;
const PER_RUN = 3;

// Čista logika: koje fotografije još nisu poslane (samo vlastiti, sinhronizovani zapisi).
export function pendingPhotos(storeName, records, sent) {
  const out = [];
  for (const r of records) {
    if (r.tudji || r.obrisan || r.sinhronizovano !== true) continue;
    for (const fotoId of r.fotografije || []) if (!sent.has(fotoId)) out.push({ store: storeName, zapisId: r.id, fotoId });
  }
  return out;
}

export function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

async function uploadPending() {
  if (!online()) return 0;
  const sent = new Set(loadJSON(SENT_KEY, []));
  let done = 0;
  for (const store of SYNC_PHOTO_STORES) {
    for (const p of pendingPhotos(store, await listRecords(store).catch(() => []), sent)) {
      if (done >= PER_RUN) break;
      const photo = await idbGet('fotografije', p.fotoId);
      if (!photo?.blob) { sent.add(p.fotoId); continue; } // nema lokalno (npr. preuzeta sa servera) — nema šta slati
      try {
        const { error } = await getClient().from('slike_zapisa').upsert({
          id: p.fotoId, zapis_store: p.store, zapis_id: p.zapisId,
          mala: await makeThumbnail(photo.blob), slika: await resizeToDataUrl(photo.blob, 900, 0.7),
        }, { onConflict: 'id' });
        if (error) throw new Error(error.message);
        sent.add(p.fotoId);
        done += 1;
      } catch (err) {
        console.warn('fotografija čeka slanje', err.message);
        saveSoft(SENT_KEY, [...sent].slice(-3000));
        return done;
      }
    }
  }
  saveSoft(SENT_KEY, [...sent].slice(-3000));
  return done;
}

// Preuzimanje fotografije koje nema na telefonu; ako je velika već istekla, ostaje sličica.
async function loadRemotePhoto(id) {
  if (!online()) return null;
  const { data, error } = await getClient().from('slike_zapisa').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const rec = { id, blob: dataUrlToBlob(data.slika || data.mala), mime: 'image/jpeg', created_at: Date.now(), udaljena: true, samoMala: !data.slika };
  await idbPut('fotografije', rec);
  return rec;
}

// Jednom dnevno: server briše velike slike kojima je istekao rok.
async function dailyClean() {
  const last = loadJSON(CLEAN_KEY, 0);
  if (!online() || Date.now() - last < 86400000) return;
  const { error } = await getClient().rpc('ocisti_istekle_slike');
  if (!error) saveSoft(CLEAN_KEY, Date.now());
}

export function initFotoSync() {
  setRemotePhotoLoader(loadRemotePhoto);
  const run = () => { uploadPending().catch((e) => console.warn('foto', e.message)); dailyClean().catch(() => {}); };
  document.addEventListener('zapisi:promjena', run);
  setInterval(run, POLL_MS);
  setTimeout(run, 8000);
}
