// Red slanja i preuzimanje podijeljenih zapisa.
// Svaki upis je prvo lokalan; red pamti ŠTA treba poslati (store + id), a šalje se zadnja lokalna verzija.
// Klijentski UUID + rev čine slanje idempotentnim; neposlano se nikad ne briše.

import { idbGet, idbPut, idbAll, idbDelete } from './db.js';
import { getClient, cachedProfile, isAuthRejection } from './auth.js';
import { connectionQuality, onQualityChange } from './net.js';
import { loadJSON, saveSoft } from './storage.js';

export const SYNC_STORES = ['objekti', 'opazanja', 'odstrel', 'tragovi'];
const LOCAL_ONLY = new Set(['sinhronizovano', 'tudji', 'vlasnik_id', 'udaljenost', 'fotografije', 'izmijenjen']);
const BASE_DELAY = 5000;
const MAX_DELAY = 30 * 60000;
const PULL_KEY = 'lovac.sync.zadnje.';
const listeners = new Set();
let flushing = null;

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

export function nextDelay(attempts) {
  return Math.min(MAX_DELAY, BASE_DELAY * 2 ** Math.max(0, attempts));
}

export function toServerRow(store, rec, myId) {
  if (rec.obrisan) {
    return { id: rec.id, vlasnik_id: myId, obrisan: true, rev: rec.rev, updated_at: iso(rec.updated_at), podaci: {} };
  }
  const { id, vidljivost = 'privatno', dijeli_sa = [], lat, lon, rev = 1, created_at, updated_at, ...rest } = rec;
  const podaci = Object.fromEntries(Object.entries(rest).filter(([k]) => !LOCAL_ONLY.has(k)));
  let la = lat;
  let lo = lon;
  if (store === 'tragovi' && la == null && rec.tacke?.length) ({ lat: la, lon: lo } = rec.tacke[0]);
  if (store === 'tragovi' && created_at == null) return toServerRow(store, { ...rec, created_at: rec.start, updated_at: rec.izmijenjen ?? rec.kraj ?? rec.start }, myId);
  return {
    id, vlasnik_id: myId, vidljivost, dijeli_sa, lat: la ?? null, lon: lo ?? null, podaci, rev,
    obrisan: false, created_at: iso(created_at), updated_at: iso(updated_at),
  };
}

export function fromServerRow(row, myId) {
  return {
    ...row.podaci,
    id: row.id,
    vidljivost: row.vidljivost,
    dijeli_sa: row.dijeli_sa || [],
    lat: row.lat,
    lon: row.lon,
    rev: row.rev,
    created_at: Date.parse(row.created_at),
    updated_at: Date.parse(row.updated_at),
    vlasnik_id: row.vlasnik_id,
    tudji: row.vlasnik_id !== myId,
    sinhronizovano: true,
  };
}

// Lokalna neposlana izmjena istog ili višeg rev-a ima prednost nad onim što stiže sa servera.
export function shouldReplaceLocal(local, incoming) {
  if (!local) return true;
  if (local.sinhronizovano === false && (local.rev ?? 0) >= incoming.rev) return false;
  return incoming.rev >= (local.rev ?? 0);
}

function emitQueueChange() {
  queueCount().then((n) => listeners.forEach((fn) => { try { fn(n); } catch (e) { console.error(e); } }));
}

export function onQueueChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function queueCount() {
  try {
    return (await idbAll('red')).length;
  } catch {
    return 0;
  }
}

export async function queueEntries() {
  return idbAll('red');
}

// Dedup: isti zapis je u redu najviše jednom (ključ store:id); šalje se uvijek zadnja verzija.
export async function enqueue(store, recId, tombstone = null) {
  if (!SYNC_STORES.includes(store)) return;
  const id = `${store}:${recId}`;
  const prev = await idbGet('red', id);
  const seq = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await idbPut('red', { id, store, recId, tombstone, seq, pokusaja: 0, sljedeci: 0, greska: prev?.greska ?? null, dodano: prev?.dodano ?? Date.now() });
  emitQueueChange();
}

async function markSynced(store, rec) {
  const cur = await idbGet(store, rec.id);
  if (cur && cur.rev === rec.rev && cur.sinhronizovano !== true) await idbPut(store, { ...cur, sinhronizovano: true });
}

async function sessionReady(sb) {
  try {
    const { data } = await sb.auth.getSession();
    return Boolean(data?.session);
  } catch {
    return false;
  }
}

