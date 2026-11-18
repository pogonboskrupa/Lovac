// Lokalna pohrana. Kritični upisi (trag, odstrel, profil) nikad ne propadaju tiho:
// kvota localStorage-a je ~5 MB i puni se bez upozorenja.

let reporter = (msg) => console.error(msg);

export class StorageError extends Error {
  constructor(key, cause) {
    super(`Upis "${key}" nije uspio: ${isQuotaError(cause) ? 'memorija je puna' : cause?.message || cause}`);
    this.name = 'StorageError';
    this.key = key;
    this.cause = cause;
  }
}

export function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22 || err.code === 1014);
}

export function setStorageReporter(fn) {
  reporter = fn;
}

function store() {
  return globalThis.localStorage;
}

// Glasan upis: javlja korisniku i baca grešku da pozivalac ne nastavi kao da je sačuvano.
export function saveCritical(key, value) {
  try {
    store().setItem(key, JSON.stringify(value));
  } catch (err) {
    const e = new StorageError(key, err);
    try { reporter(e.message); } catch { /* reporter ne smije sakriti originalnu grešku */ }
    throw e;
  }
}

// Za nebitne podatke (UI postavke): neuspjeh se samo bilježi.
export function saveSoft(key, value) {
  try {
    store().setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn('saveSoft', key, err);
    return false;
  }
}

export function loadJSON(key, fallback = null) {
  try {
    const raw = store().getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn('loadJSON', key, err);
    return fallback;
  }
}

export function removeKey(key) {
  try { store().removeItem(key); } catch (err) { console.warn('removeKey', key, err); }
}
