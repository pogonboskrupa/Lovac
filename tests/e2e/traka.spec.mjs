import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('dodir na nadmorsku visinu sakriva visinu i koordinate, ostaje ikona; izbor se pamti', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#koord-traka')).toBeVisible();
  await expect(page.locator('#koord-nv')).toBeVisible();
  await page.locator('#btn-nv').click();
  await expect(page.locator('#koord-traka')).toBeHidden();
  await expect(page.locator('#koord-nv')).toBeHidden();
  await expect(page.locator('#btn-nv')).toBeVisible();
  await expect(page.locator('#btn-nv')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#btn-podloga')).toBeVisible();
  await page.reload();
  await expect(page.locator('#koord-traka')).toBeHidden();
  await page.locator('#btn-nv').click();
  await expect(page.locator('#koord-traka')).toBeVisible();
  const b = await page.locator('#btn-nv').boundingBox();
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
});

test('u ploči podloga je poseban prekidač za prikaz koordinata (isti izbor kao dodir na visinu)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  const sw = page.locator('#btn-koord-prikazi');
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  await sw.click();
  await expect(page.locator('#koord-traka')).toBeHidden();
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
  await sw.click();
  await expect(page.locator('#koord-traka')).toBeVisible();
  await page.locator('#btn-nv').click();
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
});

test.describe('uski ekran', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('koordinate (WGS84 sa 6 decimala) stanu u okvir uz dugme visine', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#koord-gk')).toHaveText(/\d+\.\d{6}, \d+\.\d{6}/);
    const fits = await page.locator('#koord-traka').evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
  });
});

test('kontrole mape sjede tik iznad donje navigacije (razmak ≤ 6 px)', async ({ page }) => {
  await page.goto('/');
  const nav = await page.locator('.donja-nav').boundingBox();
  for (const sel of ['#btn-moja-lokacija', '.zoom-pill']) {
    const b = await page.locator(sel).boundingBox();
    const gap = nav.y - (b.y + b.height);
    expect(gap, sel).toBeGreaterThanOrEqual(0);
    expect(gap, sel).toBeLessThanOrEqual(6);
  }
});