export async function flushQueue({ force = false } = {}) {
  if (flushing) {
    // Tekuće slanje ne zna za zapise dodane u međuvremenu: ručno slanje čeka pa kreće ponovo.
    if (!force) return flushing;
    await flushing.catch(() => {});
    if (flushing) return flushing;
  }
  flushing = (async () => {
    const sb = getClient();
    const me = cachedProfile();
    const result = { poslano: 0, greske: 0, preostalo: 0 };
    if (!sb || !me?.odobren || !(await sessionReady(sb))) {
      result.preostalo = await queueCount();
      return result;
    }
    const now = Date.now();
    const entries = (await idbAll('red')).sort((a, b) => a.dodano - b.dodano);
    for (const e of entries) {
      if (!force && e.sljedeci > now) continue;
      const rec = e.tombstone || await idbGet(e.store, e.recId);
      if (!rec) {
        // Zapis je obrisan lokalno; ako je u međuvremenu u red ušao nadgrobni zapis, on ostaje.
        const still = await idbGet('red', e.id);
        if (still?.seq === e.seq) await idbDelete('red', e.id);
        continue;
      }
      try {
        const { error } = await sb.from(e.store).upsert(toServerRow(e.store, rec, me.id), { onConflict: 'id' });
        if (error) throw error;
        // Zapis je mogao biti ponovo stavljen u red tokom slanja: briše se samo isti unos (seq).
        const still = await idbGet('red', e.id);
        if (still && still.seq === e.seq) await idbDelete('red', e.id);
        if (!e.tombstone) await markSynced(e.store, rec);
        result.poslano++;
      } catch (err) {
        result.greske++;
        const pokusaja = (e.pokusaja || 0) + 1;
        const jitter = Math.floor(Math.random() * 1000);
        await idbPut('red', { ...e, pokusaja, sljedeci: Date.now() + nextDelay(pokusaja) + jitter, greska: err?.message || String(err) });
        if (isAuthRejection(err)) break;
      }
    }
    result.preostalo = await queueCount();
    return result;
  })();
  try {
    return await flushing;
  } finally {
    flushing = null;
    emitQueueChange();
  }
}

// Preuzimanje: novi/izmijenjeni zapisi koje server dozvoli (svoji sa drugih uređaja + podijeljeni).
export async function pullShared() {
  const sb = getClient();
  const me = cachedProfile();
  if (!sb || !me?.odobren || !(await sessionReady(sb))) return 0;
  let changed = 0;
  for (const store of SYNC_STORES) {
    const since = loadJSON(PULL_KEY + store, '1970-01-01T00:00:00Z');
    const { data, error } = await sb.from(store).select('*').gt('server_at', since).order('server_at', { ascending: true }).limit(500);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const local = await idbGet(store, row.id);
      if (row.obrisan) {
        if (local && (local.tudji || local.sinhronizovano !== false)) { await idbDelete(store, row.id); changed++; }
        continue;
      }
      const incoming = fromServerRow(row, me.id);
      if (shouldReplaceLocal(local, incoming)) {
        await idbPut(store, { ...incoming, fotografije: local?.fotografije || [] });
        changed++;
      }
    }
    if (data?.length) saveSoft(PULL_KEY + store, data[data.length - 1].server_at);
    // Zapis koji je vlasnik vratio na privatno server više ne daje: lokalna kopija se uklanja.
    const ids = await sb.from(store).select('id').neq('vlasnik_id', me.id);
    if (!ids.error) {
      const visible = new Set((ids.data || []).map((r) => r.id));
      for (const rec of await idbAll(store)) {
        if (rec.tudji && !visible.has(rec.id)) { await idbDelete(store, rec.id); changed++; }
      }
    }
  }
  if (changed) globalThis.document?.dispatchEvent(new CustomEvent('zapisi:promjena', { detail: { izvor: 'server' } }));
  return changed;
}

export async function syncNow({ force = false } = {}) {
  const res = await flushQueue({ force });
  try {
    res.preuzeto = await pullShared();
  } catch (err) {
    res.preuzeto = 0;
    res.greskaPreuzimanja = err.message;
  }
  return res;
}

export function initSync() {
  const tick = () => {
    if (connectionQuality() === 'nema') return;
    syncNow().catch((err) => console.warn('sinhronizacija', err));
  };
  onQualityChange((q) => { if (q !== 'nema') tick(); });
  setInterval(tick, 60000);
  setTimeout(tick, 3000);
  emitQueueChange();
}
