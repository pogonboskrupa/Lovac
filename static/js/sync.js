// Red slanja i preuzimanje podijeljenih zapisa.
// Svaki upis je prvo lokalan; red pamti ŠTA treba poslati (store + id), a šalje se zadnja lokalna verzija.
// Klijentski UUID + rev čine slanje idempotentnim; neposlano se nikad ne briše.

import { idbGet, idbPut, idbAll, idbDelete } from './db.js';
import { getClient, cachedProfile, isAuthRejection } from './auth.js';
import { connectionQuality, onQualityChange, startConnectionProbe } from './net.js';
import { SUPABASE_URL, isServerConfigured } from './config.js';
import { loadJSON, saveSoft } from './storage.js';

export const SYNC_STORES = ['objekti', 'opazanja', 'odstrel', 'tragovi'];
const LOCAL_ONLY = new Set(['sinhronizovano', 'tudji', 'vlasnik_id', 'udaljenost', 'fotografije', 'izmijenjen', 'vlasnik_lokalni', 'odbijeno']);
const BASE_DELAY = 5000;
const MAX_DELAY = 10 * 60000;
const NETWORK_RETRY_MS = 15000;
export const SEND_DEADLINE_MS = 20000;
export const PULL_DEADLINE_MS = 60000;
const PULL_KEY = 'lovac.sync.zadnje.';
const listeners = new Set();
let flushing = null;

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

export function nextDelay(attempts) {
  return Math.min(MAX_DELAY, BASE_DELAY * 2 ** Math.max(0, attempts));
}

// Mrtva veza ne pada nego VISI: bez roka bi jedno viseće slanje držalo cijeli red zauvijek.
export function withDeadline(run, ms) {
  const ctrl = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      const e = new Error('Veza ne odgovara (isteklo vrijeme)');
      e.name = 'TimeoutError';
      reject(e);
    }, ms);
  });
  return Promise.race([Promise.resolve().then(() => run(ctrl.signal)), deadline]).finally(() => clearTimeout(timer));
}

// Greška veze (ne odbijanje servera): zapis nije kriv, pa se ne kažnjava sve dužim čekanjem.
export function isNetworkFailure(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  if (err.status || err.statusCode || err.code) return false;
  return /fetch|network|timeout|abort|failed to|load failed|offline|nije odgovorio/i.test(String(err.message || err));
}

// Server je odbio zapis zbog prava (RLS), ne zbog veze: ponavljanje ne pomaže, pa se ne vrti u krug.
export function isPolicyRejection(err) {
  if (!err) return false;
  return err.code === '42501' || /row-level security|violates .*policy/i.test(String(err.message || ''));
}

