import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('veličina teksta: veliko i najveće povećavaju sadržaj, meni ide u jednu kolonu, izbor se pamti', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  const h = async (sel) => {
    return (await page.locator(sel).boundingBox()).height;
  };
  const normal = await h('#btn-provjeri-azuriranje');
  await page.locator(`#p-velicina [data-velicina="veliko"]`).click();
  await expect(page.locator('html')).toHaveAttribute('data-velicina', 'veliko');
  await expect(page.locator(`#p-velicina [data-velicina="veliko"]`)).toHaveAttribute('aria-pressed', 'true');
  const veliko = await h('#btn-provjeri-azuriranje');
  expect(veliko).toBeGreaterThan(normal * 1.15);
  await page.locator(`#p-velicina [data-velicina="najvece"]`).click();
  const najvece = await h('#btn-provjeri-azuriranje');
  expect(najvece).toBeGreaterThan(veliko * 1.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // meni: jedna kolona, pločice ne prelaze širinu ekrana
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-velicina', 'najvece');
  await page.locator('#btn-spiskovi').click();
  const boxes = await page.locator('#meni-spiskovi .meni-plocica').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right }; }));
  expect(boxes.length).toBeGreaterThan(8);
  expect(new Set(boxes.map((b) => Math.round(b.left))).size).toBe(1); // sve pločice poravnate u jednoj koloni
  for (const b of boxes) expect(b.right).toBeLessThanOrEqual(360);
  // donja navigacija ostaje na mjestu
  const nav = await page.locator('.donja-nav').boundingBox();
  expect(nav.y + nav.height).toBeGreaterThan(730);

  await page.locator('#btn-postavke').click();
  await page.locator(`#p-velicina [data-velicina="normalno"]`).click();
  await expect(page.locator('html')).toHaveAttribute('data-velicina', 'normalno');
});

test('moj pas: zalijepljena lokacija pokazuje udaljenost i smjer, trag, vodi me; radi bez interneta', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#btn-pas-opis')).toHaveText('Pozicija sa ogrlice');
  await page.locator('#btn-pas').click();
  await expect(page.locator('#pas-ekran')).toBeVisible();
  await expect(page.locator('#pas-stanje')).toHaveText('Pozicija psa još nije unesena.');

  await page.fill('#pas-unos', 'nešto bez koordinata');
  await page.locator('#btn-pas-prikazi').click();
  await expect(page.locator('#pas-greska')).toContainText('Ne prepoznajem');

  await page.fill('#pas-ime', 'Rex');
  await page.fill('#pas-unos', 'Rex: https://maps.google.com/?q=44.89,16.15 baterija 80%');
  await page.locator('#btn-pas-prikazi').click();
  await expect(page.locator('#pas-stanje')).toContainText('Rex: 1,1 km S od tebe · upravo');
  await expect(page.locator('#pas-stanje')).toHaveAttribute('data-stanje', 'svjeze');
  await expect(page.locator('.pas-marker')).toBeAttached();
  await expect(page.locator('#pas-unos')).toHaveValue('');

  await page.fill('#pas-unos', '44.8905, 16.1512');
  await page.locator('#btn-pas-prikazi').click();
  await expect(page.locator('#pas-historija li')).toHaveCount(2);

  // sačuvano lokalno i vidljivo u meniju poslije ponovnog pokretanja
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#btn-pas-opis')).toContainText('Rex:');
  await page.locator('#btn-pas').click();
  await page.locator('#btn-pas-vodi').click();
  await expect(page.locator('#navigacija')).toBeVisible();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pas').click();
  await page.locator('#btn-pas-obrisi').click();
  await expect(page.locator('#pas-stanje')).toHaveText('Pozicija psa još nije unesena.');
});
