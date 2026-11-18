// Mreža: svaki poziv ima rok, a kvalitet veze se mjeri iz stvarnih zahtjeva.
// navigator.onLine laže `true` na mrtvoj vezi, pa se na njega ne oslanjamo.

export const DEFAULT_TIMEOUT_MS = 12000;
const SLOW_MS = 4000;
const WINDOW = 6;

const samples = [];
const listeners = new Set();
let lastQuality = 'nepoznato';

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
  if (failRate > 0.3 || avg > SLOW_MS) return 'slaba';
  return 'dobra';
}

export function recordSample(ok, ms) {
  samples.push({ ok, ms });
  if (samples.length > WINDOW) samples.shift();
  const q = classifyQuality(samples);
  if (q !== lastQuality) {
    lastQuality = q;
    listeners.forEach((fn) => { try { fn(q); } catch (e) { console.error(e); } });
  }
}

export function connectionQuality() {
  return lastQuality;
}

export function onQualityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetQualityForTests() {
  samples.length = 0;
  lastQuality = 'nepoznato';
  listeners.clear();
}
