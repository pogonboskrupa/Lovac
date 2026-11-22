import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

const heading = (page, alpha) => page.evaluate((a) => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: a, absolute: true })), alpha);
const cone = (page) => page.locator('.gps-stozac');

test('plavi snop pravca gledanja na karti prati kompas i gasi se prekidačem u ploči Moja lokacija', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#btn-kompas-stozac')).toHaveAttribute('aria-checked', 'true');
  expect(await page.locator('#kompas-ruza').count(), 'ruža je uklonjena iz ploče').toBe(0);
  await heading(page, 270); // gleda na istok (90°)
  await expect.poll(() => cone(page).evaluate((e) => e.style.visibility)).toBe('visible');
  await expect.poll(() => cone(page).evaluate((e) => e.style.transform)).toBe('rotate(90deg)');
  await page.locator('#btn-kompas-stozac').click();
  await expect(page.locator('#btn-kompas-stozac')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => cone(page).evaluate((e) => e.style.visibility)).toBe('hidden');
  await page.reload();
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#btn-kompas-stozac')).toHaveAttribute('aria-checked', 'false');
  await heading(page, 180);
  await page.waitForTimeout(300);
  await expect.poll(() => cone(page).evaluate((e) => e.style.visibility)).toBe('hidden');
});

test('ploča: prekidač zauzima širinu, nema naslijeđene veličine, napomena o pravilima lova je tu', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#kompas')).toBeVisible();
  const ploca = await page.locator('#lok-ploca').boundingBox();
  const red = await page.locator('#kompas').boundingBox();
  expect(red.width).toBeGreaterThan(ploca.width - 40);
  expect(red.height).toBeLessThan(90);
  expect((await page.locator('#btn-kompas-stozac').boundingBox()).height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#kompas-napomena')).toContainText('Ne zamjenjuje pravila lova');
  expect(ploca.height).toBeLessThan(740 * 0.6);
});

test('Moja lokacija: ploča je uz donju navigaciju, kontrole mape se sklanjaju, klik na kartu i drugi tab je zatvaraju', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#btn-moja-lokacija')).toBeVisible();
  await page.locator('#btn-moja-lokacija').click();
  const ploca = page.locator('#lok-ploca');
  await expect(ploca).toBeVisible();
  const nav = await page.locator('nav').first().boundingBox();
  const b = await ploca.boundingBox();
  expect(Math.abs(b.y + b.height - nav.y), 'ploča sjedi na navigaciji').toBeLessThanOrEqual(2);
  expect(b.width).toBeGreaterThanOrEqual(358);
  for (const id of ['#btn-moja-lokacija', '#btn-dodaj', '#btn-zoom-in', '#btn-zoom-out']) await expect(page.locator(id), id).toBeHidden();

  // klik na kartu zatvara i vraća kontrole
  await page.mouse.click(180, 150);
  await expect(ploca).toBeHidden();
  for (const id of ['#btn-moja-lokacija', '#btn-dodaj', '#btn-zoom-in']) await expect(page.locator(id), id).toBeVisible();

  // drugi tab (Meni) zatvara ploču
  await page.locator('#btn-moja-lokacija').click();
  await expect(ploca).toBeVisible();
  await page.locator('#btn-spiskovi').click();
  await expect(ploca).toBeHidden();
  await expect(page.locator('#btn-moja-lokacija')).toBeVisible();
});

test('moja pozicija na karti je nišan (krug sa križem), a plavi snop pravca ostaje', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.gps-ikona .gps-nisan')).toHaveCount(1);
  expect(await page.locator('.gps-strelica').count(), 'strelica je zamijenjena nišanom').toBe(0);
  await expect(page.locator('.gps-nisan circle')).toHaveCount(2);
  await expect(page.locator('.gps-nisan-oblik path')).toHaveCount(1);
  await heading(page, 270);
  await expect.poll(() => page.locator('.gps-stozac').evaluate((e) => e.style.visibility)).toBe('visible');
});

test('nišan pozicije je 10 % manji od ranijih 34 px', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.gps-nisan')).toHaveCount(1);
  const b = await page.locator('.gps-nisan').boundingBox();
  expect(b.width).toBeGreaterThan(30);
  expect(b.width).toBeLessThan(31.5);
}); 
