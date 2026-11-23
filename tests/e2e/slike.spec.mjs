import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });

const all = (page, store) => page.evaluate((s) => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => resolve(q.result); };
}), store);

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

async function openForm(page) {
  await page.goto('/');
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-sliku').click();
  await expect(page.locator('#slika-forma')).toBeVisible();
}

test('slika čeke na poziciji: čuva se lokalno i prikazuje na karti kao sličica; dodir daje opis i veću sliku', async ({ page }) => {
  await openForm(page);
  await expect(page.locator('#slika-pozicija')).toContainText('GPS ±5 m');
  // bez fotografije se ne čuva
  await page.locator('#btn-slika-sacuvaj').click();
  await expect(page.locator('#slika-status')).toHaveText('Dodaj fotografiju');
  await page.locator('#slika-kategorija [data-kat="cekalo"]').click();
  await page.locator('#slika-ulaz').setInputFiles({ name: 'ceka.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#slika-pregled-mala img')).toBeVisible();
  await page.fill('#forma-slika [name=opis]', 'Čeka na Vrhu');
  await page.locator('#btn-slika-sacuvaj').click();
  await expect(page.locator('#slika-forma')).toBeHidden();

  const [s] = await all(page, 'slike');
  expect(s).toMatchObject({ kategorija: 'cekalo', opis: 'Čeka na Vrhu', lat: 44.88, lon: 16.15 });
  expect(s.mala).toMatch(/^data:image\/jpeg/);
  expect(await all(page, 'fotografije')).toHaveLength(1);

  const marker = page.locator('.slika-marker img');
  await expect(marker).toBeVisible();
  // dodir na sličicu odmah otvara veliku sliku; Nazad je zatvara
  await marker.click();
  await expect(page.locator('#slika-velika')).toBeVisible();
  await expect(page.locator('#slika-velika-opis')).toContainText('Čeka na Vrhu');
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#slika-velika')).toBeHidden();
  // "Detalji i brisanje" otvara karticu, a "Veća slika" iz nje opet pregled
  await marker.click();
  await page.locator('#slika-velika-akcije button', { hasText: 'Detalji' }).click();
  await expect(page.locator('.slika-popup')).toContainText('Čeka na Vrhu');
  await page.locator('.slika-popup [data-akcija="velika"]').click();
  await expect(page.locator('#slika-velika')).toBeVisible();
  await page.locator('#btn-slika-velika-zatvori').click();
  await expect(page.locator('#slika-velika')).toBeHidden();

  // sačuvano: ostaje i poslije ponovnog pokretanja
  await page.reload();
  await expect(page.locator('.slika-marker img')).toBeVisible();
});

test('slika ulova i objekta se razlikuju bojom; brisanje drugim dodirom briše i fotografiju', async ({ page }) => {
  await openForm(page);
  await page.locator('#slika-kategorija [data-kat="ulov"]').click();
  await page.locator('#slika-ulaz').setInputFiles({ name: 'ulov.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#slika-pregled-mala img')).toBeVisible();
  await page.locator('#btn-slika-sacuvaj').click();
  await expect(page.locator('.slika-marker')).toHaveCSS('--boja', '#dc2626');
  await page.locator('.slika-marker img').click();
  await page.locator('#slika-velika-akcije button', { hasText: 'Detalji' }).click();
  const del = page.locator('.slika-popup [data-akcija="obrisi"]');
  await del.click();
  expect(await all(page, 'slike')).toHaveLength(1); // prvi dodir samo traži potvrdu
  await del.click();
  await expect.poll(async () => (await all(page, 'slike')).length).toBe(0);
  expect(await all(page, 'fotografije')).toHaveLength(0);
  await expect(page.locator('.slika-marker')).toHaveCount(0);
});

test('odustajanje briše već snimljenu fotografiju (nema smeća u IndexedDB)', async ({ page }) => {
  await openForm(page);
  await page.locator('#slika-ulaz').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#slika-pregled-mala img')).toBeVisible();
  await page.locator('#btn-slika-odustani').click();
  await expect(page.locator('#slika-forma')).toBeHidden();
  expect(await all(page, 'fotografije')).toHaveLength(0);
  expect(await all(page, 'slike')).toHaveLength(0);
});
