import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo', geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => { await fakeServerConfigUnset(page); });

test('čip dnevnog svjetla pokazuje stanje; Istraživač nagne kartu i pokaže smjer i udaljenost članova', async ({ page }) => {
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#svjetlo-chip')).toHaveAttribute('data-stanje', 'dan');
  await expect(page.locator('#svjetlo-chip')).toContainText('Svjetlo do 16:2');

  await lok(page, '#btn-istrazivac');
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

  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#ekran-mapa')).not.toHaveClass(/istrazivac/);
  await expect(page.locator('#istrazivac-traka')).toBeHidden();
});

test('Istraživač: karta se okreće dugmadima i prati kompas; strelice članova slijede rotaciju; Sjever gore vraća', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#istrazivac-kontrole')).toBeVisible();
  for (const b of await page.locator('#istrazivac-kontrole button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const tr = () => page.evaluate(() => document.getElementById('karta').style.transform);
  await page.locator('#btn-ist-desno').click();
  expect(await tr()).toContain('rotateZ(15deg)');
  await page.locator('#btn-ist-lijevo').click();
  await page.locator('#btn-ist-lijevo').click();
  expect(await tr()).toContain('rotateZ(345deg)');
  await page.locator('#btn-ist-sjever').click();
  expect(await tr()).toContain('rotateZ(0deg)');

  await page.locator('#btn-ist-kompas').click();
  await expect(page.locator('#btn-ist-kompas')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, absolute: true })));
  await expect.poll(tr).toContain('rotateZ(270deg)');

  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#istrazivac-kontrole')).toBeHidden();
  expect(await tr()).toBe('');
});
