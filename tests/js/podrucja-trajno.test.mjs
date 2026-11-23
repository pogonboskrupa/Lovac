import test from 'node:test';
import assert from 'node:assert/strict';
import { exclusiveUrls } from '../../static/js/podrucja.js';

test('uklanjanje područja oslobađa samo pločice koje ne koristi drugo područje iste podloge', () => {
  const urlsOf = (a) => a.u;
  const a = { id: 'a', base: 'topo', u: ['t1', 't2', 't3'] };
  const b = { id: 'b', base: 'topo', u: ['t3', 't4'] };
  const c = { id: 'c', base: 'satelit', u: ['t1'] };
  assert.deepEqual(exclusiveUrls(a, [b, c], urlsOf), ['t1', 't2']);
  assert.deepEqual(exclusiveUrls(a, [], urlsOf), ['t1', 't2', 't3']);
});
