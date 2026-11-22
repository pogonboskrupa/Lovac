import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo', viewport: { width: 360, height: 740 } });

const seed = (page, store, rows) => page.evaluate(([s, r]) => new Promise((resolve) => {
  const req = indexedDB.open('lovac');
  req.onsuccess = () => {
    const tx = req.result.transaction(s, 'readwrite');
    r.forEach((x) => tx.objectStore(s).put(x));
    tx.oncomplete = resolve;
  };
}), [store, rows]);

const base = { vidljivost: 'privatno', rev: 1, sinhronizovano: true, lat: 44.88, lon: 16.15 };

test('meni: grupe, pločice sa kratkom informacijom, dovoljno velike mete, bez vodoravnog klizanja', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+01:00'));
  await page.goto('/');
  await seed(page, 'odstrel', [{ ...base, id: 'a', vrsta: 'zec', vrijeme: Date.now() - 86400000, kategorija: 'nepoznato' }]);
  await seed(page, 'objekti', [
    { ...base, id: 'o1', naziv: 'Čeka 1', vrsta: 'cekalo', stanje: 'dobro', zadnji_obilazak: '2026-11-01' },
    { ...base, id: 'o2', naziv: 'Čeka 2', vrsta: 'cekalo', stanje: 'treba_popravka', zadnji_obilazak: '2026-11-01' },
  ]);
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  const menu = page.locator('#meni-spiskovi');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.m-grupa')).toHaveText(['Lov', 'Evidencija', 'Karta']);
  await expect(page.locator('#btn-odstrel-spisak-opis')).toContainText('1 ove godine');
  await expect(page.locator('#btn-objekti-opis')).toContainText('2 ukupno');
  await expect(page.locator('#btn-danas-opis')).toContainText(/^Svjetlo do \d\d:\d\d/);
  await expect(page.locator('#btn-lovovi-opis')).toHaveText('Raspored, stanovi, sektori');
  const tiles = menu.locator('.meni-plocica');
  await expect(tiles).toHaveCount(12);
  for (const box of await tiles.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, right: r.right, left: r.left }; }))) {
    expect(box.h).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.locator('#btn-karte').click();
  await expect(page.locator('#karte')).toBeVisible();
});
