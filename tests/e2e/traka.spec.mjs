import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('gornja traka (visina i koordinate) se sakriva i prikazuje, izbor se pamti', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#koord-traka')).toBeVisible();
  await page.locator('#btn-koord-sakrij').click();
  await expect(page.locator('#koord-traka')).toBeHidden();
  await expect(page.locator('#btn-koord-sakrij')).toBeVisible();
  await expect(page.locator('#btn-koord-sakrij')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#btn-podloga')).toBeVisible();
  await page.reload();
  await expect(page.locator('#koord-traka')).toBeHidden();
  await page.locator('#btn-koord-sakrij').click();
  await expect(page.locator('#koord-traka')).toBeVisible();
  const b = await page.locator('#btn-koord-sakrij').boundingBox();
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
});

test.describe('uski ekran', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('koordinate (WGS84 sa 6 decimala) stanu u traku; prekidač je ispod dugmeta podloge', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#koord-gk')).toHaveText(/\d+\.\d{6}, \d+\.\d{6}/);
    const fits = await page.locator('#koord-traka .pill-red').evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    const t = await page.locator('#btn-koord-sakrij').boundingBox();
    const l = await page.locator('#btn-podloga').boundingBox();
    expect(t.y).toBeGreaterThanOrEqual(l.y + l.height);
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
