import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 } });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Lovac', odobren: true, is_admin: false }));
  });
});

async function open(page) {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await page.locator('#btn-upute').click();
  await expect(page.locator('#upute')).toBeVisible();
}

test('Upute: otvaraju se iz Postavki, sekcije se rastvaraju, napomena o pravilima lova je tu', async ({ page }) => {
  await open(page);
  await expect(page.locator('#upute-napomena')).toContainText('Ne zamjenjuje pravila lova');
  const sekcije = page.locator('#upute-sadrzaj .upute-sekcija');
  expect(await sekcije.count()).toBeGreaterThanOrEqual(8);
  expect((await sekcije.first().locator('summary').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await sekcije.first().locator('summary').click();
  await expect(sekcije.first().locator('dt').first()).toBeVisible();
});

test('Upute: pretraga bez dijakritika, prazan rezultat, Nazad zatvara', async ({ page }) => {
  await open(page);
  await page.fill('#upute-pretraga', 'kompas');
  await expect(page.locator('#upute-sadrzaj .upute-sekcija[data-id="lokacija"]')).toBeVisible();
  await expect(page.locator('#upute-sadrzaj .upute-sekcija[data-id="lokacija"] dd').first()).toBeVisible();
  await page.fill('#upute-pretraga', 'zzzqqq');
  await expect(page.locator('#upute-prazno')).toBeVisible();
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#upute')).toBeHidden();
  await expect(page.locator('#postavke')).toBeVisible();
});

test('Upute rade bez interneta (sadržaj je u aplikaciji)', async ({ page }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await open(page);
  expect(await page.locator('#upute-sadrzaj .upute-sekcija').count()).toBeGreaterThan(5);
});
