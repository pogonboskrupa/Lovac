import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
});

const box = (page, sel) => page.locator(sel).boundingBox();

test('donja navigacija: Mapa, Karte, Meni, Postavke (redom), Mapa je aktivna', async ({ page }) => {
  const labels = await page.locator('.donja-nav > button').allInnerTexts();
  expect(labels.map((t) => t.trim())).toEqual(['Mapa', 'Karte', 'Meni', 'Postavke']);
  await expect(page.locator('#nav-mapa')).toHaveAttribute('aria-current', 'page');
  const vp = page.viewportSize();
  const nav = await box(page, '.donja-nav');
  expect(nav.y + nav.height).toBeGreaterThan(vp.height - 2);
  for (const b of await page.locator('.donja-nav > button').all()) {
    const r = await b.boundingBox();
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  }
});

test('gornji lijevi okvir: MGI koordinate (zona 5 za Grmeč) i razmjer 1:N; slojevi gore desno', async ({ page }) => {
  await expect(page.locator('#koord-zona')).toHaveText('MGI 5');
  await expect(page.locator('#koord-gk')).toHaveText(/^Y \d{7}, X \d{7}$/);
  await expect(page.locator('#koord-razmjer')).toHaveText(/^1:\d{1,3}( \d{3})*$/);
  const pill = await box(page, '#koord-traka');
  expect(pill.x).toBeLessThan(40);
  expect(pill.y).toBeLessThan(120);
  const layers = await box(page, '#btn-podloga');
  const vp = page.viewportSize();
  expect(layers.x + layers.width).toBeGreaterThan(vp.width - 40);
  expect(layers.y).toBeLessThan(120);
});

test('zoom lijevo dole sa nivoom, lociranje desno dole, oba iznad navigacije', async ({ page }) => {
  const vp = page.viewportSize();
  const nav = await box(page, '.donja-nav');
  const zin = await box(page, '#btn-zoom-in');
  const zout = await box(page, '#btn-zoom-out');
  const loc = await box(page, '#btn-centriraj');
  expect(zin.x).toBeLessThan(vp.width / 2);
  expect(zout.y).toBeGreaterThan(zin.y);
  expect(zout.y + zout.height).toBeLessThanOrEqual(nav.y);
  expect(loc.x).toBeGreaterThan(vp.width / 2);
  expect(loc.y + loc.height).toBeLessThanOrEqual(nav.y);
  await expect(page.locator('#zoom-nivo')).toHaveText(/^\d{1,2}$/);
  const before = Number(await page.locator('#zoom-nivo').innerText());
  await page.locator('#btn-zoom-in').click();
  await expect(page.locator('#zoom-nivo')).toHaveText(String(before + 1));
});

test('Meni, Postavke i Karte su ekrani iznad mape; navigacija ostaje vidljiva i radi', async ({ page }) => {
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#meni-spiskovi')).toBeVisible();
  await expect(page.locator('#btn-spiskovi')).toHaveAttribute('aria-current', 'page');
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#postavke')).toBeVisible();
  await expect(page.locator('#meni-spiskovi')).toBeHidden();
  await expect(page.locator('#btn-postavke')).toHaveAttribute('aria-current', 'page');
  // Navigacija nije prekrivena otvorenim ekranom.
  const nav = await box(page, '#btn-karte');
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.donja-nav') !== null, [nav.x + nav.width / 2, nav.y + nav.height / 2]);
  expect(top).toBe(true);
  await page.locator('#btn-karte').click();
  await expect(page.locator('#karte')).toBeVisible();
  await expect(page.locator('#postavke')).toBeHidden();
  await expect(page.locator('#karte [data-podloga="topo"]')).toBeVisible();
  await expect(page.locator('#karte-spisak')).toBeAttached();
  await expect(page.locator('#btn-pred-preuzmi')).toBeAttached();
  await page.locator('#nav-mapa').click();
  await expect(page.locator('#karte')).toBeHidden();
  await expect(page.locator('#nav-mapa')).toHaveAttribute('aria-current', 'page');
});

test('Meni se zatvara drugim dodirom na Meni; stavka iz menija otvara ekran i zatvara meni', async ({ page }) => {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#meni-spiskovi')).toBeHidden();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-objekti').click();
  await expect(page.locator('#objekti')).toBeVisible();
  await expect(page.locator('#meni-spiskovi')).toBeHidden();
  await page.locator('#nav-mapa').click();
  await expect(page.locator('#objekti')).toBeHidden();
});

test('dodavanje i brzi unos ostaju na mapi (desno): snimaj, opažanje, dodaj, lociranje', async ({ page }) => {
  const vp = page.viewportSize();
  for (const sel of ['#btn-snimaj', '#btn-opazanje', '#btn-dodaj', '#btn-prati', '#btn-centriraj']) {
    const b = await box(page, sel);
    expect(b.x, sel).toBeGreaterThan(vp.width / 2);
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
});
