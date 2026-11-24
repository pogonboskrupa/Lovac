import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('visina u traci je samo prikaz (nije dugme); traku sakriva i vraća samo prekidač u ploči podloga, izbor se pamti', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#koord-traka')).toBeVisible();
  await expect(page.locator('#koord-nv')).toBeVisible();
  expect(await page.locator('#btn-nv').evaluate((e) => e.tagName)).toBe('SPAN');
  await page.locator('#btn-nv').click();
  await expect(page.locator('#koord-traka')).toBeVisible(); // dodir na visinu više ništa ne sakriva
  await page.locator('#btn-podloga').click();
  const sw = page.locator('#btn-koord-prikazi');
  await expect(sw).toHaveAttribute('aria-pressed', 'true');
  await sw.click();
  await expect(page.locator('#koord-okvir')).toBeHidden();
  await expect(sw).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.locator('#koord-okvir')).toBeHidden();
  await page.locator('#btn-podloga').click();
  await page.locator('#btn-koord-prikazi').click();
  await expect(page.locator('#koord-traka')).toBeVisible();
  await expect(page.locator('#btn-podloga')).toBeVisible();
});

test.describe('uski ekran', () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test('koordinate (WGS84 sa 6 decimala) stanu u okvir uz visinu', async ({ page }) => {
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
