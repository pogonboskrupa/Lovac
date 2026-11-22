import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('Meni → Divljač: sedam vrsta, kartica se rastvara, pretraga, lovostaj nikad izmišljen', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-divljac').click();
  await expect(page.locator('#divljac')).toBeVisible();
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(7);
  await expect(page.locator('#divljac-napomena')).toContainText('Ne zamjenjuju propise');

  const svinja = page.locator('#divljac-spisak [data-id="divlja_svinja"]');
  await expect(svinja.locator('.div-brojke')).toBeHidden();
  await svinja.locator('summary').click();
  await expect(svinja.locator('.div-brojke')).toContainText('Težina');
  await expect(svinja).toContainText('Značajno za lov');
  await expect(svinja).toContainText('trihinelu');
  // administrator nije unio lovostaj: nema zadane vrijednosti
  await expect(svinja.locator('.div-sezona')).toContainText('Nije uneseno');

  await page.fill('#divljac-trazi', 'čagalj');
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(1);
  await page.fill('#divljac-trazi', 'nepostojeca rijec');
  await expect(page.locator('#divljac-prazno')).toBeVisible();
  await page.fill('#divljac-trazi', '');
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(7);

  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#divljac')).toBeHidden();
});

test('pločica Divljač u meniju ima dodirnu metu ≥ 44 px', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  const b = await page.locator('#btn-divljac').boundingBox();
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
});
