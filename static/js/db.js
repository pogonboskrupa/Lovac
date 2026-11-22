// IndexedDB za velike podatke (tragovi, objekti, opažanja, red slanja).
// Sve tabele se prave odjednom, da nova funkcija ne traži podizanje verzije baze.

const DB_NAME = 'lovac';
const DB_VERSION = 8;
export const STORES = ['tragovi', 'objekti', 'opazanja', 'odstrel', 'red', 'spiskovi', 'fotografije', 'slojevi', 'lovovi', 'poruke', 'slike', 'kamere', 'arhiva', 'arhiva_red'];

let dbPromise = null;

export function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn('IndexedDB blokiran (otvoren u drugom prozoru)');
    });
  }
  return dbPromise;
}

async function withStore(store, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transakcija prekinuta'));
    const req = fn(tx.objectStore(store));
    if (req) req.onsuccess = () => { result = req.result; };
  });
}

export const idbPut = (store, value) => withStore(store, 'readwrite', (s) => s.put(value));
export const idbGet = (store, id) => withStore(store, 'readonly', (s) => s.get(id));
export const idbAll = (store) => withStore(store, 'readonly', (s) => s.getAll());
export const idbDelete = (store, id) => withStore(store, 'readwrite', (s) => s.delete(id));
