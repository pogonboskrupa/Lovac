// Zajednički oblik zapisa (objekti, opažanja, odstrel): klijentski UUID (idempotentno slanje),
// vidljivost "privatno" kao zadano, rev koji raste pri svakoj izmjeni.

import { idbPut, idbGet, idbAll, idbDelete } from './db.js';
import { alarm } from './ui.js';
import { enqueue } from './sync.js';

export const VIDLJIVOST = { privatno: 'Samo ja', drustvo: 'Društvo', izabrani: 'Izabrani lovci' };

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function newRecord(fields, now = Date.now()) {
  return {
    id: uuid(), ...fields, vidljivost: 'privatno', dijeli_sa: [],
    created_at: now, updated_at: now, rev: 1, sinhronizovano: false,
  };
}

export function bumpRecord(rec, patch, now = Date.now()) {
  return { ...rec, ...patch, updated_at: now, rev: (rec.rev || 0) + 1, sinhronizovano: false };
}

// Kritičan upis: neuspjeh se javlja glasno.
export async function saveRecord(store, rec) {
  try {
    await idbPut(store, rec);
  } catch (err) {
    alarm(`Zapis nije sačuvan: ${err?.message || err}`);
    throw err;
  }
  // Tuđi (podijeljeni) zapisi se ne šalju nazad; svoje šalje red kad bude veze.
  if (!rec.tudji) await enqueue(store, rec.id).catch((err) => console.error('red slanja', err));
  return rec;
}

export async function updateRecord(store, id, patch) {
  const cur = await idbGet(store, id);
  if (!cur) throw new Error('Zapis ne postoji');
  return saveRecord(store, bumpRecord(cur, patch));
}

export const getRecord = (store, id) => idbGet(store, id);
export const listRecords = (store) => idbAll(store);
// Brisanje šalje "nadgrobni" zapis (obrisan: true), da nestane i na serveru i drugim uređajima.
export async function deleteRecord(store, id) {
  const cur = await idbGet(store, id);
  await idbDelete(store, id);
  if (cur && !cur.tudji) {
    await enqueue(store, id, { id, obrisan: true, rev: (cur.rev || 0) + 1, updated_at: Date.now() })
      .catch((err) => console.error('red slanja', err));
  }
}
