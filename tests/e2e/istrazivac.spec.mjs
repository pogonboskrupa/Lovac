import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo', geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => { await fakeServerConfigUnset(page); });

test('čip dnevnog svjetla pokazuje stanje; Istraživač nagne kartu i pokaže smjer i udaljenost članova', async ({ page }) => {
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#svjetlo-chip')).toHaveAttribute('data-stanje', 'dan');
  await expect(page.locator('#svjetlo-chip')).toContainText('Svjetlo do 16:2');

  await page.locator('#btn-istrazivac').click();
  await expect(page.locator('#ekran-mapa')).toHaveClass(/istrazivac/);
  await expect(page.locator('#btn-istrazivac')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('karta')).transform)).not.toBe('none');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows: [
    { korisnik_id: 'x1', lat: 44.89, lon: 16.15, t: new Date().toISOString() },
  ] } })));
  const chip = page.locator('#istrazivac-traka .clan-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText(/S 1[,.]1 km|S 1,1 km/);
  const box = await chip.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await page.locator('#btn-istrazivac').click();
  await expect(page.locator('#ekran-mapa')).not.toHaveClass(/istrazivac/);
  await expect(page.locator('#istrazivac-traka')).toBeHidden();
});
