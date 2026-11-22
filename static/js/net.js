// Mreža: svaki poziv ima rok, a kvalitet veze se mjeri iz stvarnih zahtjeva.
// navigator.onLine laže `true` na mrtvoj vezi, pa se na njega ne oslanjamo.

export const DEFAULT_TIMEOUT_MS = 12000;
const SLOW_MS = 4000;
// Signal koji tehnički postoji, ali zahtjevi ne prolaze (većina pada ili traje preko 8 s): za aplikaciju je isto što i bez veze.
const UNUSABLE_MS = 8000;
const UNUSABLE_FAIL_RATE = 0.6;
const WINDOW = 6;

const samples = [];
const listeners = new Set();
let lastQuality = 'nepoznato';

let serverOffsetMs = 0;

// Sat servera iz zaglavlja `Date` odgovora (tačnost ~1 s): rokovi koje postavlja server ne smiju zavisiti od sata telefona.
export function noteServerDate(headerValue, localNow = Date.now()) {
  const t = Date.parse(headerValue || '');
  if (Number.isFinite(t)) serverOffsetMs = t - localNow;
}

export function serverNow(localNow = Date.now()) {
  return localNow + serverOffsetMs;
}

export class TimeoutError extends Error {
  constructor(ms) {
    super(`Server nije odgovorio za ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

// AbortSignal.timeout() ne postoji na starijim WebView-ima, pa ručno.
export async function fetchWithTimeout(input, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const outer = init.signal;
  const onOuterAbort = () => ctrl.abort(outer.reason);
  if (outer) {
    if (outer.aborted) ctrl.abort(outer.reason);
    else outer.addEventListener('abort', onOuterAbort, { once: true });
  }
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal });
    recordSample(true, Date.now() - started);
    noteServerDate(res.headers?.get?.('date'));
    return res;
  } catch (err) {
    // Prekid koji je tražio pozivalac nije znak loše veze.
    if (!timedOut && outer?.aborted) throw err;
    recordSample(false, Date.now() - started);
    throw timedOut ? new TimeoutError(timeoutMs) : err;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener?.('abort', onOuterAbort);
  }
}

export function classifyQuality(list) {
  if (list.length === 0) return 'nepoznato';
  const last = list.slice(-3);
  if (last.every((s) => !s.ok)) return 'nema';
  const oks = list.filter((s) => s.ok);
  const failRate = 1 - oks.length / list.length;
  const avg = oks.reduce((a, s) => a + s.ms, 0) / Math.max(1, oks.length);
  if (failRate >= UNUSABLE_FAIL_RATE || avg > UNUSABLE_MS) return 'preslaba';
  if (failRate > 0.3 || avg > SLOW_MS) return 'slaba';
  return 'dobra';
}

export function recordSample(ok, ms) {
  samples.push({ ok, ms });
  if (samples.length > WINDOW) samples.shift();
  const q = classifyQuality(samples);
  if (q !== lastQuality) {
    lastQuality = q;
    listeners.forEach((fn) => { try { fn(publicQuality(q), q); } catch (e) { console.error(e); } });
  }
}

// Za odluke ("smijem li zvati server?") preslaba veza je isto što i nema veze: app radi offline i ne čeka rokove.
export function publicQuality(q) {
  return q === 'preslaba' ? 'nema' : q;
}

export function connectionQuality() {
  return publicQuality(lastQuality);
}

// Za prikaz korisniku: razlikuje "nema signala" od "signal preslab".
export function connectionDetail() {
  return lastQuality;
}

// Dok je veza prekinuta ili preslaba, ništa drugo ne pravi zahtjeve pa se ocjena nikad ne bi popravila:
// jedan lagan zahtjev na server svakih nekoliko sekundi pokazuje kad se veza oporavi.
export async function probeConnection(url, timeoutMs = 8000) {
  try {
    await fetchWithTimeout(url, { method: 'GET', cache: 'no-store', mode: 'no-cors' }, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

export function startConnectionProbe(url, { intervalMs = 30000, probe = probeConnection, setTimer = setInterval, clearTimer = clearInterval } = {}) {
  const run = async () => {
    if (lastQuality !== 'nema' && lastQuality !== 'preslaba') return;
    await probe(url);
  };
  const id = setTimer(run, intervalMs);
  return () => clearTimer(id);
}

export function onQualityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetQualityForTests() {
  samples.length = 0;
  lastQuality = 'nepoznato';
  serverOffsetMs = 0;
  listeners.clear();
}
