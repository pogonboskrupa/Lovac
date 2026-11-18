import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchWithTimeout, TimeoutError, classifyQuality, recordSample, connectionQuality, resetQualityForTests,
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
  assert.equal(classifyQuality([{ ok: true, ms: 9000 }]), 'slaba');
  assert.equal(classifyQuality([{ ok: true, ms: 100 }, { ok: false }, { ok: false }, { ok: false }]), 'nema');
  recordSample(false, 0); recordSample(false, 0); recordSample(false, 0);
  assert.equal(connectionQuality(), 'nema');
});
