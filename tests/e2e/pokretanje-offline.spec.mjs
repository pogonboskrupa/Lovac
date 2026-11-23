import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigHanging } from './helpers.mjs';
test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });
test('offline: ponovno pokretanje bez mreže ulazi na kartu sa keširanim pločicama, GPS i unos rade', async ({ page, context }) => {
  await serveTiles(page);
  await fakeServerConfigHanging(page);
  await page.addInitScript(() => { localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'A', prezime: 'B', odobren: true })); const past = Math.floor(Date.now() / 1000) - 3600; localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: past, user: { id: 'u1', aud: 'authenticated', role: 'authenticated' } })); });
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await page.waitForTimeout(1500); // pločice u kešu
  await page.unroute(/opentopomap|arcgisonline|openstreetmap/).catch(() => {});
  await page.route(/opentopomap|arcgisonline|openstreetmap/, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached({ timeout: 8000 });
  await expect(page.locator('#karta .gps-nisan')).toHaveCount(1);
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#meni-dodaj')).toBeVisible();
});
