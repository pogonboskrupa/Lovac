import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, TILE_HOSTS } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('preuzimanje područja puni keš, a onda karta radi bez interneta i na većem zoomu', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 15 })));
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await page.locator('#pred-zoom').selectOption('16');
  await expect(page.locator('#pred-procjena')).toHaveText(/zoom 15–16: \d+ pločica/);
  await page.locator('#btn-pred-preuzmi').click();
  await expect(page.locator('#poruka')).toContainText('Područje preuzeto', { timeout: 20000 });
  await page.locator('#nav-mapa').click();

  await page.unroute(TILE_HOSTS);
  await page.route(TILE_HOSTS, (r) => r.abort('internetdisconnected'));
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 16 })));
  await page.reload();
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  const failed = await page.locator('#karta .leaflet-tile:not(.leaflet-tile-loaded)').count();
  expect(failed).toBe(0);
});

test('preveliko područje se odbija (najviše 2500 pločica)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 9 })));
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await page.locator('#pred-zoom').selectOption('17');
  await expect(page.locator('#pred-procjena')).toContainText('preveliko');
  await expect(page.locator('#btn-pred-preuzmi')).toBeDisabled();
});

test('preuzeto područje ulazi u spisak, označava se kao već preuzeto, prikazuje se na karti i može se ukloniti', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 15 })));
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#podrucja-prazno')).toBeVisible();
  await page.locator('#pred-zoom').selectOption('16');
  await page.locator('#btn-pred-preuzmi').click();
  await expect(page.locator('#podrucja-spisak [data-id]')).toHaveCount(1, { timeout: 15000 });
  await expect(page.locator('#podrucja-spisak')).toContainText('zoom 15–16');
  await expect(page.locator('#podrucja-broj')).toContainText('1');
  await expect(page.locator('#pred-procjena')).toContainText('već preuzeto');

  // pokrivenost na karti
  expect(await page.locator('#karta .leaflet-overlay-pane path').count()).toBe(0);
  await page.locator('#btn-podrucja-pokrivenost').click();
  await expect(page.locator('#btn-podrucja-pokrivenost')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => page.locator('#karta .leaflet-overlay-pane path').count()).toBeGreaterThan(0);

  // ostaje i poslije ponovnog učitavanja
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#podrucja-spisak [data-id]')).toHaveCount(1);

  // uklanjanje traži drugi dodir
  await page.locator('#podrucja-spisak [data-akcija="ukloni"]').click();
  await expect(page.locator('#podrucja-spisak [data-id]')).toHaveCount(1);
  await page.locator('#podrucja-spisak [data-akcija="ukloni"]').click();
  await expect(page.locator('#podrucja-spisak [data-id]')).toHaveCount(0);
  await expect(page.locator('#podrucja-prazno')).toBeVisible();
});
