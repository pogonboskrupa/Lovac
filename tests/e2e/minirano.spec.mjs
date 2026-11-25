import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

const KML = readFileSync(new URL('./fixtures/minirano-uzorak.kml', import.meta.url), 'utf8'); // 5 poligona iz stvarnog BHMAC fajla
const URL_RE = /raw\.githubusercontent\.com\/[^/]+\/[^/]+\/podaci\/minirano\.kml/;

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

async function openLayers(page) {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await expect(page.locator('#slojevi')).toBeVisible();
}

test('minirana područja se sama skinu u aplikaciji, nacrtaju CRVENO sa 60 % popune i rade bez interneta', async ({ page }) => {
  let zahtjeva = 0;
  await page.route(URL_RE, (r) => { zahtjeva++; return r.fulfill({ status: 200, contentType: 'text/plain', body: KML, headers: { 'access-control-allow-origin': '*' } }); });
  await page.goto('/');
  await expect.poll(() => zahtjeva, { timeout: 15000 }).toBe(1);
  await openLayers(page);
  await expect(page.locator('#minirano-stanje')).toContainText('5 područja · preuzeto danas');
  await expect(page.locator('#minirano-napomena')).toContainText('ne zamjenjuju oznake na terenu');
  // crta se u pane-u slojeva: crvena linija i popuna 0,6
  const path = page.locator('.leaflet-slojevi-pane path').first();
  await expect(path).toHaveAttribute('fill-opacity', '0.6');
  await expect(path).toHaveAttribute('fill', '#d40000');
  await expect(path).toHaveAttribute('stroke', '#d40000');
  // nije u običnom spisku granica (ima vlastitu karticu, ne može se ukloniti sa telefona)
  await expect(page.locator('#slojevi-spisak [data-id]')).toHaveCount(0);

  // bez interneta: sloj ostaje (IndexedDB) i poslije ponovnog pokretanja
  await page.unroute(URL_RE);
  await page.route(URL_RE, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.locator('.leaflet-slojevi-pane path').first()).toHaveAttribute('fill-opacity', '0.6');
});

test('ručno "Preuzmi / ažuriraj": greška 404 (fajl još nije objavljen) se kaže lovcu, sloj se ne pravi', async ({ page }) => {
  await page.route(URL_RE, (r) => r.fulfill({ status: 404, body: 'Not Found', headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  await openLayers(page);
  await page.locator('#btn-minirano-preuzmi').click();
  await expect(page.locator('#minirano-status')).toContainText('još nisu objavljeni');
  await expect(page.locator('#minirano-stanje')).toContainText('Još nije preuzeto');
  await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(0);
});

test('popup poligona kaže da je minirano područje i da ne zamjenjuje oznake; lovac može sakriti sloj', async ({ page }) => {
  await page.route(URL_RE, (r) => r.fulfill({ status: 200, contentType: 'text/plain', body: KML, headers: { 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  await openLayers(page);
  await page.locator('#btn-minirano-preuzmi').click();
  await expect(page.locator('#minirano-stanje')).toContainText('5 područja');
  await expect(page.locator('#btn-minirano-karta')).toBeEnabled();
  await page.locator('#minirano-vidljivo').uncheck();
  await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(0);
  await page.locator('#minirano-vidljivo').check();
  await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(5);
  // ponovno preuzimanje ne vraća sakriven sloj
  await page.locator('#minirano-vidljivo').uncheck();
  await page.locator('#btn-minirano-preuzmi').click();
  await expect(page.locator('#btn-minirano-preuzmi')).toHaveText('Ažuriraj');
  await expect(page.locator('#minirano-vidljivo')).not.toBeChecked();
});