// Zapis koji je napravio drugi nalog na ovom telefonu ne smije se poslati kao zapis trenutnog korisnika.
export function belongsToOther(owner, myId) {
  return Boolean(owner && myId && owner !== myId);
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

// Čeka slanje = samo ono što se još može poslati: odbijeno od servera i tuđe (drugi nalog) se ne broji.
export async function queueCount() {
  try {
    const myId = cachedProfile()?.id;
    return (await idbAll('red')).filter((e) => !e.odbijen && !belongsToOther(e.vlasnik, myId)).length;
  } catch {
    return 0;
  }
}

export async function rejectedEntries() {
  try {
    return (await idbAll('red')).filter((e) => e.odbijen);
  } catch {
    return [];
  }
}

// Odbijeni zapisi ostaju na telefonu (ništa se ne briše), samo se skidaju iz reda.
export async function dropRejected() {
  const list = await rejectedEntries();
  for (const e of list) {
    await idbDelete('red', e.id);
    const rec = await idbGet(e.store, e.recId);
    if (rec) await idbPut(e.store, { ...rec, odbijeno: true });
  }
  emitQueueChange();
  return list.length;
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
  const myId = cachedProfile()?.id || null;
  let owner = prev?.vlasnik ?? myId;
  if (!tombstone) {
    const rec = await idbGet(store, recId);
    if (rec && !rec.tudji) {
      if (!rec.vlasnik_lokalni && myId) await idbPut(store, { ...rec, vlasnik_lokalni: myId });
      owner = rec.vlasnik_lokalni || owner;
    }
  }
  await idbPut('red', { id, store, recId, tombstone, seq, pokusaja: 0, sljedeci: 0, greska: prev?.greska ?? null, dodano: prev?.dodano ?? Date.now(), vlasnik: owner });
  emitQueueChange();
}

// Mreža sigurnosti: vlastiti neposlani zapis kojeg (iz bilo kog razloga) nema u redu ulazi u red.
export function needsSending(store, rec) {
  if (rec.tudji || rec.odbijeno || rec.sinhronizovano !== false) return false;
  if (store === 'tragovi') return rec.status === 'gotovo' || rec.vrsta === 'potraga';
  return true;
}

export async function reconcileQueue() {
  const queued = new Set((await idbAll('red')).map((e) => e.id));
  let added = 0;
  for (const store of SYNC_STORES) {
    for (const rec of await idbAll(store)) {
      if (needsSending(store, rec) && !belongsToOther(rec.vlasnik_lokalni, cachedProfile()?.id) && !queued.has(`${store}:${rec.id}`)) {
        await enqueue(store, rec.id);
        added++;
      }
    }
  }
  return added;
}

async function markSynced(store, rec) {
  const cur = await idbGet(store, rec.id);
  if (cur && cur.rev === rec.rev && cur.sinhronizovano !== true) await idbPut(store, { ...cur, sinhronizovano: true });
}

async function sessionReady(sb) {
  try {
    const { data } = await withDeadline(() => sb.auth.getSession(), 10000);
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
    try {
      await reconcileQueue();
    } catch (err) {
      console.error('usklađivanje reda', err);
    }
    const now = Date.now();
    const entries = (await idbAll('red')).sort((a, b) => a.dodano - b.dodano);
    for (const e of entries) {
      if (e.odbijen || belongsToOther(e.vlasnik, me.id)) continue;
      if (!force && e.sljedeci > now) continue;
      const rec = e.tombstone || await idbGet(e.store, e.recId);
      if (!rec) {
        // Zapis je obrisan lokalno; ako je u međuvremenu u red ušao nadgrobni zapis, on ostaje.
        const still = await idbGet('red', e.id);
        if (still?.seq === e.seq) await idbDelete('red', e.id);
        continue;
      }
      try {
        const row = toServerRow(e.store, rec, me.id);
        const { error } = await withDeadline((signal) => sb.from(e.store).upsert(row, { onConflict: 'id' }).abortSignal(signal), SEND_DEADLINE_MS);
        if (error) throw error;
        // Zapis je mogao biti ponovo stavljen u red tokom slanja: briše se samo isti unos (seq).
        const still = await idbGet('red', e.id);
        if (still && still.seq === e.seq) await idbDelete('red', e.id);
        if (!e.tombstone) await markSynced(e.store, rec);
        result.poslano++;
      } catch (err) {
        result.greske++;
        if (isPolicyRejection(err) && !isAuthRejection(err)) {
          // Zapis pripada drugom nalogu ili ga server ne dozvoljava: ne vrti se u krug, ali se ne briše.
          await idbPut('red', { ...e, odbijen: true, greska: err?.message || String(err) });
          continue;
        }
        if (isNetworkFailure(err)) {
          // Veza je kriva, ne zapis: kratko čekanje bez povećanja broja pokušaja; ostali bi također visili.
          await idbPut('red', { ...e, sljedeci: Date.now() + NETWORK_RETRY_MS, greska: err?.message || String(err) });
          break;
        }
        const pokusaja = (e.pokusaja || 0) + 1;
        const jitter = Math.floor(Math.random() * 1000);
        await idbPut('red', { ...e, pokusaja, sljedeci: Date.now() + nextDelay(pokusaja) + jitter, greska: err?.message || String(err) });
        if (isAuthRejection(err)) break;
      }
    }
    if (result.poslano > 0) saveSoft('lovac.sync.zadnje', Date.now());
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
const VISIBLE_KEY = 'lovac.sync.vidljivo.';
const VISIBLE_CHECK_MS = 10 * 60000;
const visibleCheckDue = (store) => Date.now() - Number(loadJSON(VISIBLE_KEY + store, 0)) >= VISIBLE_CHECK_MS;

export async function pullShared({ force = false } = {}) {
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
    // Spisak svih vidljivih id-eva je skup na besplatnom serveru, pa ide najviše jednom u VISIBLE_CHECK_MS.
    if (!force && !visibleCheckDue(store)) continue;
    const ids = await sb.from(store).select('id').neq('vlasnik_id', me.id);
    if (!ids.error) {
      saveSoft(VISIBLE_KEY + store, Date.now());
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
    res.preuzeto = await withDeadline(() => pullShared({ force }), PULL_DEADLINE_MS);
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
  // Kad se veza vrati, čekanje iz prethodnih neuspjeha se ne poštuje: lovac ne treba čekati do pola sata.
  onQualityChange((q) => { if (q !== 'nema') syncNow({ force: true }).catch((err) => console.warn('sinhronizacija', err)); });
  setInterval(tick, 60000);
  if (isServerConfigured()) startConnectionProbe(`${SUPABASE_URL}/auth/v1/health`);
  setTimeout(tick, 3000);
  emitQueueChange();
}
