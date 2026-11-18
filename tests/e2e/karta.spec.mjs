import { test, expect } from '@playwright/test';
import { serveTiles, TILE_HOSTS } from './helpers.mjs';

test('bez podešenog servera app ulazi na kartu sa pločicama i koordinatama', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await expect(page.locator('#bez-servera')).toBeVisible();
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await expect(page.locator('#koord-gk')).toHaveText(/^Y \d{7}  X \d{7}$/);
  await expect(page.locator('.leaflet-control-scale')).toBeVisible();
  expect(errors).toEqual([]);
});

test('viđene pločice se prikazuju bez interneta (Cache API)', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  const loadedOnline = await page.locator('#karta .leaflet-tile-loaded').count();
  await page.waitForTimeout(500);

  await page.unroute(TILE_HOSTS);
  await page.route(TILE_HOSTS, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  const loadedOffline = await page.locator('#karta .leaflet-tile-loaded').count();
  expect(loadedOffline).toBeGreaterThanOrEqual(Math.min(loadedOnline, 4));
});

test('odgovor 200 koji nije slika se ne kešira', async ({ page }) => {
  await page.route(TILE_HOSTS, (r) => r.fulfill({
    status: 200, body: '<ServiceException/>', headers: { 'content-type': 'application/xml', 'access-control-allow-origin': '*' },
  }));
  await page.route(/api\.github\.com/, (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.waitForTimeout(1500);
  const cached = await page.evaluate(async () => (await (await caches.open('plocice-v1')).keys()).length);
  expect(cached).toBe(0);
});

test('izbor podloge se pamti', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  await page.locator('[data-podloga="satelit"]').click();
  await expect(page.locator('[data-podloga="satelit"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('[data-podloga="satelit"]')).toHaveAttribute('aria-pressed', 'true');
});

test('GPS: tačnost u boji i Centriraj', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.9, longitude: 16.2, accuracy: 4 });
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveAttribute('data-tacnost', 'dobro');
  await expect(page.locator('#gps-tacnost')).toHaveText('±4 m');
  await page.locator('#btn-centriraj').click();
  await expect(page.locator('#koord-wgs')).toHaveText(/^44\.9000\d*, 16\.2000\d*$/);

  await context.setGeolocation({ latitude: 44.9, longitude: 16.2, accuracy: 30 });
  await expect(page.locator('#gps-tacnost')).toHaveAttribute('data-tacnost', 'lose');
});

test('dodirne mete su ≥ 44 px', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  for (const sel of ['#btn-podloga', '#btn-tema', '#btn-zoom-in', '#btn-zoom-out', '#btn-centriraj', '#btn-prati', '#koord-traka']) {
    const b = await page.locator(sel).boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
});
