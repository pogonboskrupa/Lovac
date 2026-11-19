import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-mjerenje').click();
  await expect(page.locator('#mjerenje')).toBeVisible();
});


test('udaljenost: dvije tačke na nišanu (pomjeranje karte)', async ({ page }) => {
  await page.locator('#btn-mj-nisan').click();
  await expect(page.locator('#mj-rezultat')).toHaveText('Dodaj bar 2 tačke');
  await page.mouse.move(206, 450);
  await page.mouse.down();
  await page.mouse.move(206, 350, { steps: 5 });
  await page.mouse.up();
  await page.locator('#btn-mj-nisan').click();
  await expect(page.locator('#mj-rezultat')).toHaveText(/^Udaljenost \d/);
  await expect(page.locator('#mj-tacke')).toHaveText('2');
  await expect(page.locator('#mj-nagib')).toContainText('Nagib');
});

test('površina: tri dodira na karti daju hektare; Poništi i Nazad', async ({ page }) => {
  await page.locator('#mj-nacin [data-nacin="povrsina"]').click();
  for (const [x, y] of [[100, 300], [300, 300], [200, 500]]) await page.mouse.click(x, y);
  await expect(page.locator('#mj-rezultat')).toHaveText(/^Površina [\d,]+ ha · obim/);
  await page.locator('#btn-mj-ponisti').click();
  await expect(page.locator('#mj-rezultat')).toHaveText('Dodaj bar 3 tačke');
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#mjerenje')).toBeHidden();
});
