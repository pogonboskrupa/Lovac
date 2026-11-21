import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG } from './helpers.mjs';

test('offline karta: prikaz preko native handlera, bez zahtjeva ispod najnižeg nivoa u fajlu', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  const requested = [];
  await page.route(/appassets\.androidplatform\.net\/mbtiles\//, (r) => {
    requested.push(r.request().url());
    return r.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png' } });
  });
  await page.addInitScript(() => {
    window.__karte = [{ id: 'grmec.mbtiles', naziv: 'Grmeč offline', format: 'mbtiles', minzoom: 13, maxzoom: 15, velicina: 52428800, bounds: '16.0,44.8,16.3,45.0' }];
    window.AndroidKarte = {
      spisak: () => JSON.stringify(window.__karte),
      uvezi: () => { window.__uvezi = true; },
      ukloni: (id) => { window.__karte = window.__karte.filter((k) => k.id !== id); return true; },
    };
    localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 11 }));
  });
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#karte-spisak [data-id]')).toHaveCount(1);
  await expect(page.locator('#karte-spisak')).toContainText('zoom 13–15 · 50 MB');
  await page.locator('#karte-spisak input[data-akcija="prikazi"]').check();
  await page.waitForTimeout(500);
  expect(requested, 'na zoomu 11 (ispod 13) ne smije biti zahtjeva').toHaveLength(0);

  await page.locator('#karte-spisak [data-akcija="pogled"]').click();
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested.every((u) => /\/mbtiles\/grmec\.mbtiles\/1[3-5]\/\d+\/\d+$/.test(u))).toBe(true);

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await page.locator('#btn-karte-uvoz').click();
  expect(await page.evaluate(() => window.__uvezi)).toBe(true);
  await page.evaluate(() => window.__karteNapredak('42'));
  await expect(page.locator('#karte-status')).toHaveText('Kopiram kartu na telefon… 42 %');
  await page.locator('#karte-spisak [data-akcija="ukloni"]').click();
  await page.locator('#karte-spisak [data-akcija="ukloni"]').click();
  await expect(page.locator('#karte-spisak [data-id]')).toHaveCount(0);
});

test('u browseru (bez APK-a) uvoz offline karte jasno kaže da radi samo u aplikaciji', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await expect(page.locator('#karte-podrska')).toContainText('radi u aplikaciji na telefonu');
  await expect(page.locator('#btn-karte-uvoz')).toBeHidden();
});
