import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchWithTimeout, TimeoutError, classifyQuality, recordSample, connectionQuality, connectionDetail, publicQuality, startConnectionProbe, onQualityChange, resetQualityForTests,
} from '../../static/js/net.js';

const realFetch = globalThis.fetch;
beforeEach(() => { resetQualityForTests(); globalThis.fetch = realFetch; });

// Mrtva veza: fetch nikad ne odgovori, samo reaguje na abort.
function hangingFetch() {
  return (_url, init) => new Promise((_res, rej) => {
    init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
}

test('poziv koji visi pada na rok kao TimeoutError', async () => {
  globalThis.fetch = hangingFetch();
  const t0 = Date.now();
  await assert.rejects(fetchWithTimeout('http://x', {}, 50), TimeoutError);
  assert.ok(Date.now() - t0 < 1000);
});

test('prekid pozivaoca prolazi i ne kvari ocjenu veze', async () => {
  globalThis.fetch = hangingFetch();
  const ctrl = new AbortController();
  const p = fetchWithTimeout('http://x', { signal: ctrl.signal }, 5000);
  ctrl.abort();
  await assert.rejects(p, { name: 'AbortError' });
  assert.equal(connectionQuality(), 'nepoznato');
});

test('kvalitet veze iz stvarnih zahtjeva', () => {
  assert.equal(classifyQuality([]), 'nepoznato');
  assert.equal(classifyQuality([{ ok: true, ms: 200 }, { ok: true, ms: 300 }]), 'dobra');
  assert.equal(classifyQuality([{ ok: true, ms: 5000 }]), 'slaba');
  assert.equal(classifyQuality([{ ok: true, ms: 100 }, { ok: false }, { ok: false }, { ok: false }]), 'nema');
  recordSample(false, 0); recordSample(false, 0); recordSample(false, 0);
  assert.equal(connectionQuality(), 'nema');
});

test('preslab signal: većina zahtjeva pada ili traje preko 8 s — za app je isto što i bez veze, ali se razlikuje u prikazu', () => {
  assert.equal(classifyQuality([{ ok: true, ms: 9000 }]), 'preslaba');
  assert.equal(classifyQuality([{ ok: true, ms: 300 }, { ok: false }, { ok: false }, { ok: true, ms: 400 }, { ok: false }, { ok: false }]), 'preslaba');
  assert.equal(classifyQuality([{ ok: true, ms: 300 }, { ok: false }, { ok: true, ms: 400 }, { ok: false }, { ok: true, ms: 400 }]), 'slaba');
  assert.equal(publicQuality('preslaba'), 'nema');
  assert.equal(publicQuality('slaba'), 'slaba');
});

test('preslaba veza: connectionQuality() kaže "nema" (app radi offline), connectionDetail() "preslaba", slušaoci dobiju oba', () => {
  const seen = [];
  onQualityChange((q, raw) => seen.push([q, raw]));
  recordSample(true, 9500);
  assert.equal(connectionQuality(), 'nema');
  assert.equal(connectionDetail(), 'preslaba');
  assert.deepEqual(seen.at(-1), ['nema', 'preslaba']);
});

test('provjera veze radi samo dok je veza prekinuta ili preslaba i vraća ocjenu kad zahtjevi opet prolaze', async () => {
  let calls = 0;
  let tick = null;
  const probe = async () => { calls++; recordSample(true, 200); };
  startConnectionProbe('http://x', { probe, setTimer: (fn) => { tick = fn; return 1; }, clearTimer: () => {} });
  await tick();
  assert.equal(calls, 0, 'nepoznato/dobra: bez zahtjeva');
  recordSample(true, 9500);
  assert.equal(connectionDetail(), 'preslaba');
  await tick();
  assert.equal(calls, 1);
  assert.notEqual(connectionDetail(), 'preslaba', 'uspješan zahtjev vraća ocjenu iz "preslaba"');
  await tick();
  assert.equal(calls, 1, 'kad veza nije više preslaba, provjera miruje');
});

test('prijava i registracija imaju duži rok (server se budi, bcrypt), ostali pozivi 12 s', async () => {
  const { timeoutFor, AUTH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } = await import('../../static/js/net.js');
  const base = 'https://x.supabase.co';
  assert.equal(timeoutFor(`${base}/auth/v1/token?grant_type=password`), AUTH_TIMEOUT_MS);
  assert.equal(timeoutFor(`${base}/auth/v1/signup`), AUTH_TIMEOUT_MS);
  assert.equal(timeoutFor(`${base}/rest/v1/korisnici?select=*`), DEFAULT_TIMEOUT_MS);
  assert.ok(AUTH_TIMEOUT_MS > DEFAULT_TIMEOUT_MS);
});
