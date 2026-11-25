import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

const drag = async (page, dx) => {
  await page.mouse.move(180, 300);
  await page.mouse.down();
  await page.mouse.move(180 + dx, 300, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
};

test('Prati me: manji pomak karte se vraća na poziciju, praćenje se gasi tek kad pozicija pređe 50 % puta do ruba', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await lok(page, '#btn-prati');
  await expect(page.locator('#btn-prati')).toHaveAttribute('aria-pressed', 'true');

  // 60 px od 180 px (≈ 33 %): praćenje ostaje uključeno
  await drag(page, 60);
  await expect(page.locator('#btn-prati')).toHaveAttribute('aria-pressed', 'true');

  // 130 px od 180 px (≈ 72 %): praćenje se gasi
  await drag(page, 130);
  await expect(page.locator('#btn-prati')).toHaveAttribute('aria-pressed', 'false');
});
