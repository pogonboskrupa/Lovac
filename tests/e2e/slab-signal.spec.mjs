import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 } });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Lovac', odobren: true, is_admin: false })));
});

test('preslab signal: app to prepozna, javi "radim offline" i nastavi raditi; kad veza proradi, vraća se', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  const q = () => page.evaluate(async () => { const n = await import('/static/js/net.js'); return [n.connectionQuality(), n.connectionDetail()]; });

  // zahtjevi traju preko 8 s: signal postoji, ali ne valja
  await page.evaluate(async () => { const n = await import('/static/js/net.js'); for (let i = 0; i < 6; i++) n.recordSample(true, 9500); });
  expect(await q()).toEqual(['nema', 'preslaba']);
  await expect(page.locator('#veza')).toBeVisible();
  await expect(page.locator('#veza')).toContainText('Slab signal — radim offline');
  await expect(page.locator('#poruka')).toContainText('radi offline');

  // app i dalje radi: mapa, unos opažanja lokalno
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible();
  await page.locator('#btn-lok-zatvori').click();
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-opazanje').click();
  await expect(page.locator('#opazanje-forma')).toBeVisible();
  await page.locator('#forma-opazanje button[type=submit]').click();
  await expect(page.locator('#opazanje-forma')).toBeHidden();

  // Postavke pokazuju isto stanje
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="podaci"]').click();
  await expect(page.locator('#sp-veza')).toHaveText('Server nije podešen');

  // veza proradi: brzi uspješni zahtjevi
  await page.evaluate(async () => { const n = await import('/static/js/net.js'); for (let i = 0; i < 8; i++) n.recordSample(true, 200); });
  expect(await q()).toEqual(['dobra', 'dobra']);
  await expect(page.locator('#veza')).toBeHidden();
});
