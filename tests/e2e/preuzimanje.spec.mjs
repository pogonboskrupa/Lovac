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

test('OSM podloga se ne preuzima masovno; preveliko područje se odbija', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  await page.locator('#meni-podloga [data-podloga="osm"]').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#pred-procjena')).toContainText('nije dozvoljeno');
  await expect(page.locator('#btn-pred-preuzmi')).toBeDisabled();
  await page.locator('#karte [data-podloga="topo"]').click();
  await page.locator('#nav-mapa').click();
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 9 })));
  await page.reload();
  await page.locator('#btn-karte').click();
  await page.locator('#pred-zoom').selectOption('17');
  await expect(page.locator('#pred-procjena')).toContainText('preveliko');
  await expect(page.locator('#btn-pred-preuzmi')).toBeDisabled();
});
