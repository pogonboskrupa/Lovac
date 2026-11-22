import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
});

const box = (page, sel) => page.locator(sel).boundingBox();

test('donja navigacija: Mapa, Sekcija, Meni, Postavke (redom), Mapa je aktivna', async ({ page }) => {
  const labels = await page.locator('.donja-nav > button').allInnerTexts();
  expect(labels.map((t) => t.trim())).toEqual(['Mapa', 'Sekcija', 'Meni', 'Postavke']);
  await expect(page.locator('#nav-mapa')).toHaveAttribute('aria-current', 'page');
  const vp = page.viewportSize();
  const nav = await box(page, '.donja-nav');
  expect(nav.y + nav.height).toBeGreaterThan(vp.height - 2);
  for (const b of await page.locator('.donja-nav > button').all()) {
    const r = await b.boundingBox();
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  }
});

test('gornji lijevi okvir: jedan red koordinata (WGS84 pa MGI 5 pa MGI 6 dodirom), bez razmjera; slojevi gore desno', async ({ page }) => {
  await expect(page.locator('#koord-zona')).toHaveText('WGS84');
  await expect(page.locator('#koord-gk')).toHaveText(/^\d{2}\.\d{6}, \d{2}\.\d{6}$/);
  await expect(page.locator('#koord-razmjer')).toHaveCount(0);
  await expect(page.locator('#koord-wgs')).toHaveCount(0);
  await page.locator('#koord-traka').click();
  await expect(page.locator('#koord-zona')).toHaveText('MGI 5');
  await expect(page.locator('#koord-gk')).toHaveText(/^Y 55\d{5}, X 49\d{5}$/);
  await page.locator('#koord-traka').click();
  await expect(page.locator('#koord-zona')).toHaveText('MGI 6');
  await page.locator('#koord-traka').click();
  await expect(page.locator('#koord-zona')).toHaveText('WGS84');
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
  const loc = await box(page, '#btn-moja-lokacija');
  expect(zin.x).toBeLessThan(vp.width / 2);
  expect(zout.y).toBeGreaterThan(zin.y);
  expect(zout.y + zout.height).toBeLessThanOrEqual(nav.y);
  expect(loc.x).toBeGreaterThan(vp.width / 2);
  expect(loc.y + loc.height).toBeLessThanOrEqual(nav.y);
  // bez prikaza nivoa zuma; kontrole su tik iznad donje navigacije, a dugmad su jednake širine
  await expect(page.locator('#zoom-nivo')).toHaveCount(0);
  expect(nav.y - (zout.y + zout.height)).toBeLessThanOrEqual(16);
  expect(nav.y - (loc.y + loc.height)).toBeLessThanOrEqual(16);
  const add = await box(page, '#btn-dodaj');
  expect(Math.round(zin.width)).toBe(56);
  expect(Math.round(loc.width)).toBe(Math.round(zin.width));
  expect(Math.round(add.width)).toBe(Math.round(zin.width));
  const tilesBefore = await page.locator('#karta .leaflet-tile-loaded').count();
  await page.locator('#btn-zoom-in').click();
  await page.waitForTimeout(600);
  expect(tilesBefore).toBeGreaterThan(0);
});

test('Meni, Postavke, Sekcija i Karte su ekrani iznad mape; navigacija ostaje vidljiva i radi', async ({ page }) => {
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#meni-spiskovi')).toBeVisible();
  await expect(page.locator('#btn-spiskovi')).toHaveAttribute('aria-current', 'page');
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#postavke')).toBeVisible();
  await expect(page.locator('#meni-spiskovi')).toBeHidden();
  await expect(page.locator('#btn-postavke')).toHaveAttribute('aria-current', 'page');
  // Navigacija nije prekrivena otvorenim ekranom.
  const nav = await box(page, '#btn-sekcija');
  const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.donja-nav') !== null, [nav.x + nav.width / 2, nav.y + nav.height / 2]);
  expect(top).toBe(true);
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sekcija-ekran')).toBeVisible();
  await expect(page.locator('#postavke')).toBeHidden();
  await expect(page.locator('#btn-sekcija')).toHaveAttribute('aria-current', 'page');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#karte')).toBeVisible();
  await expect(page.locator('#sekcija-ekran')).toBeHidden();
  await expect(page.locator('#teren-status')).toBeVisible();
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

test('desno na mapi samo + i Moja lokacija; ostalo (snimaj, opažanje, prati, centriraj, 3D) je u ploči Moja lokacija', async ({ page }) => {
  const vp = page.viewportSize();
  for (const sel of ['#btn-dodaj', '#btn-moja-lokacija']) {
    const b = await box(page, sel);
    expect(b.x, sel).toBeGreaterThan(vp.width / 2);
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
  for (const sel of ['#btn-snimaj', '#btn-opazanje', '#btn-prati', '#btn-centriraj', '#btn-istrazivac']) await expect(page.locator(sel)).toBeHidden();
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible();
  for (const sel of ['#btn-snimaj', '#btn-opazanje', '#btn-prati', '#btn-centriraj', '#btn-istrazivac', '#btn-lok-kopiraj']) {
    const b = await box(page, sel);
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
  const panel = await box(page, '#lok-ploca');
  const nav = await box(page, '.donja-nav');
  expect(panel.y + panel.height).toBeLessThanOrEqual(nav.y);
  await page.locator('#btn-lok-zatvori').click();
  await expect(page.locator('#lok-ploca')).toBeHidden();
});
