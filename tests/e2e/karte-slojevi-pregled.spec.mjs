import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

const seedLayers = (page, rows) => page.evaluate((r) => new Promise((resolve) => {
  const req = indexedDB.open('lovac');
  req.onsuccess = () => {
    const tx = req.result.transaction('slojevi', 'readwrite');
    r.forEach((x) => tx.objectStore('slojevi').put(x));
    tx.oncomplete = resolve;
  };
}), rows);

const gj = (n) => ({ type: 'FeatureCollection', features: Array.from({ length: n }, (_, i) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [16.15 + i / 1000, 44.88] } })) });

test('Karte i offline: hero sa brojkama i savjet o spremnosti (bez aplikacije fajlovi su "—")', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#karte-hero-karte')).toHaveText('—');
  await expect.poll(async () => Number(await page.locator('#karte-hero-plocice').innerText())).toBeGreaterThan(0);
  await expect(page.locator('#karte-savjet')).toContainText(/preuzmi|Radi samo/i);
  await expect(page.locator('#karte .p-kartica')).toHaveCount(5);
});

test('Slojevi: hero, prikaži/sakrij sve', async ({ page }) => {
  await page.goto('/');
  await seedLayers(page, [
    { id: 's1', naziv: 'Revir A', geojson: gj(2), stil: { vidljiv: true, boja: '#ff0000' }, izvor: 'fajl', uvezeno: Date.now() },
    { id: 's2', naziv: 'Revir B', geojson: gj(3), stil: { vidljiv: true, boja: '#00aa00' }, izvor: 'fajl', uvezeno: Date.now() },
  ]);
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await expect(page.locator('#sl-hero-broj')).toHaveText('2');
  await expect(page.locator('#sl-hero-prikazanih')).toHaveText('2');
  await expect(page.locator('#sl-hero-elemenata')).toHaveText('5');
  await page.locator('#btn-slojevi-sakrij-sve').click();
  await expect(page.locator('#sl-hero-prikazanih')).toHaveText('0');
  await page.locator('#btn-slojevi-prikazi-sve').click();
  await expect(page.locator('#sl-hero-prikazanih')).toHaveText('2');
});

test('Moja lokacija: niža ploča (manje od 60 % ekrana) i dugmad ≥ 44 px', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible();
  const ploca = await page.locator('#lok-ploca').boundingBox();
  expect(ploca.height).toBeLessThan(740 * 0.6);
  for (const b of await page.locator('#lok-akcije .lok-dugme').all()) {
    const bb = await b.boundingBox();
    expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(44);
  }
});

test('Istraživač: vrh je čist, a dugme "Izađi iz 3D" gasi mod', async ({ page }) => {
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#ekran-mapa')).toHaveClass(/istrazivac/);
  const izlaz = page.locator('#istrazivac-traka [data-izlaz]');
  await expect(izlaz).toBeVisible();
  expect((await izlaz.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await izlaz.click();
  await expect(page.locator('#ekran-mapa')).not.toHaveClass(/istrazivac/);
});
