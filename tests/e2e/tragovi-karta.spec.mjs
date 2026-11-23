import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 15 })));
});

const line = (lat, lon, n = 6) => Array.from({ length: n }, (_, i) => ({ lat: lat + i * 0.0004, lon: lon + i * 0.0004, t: i * 10000 }));
const TRAGOVI = [
  { id: 'daleko', naziv: 'Daleki obilazak', status: 'gotovo', vrsta: 'obilazak', start: Date.now() - 1000, tacke: line(44.95, 16.25), pauze: [] },
  { id: 'blizu', naziv: 'Bliski obilazak', status: 'gotovo', vrsta: 'obilazak', start: Date.now() - 86400000 * 30, tacke: line(44.879, 16.149), pauze: [] },
];

async function seed(page) {
  await page.evaluate((tr) => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('tragovi', 'readwrite');
      for (const t of tr) tx.objectStore('tragovi').put(t);
      tx.oncomplete = resolve;
    };
  }), TRAGOVI);
}

const allIds = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction('tragovi').objectStore('tragovi').getAllKeys(); q.onsuccess = () => resolve(q.result); };
}));

test('Granice lovišta: tragovi najbliži sredini karte prvi, prikaz na karti, klik na trag, stil linije i brisanje', async ({ page }) => {
  await page.goto('/');
  await seed(page);
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  const rows = page.locator('#sl-tragovi > li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-id', 'blizu');
  await expect(rows.first()).toContainText('u sredini karte');
  await expect(rows.nth(1)).toContainText('km od sredine karte');
  await page.locator('#sl-tragovi-red [data-red="novije"]').click();
  await expect(rows.first()).toHaveAttribute('data-id', 'daleko');
  await page.locator('#sl-tragovi-red [data-red="blizi"]').click();

  // na karti
  await rows.first().locator('[data-akcija="tr-prikazi"]').click();
  await expect(rows.first().locator('[data-akcija="tr-prikazi"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('path.tr-linija')).toHaveCount(1);

  // stil: plava, debela, isprekidana
  await rows.first().locator('[data-akcija="tr-stil"]').click();
  await rows.first().locator('[data-boja="#2f7dff"]').click();
  await rows.first().locator('[data-debljina="6"]').click();
  await rows.first().locator('[data-linija="isprekidana"]').click();
  const linija = page.locator('path.tr-linija');
  await expect(linija).toHaveAttribute('stroke', '#2f7dff');
  await expect(linija).toHaveAttribute('stroke-width', '6');
  await expect(linija).toHaveAttribute('stroke-dasharray', '12 8');

  // klik na trag na karti otvara karticu
  await rows.first().locator('[data-akcija="tr-idi"]').click();
  await expect(page.locator('#slojevi')).toBeHidden();
  const box = await page.locator('path.tr-linija').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const kartica = page.locator('.leaflet-popup .tr-popup');
  await expect(kartica).toContainText('Bliski obilazak');
  // brisanje drugim dodirom (iz kartice)
  await kartica.locator('[data-akcija="obrisi"]').click();
  expect(await allIds(page)).toContain('blizu');
  await kartica.locator('[data-akcija="obrisi"]').click();
  await expect.poll(() => allIds(page)).toEqual(['daleko']);
  await expect(page.locator('path.tr-linija')).toHaveCount(0);

  // izbor i stil ostaju poslije ponovnog pokretanja
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await page.locator('#sl-tragovi [data-akcija="tr-prikazi"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.tragovi.prikazani')))).toEqual(['daleko']);
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.951, lon: 16.251, z: 15 })));
  await page.reload();
  await expect(page.locator('path.tr-linija')).toHaveCount(1);
});
