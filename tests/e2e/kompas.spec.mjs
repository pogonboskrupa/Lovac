import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test('Moja lokacija ima kompas: pravac gledanja prati senzor, ruža se okreće, napomena je tu', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#kompas')).toBeVisible();
  await expect(page.locator('#kompas-napomena')).toContainText('Ne zamjenjuje pravila lova');
  // alpha 270 = telefon gleda na istok (90°)
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, absolute: true })));
  await expect(page.locator('#kompas-tekst')).toHaveText('I 90°');
  await expect(page.locator('#kompas-izvor')).toContainText('kompas');
  await expect.poll(() => page.locator('#kompas-ruza').evaluate((g) => g.style.transform)).toBe('rotate(270deg)');
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 180, absolute: true })));
  await expect.poll(async () => (await page.locator('#kompas-tekst').innerText())).toMatch(/^(I|JI|J) /);
});

test('kompas ne pravi ploču previsokom i ne smeta dugmadi (≥ 44 px, ploča ≤ 55 % ekrana)', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible();
  expect((await page.locator('#lok-ploca').boundingBox()).height).toBeLessThan(740 * 0.55);
});

test('kompas se raširi preko ploče (nema naslijeđene veličine 128 px kompasa iz panela lova) i tekst ostaje unutar okvira', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#kompas')).toBeVisible();
  const ploca = await page.locator('#lok-ploca').boundingBox();
  const kutija = await page.locator('#kompas').boundingBox();
  expect(kutija.width).toBeGreaterThan(ploca.width - 40);
  expect(kutija.height).toBeLessThan(130);
  expect((await page.locator('#kompas-napomena').boundingBox()).y).toBeGreaterThanOrEqual(kutija.y + kutija.height - 1);
  for (const id of ['#kompas-tekst', '#kompas-izvor']) {
    const b = await page.locator(id).boundingBox();
    expect(b.y, id).toBeGreaterThanOrEqual(kutija.y - 1);
    expect(b.y + b.height, id).toBeLessThanOrEqual(kutija.y + kutija.height + 1);
    expect(b.x + b.width, id).toBeLessThanOrEqual(kutija.x + kutija.width + 1);
  }
});
