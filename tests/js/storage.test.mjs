import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveCritical, saveSoft, loadJSON, setStorageReporter, StorageError } from '../../static/js/storage.js';

function fakeStorage({ full = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (full) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      m.set(k, v);
    },
    removeItem: (k) => m.delete(k),
  };
}

test('kritičan upis na punoj memoriji GLASNO javlja i baca', () => {
  globalThis.localStorage = fakeStorage({ full: true });
  const reported = [];
  setStorageReporter((m) => reported.push(m));
  assert.throws(() => saveCritical('trag', { a: 1 }), StorageError);
  assert.equal(reported.length, 1);
  assert.match(reported[0], /memorija je puna/);
});

test('upis i čitanje', () => {
  globalThis.localStorage = fakeStorage();
  saveCritical('k', { x: 1 });
  assert.deepEqual(loadJSON('k'), { x: 1 });
  assert.equal(loadJSON('nema', 7), 7);
  assert.equal(saveSoft('s', 1), true);
});
