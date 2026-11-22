import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

const put = (page, store, rec) => page.evaluate(([s, r]) => new Promise((res, rej) => {
  const q = indexedDB.open('lovac');
  q.onsuccess = () => {
    const tx = q.result.transaction(s, 'readwrite');
    tx.objectStore(s).put(r);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  };
}), [store, rec]);

const base = (id, extra) => ({ id, vidljivost: 'privatno', rev: 1, sinhronizovano: true, vrijeme: Date.now(), lat: 44.88, lon: 16.15, ...extra });

test('Evidencija: pregled sa brojevima i kartice u Odstrelu, Opažanjima i Objektima', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btn-spiskovi')).toBeVisible();
  await put(page, 'odstrel', base('o1', { vrsta: 'zec', kategorija: 'nepoznato', tezina: 3.5, lovac: 'Ado' }));
  await put(page, 'odstrel', base('o2', { vrsta: 'zec', kategorija: 'nepoznato', tezina: 4, lovac: 'Ado' }));
  await put(page, 'opazanja', base('p1', { vrsta: 'srna', kategorija: 'nepoznato', broj: 3 }));
  await put(page, 'objekti', base('b1', { naziv: 'Čeka A', vrsta: 'ceka', stanje: 'ispravno', zadnji_obilazak: '2026-11-01' }));
  await put(page, 'objekti', base('b2', { naziv: 'Čeka B', vrsta: 'ceka', stanje: 'popravka', zadnji_obilazak: '2026-11-01' }));

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  await expect(page.locator('#ods-hero-komada')).toHaveText('2');
  await expect(page.locator('#ods-hero-kg')).toHaveText('7,5');
  await expect(page.locator('#ods-hero-vrsta')).toHaveText('1');
  await expect(page.locator('#odstrel-spisak .ev-kartica')).toHaveCount(2);
  await page.evaluate(() => window.__nazad());

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-opazanja').click();
  await expect(page.locator('#op-stat-opazanja')).toHaveText('1');
  await expect(page.locator('#op-stat-grla')).toHaveText('3');
  await expect(page.locator('#opazanja-spisak .ev-kartica .tr-chip').first()).toHaveText('3 grla');
  await page.evaluate(() => window.__nazad());

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-objekti').click();
  await expect(page.locator('#obj-stat-ukupno')).toHaveText('2');
  await expect(page.locator('#obj-stat-popravka')).toHaveText('1');
  await expect(page.locator('#obj-stat-sruseno')).toHaveText('0');
  await expect(page.locator('#objekti-spisak [data-id="b2"] .tr-chip')).toHaveText('Treba popravka');
});
