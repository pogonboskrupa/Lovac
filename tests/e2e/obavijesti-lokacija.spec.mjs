import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Lovac', odobren: true, is_admin: false })));
});

const share = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('lovac.lokacija') || 'null'));

test('Moja lokacija: prekidač automatskog dijeljenja u lovu (zadano uključeno) gasi i pali dijeljenje', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  const sw = page.locator('#btn-lok-auto');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect((await sw.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#lok-auto-stanje')).toContainText('Isključeno');
  await expect.poll(async () => (await share(page))?.on).toBe(false);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await share(page))?.on).toBe(true);
});

test('ploča podloga i ploča "+" se zatvaraju dodirom na kartu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await page.locator('#btn-podloga').click();
  await expect(page.locator('#meni-podloga')).toBeVisible();
  await page.mouse.click(60, 500);
  await expect(page.locator('#meni-podloga')).toBeHidden();
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#meni-dodaj')).toBeVisible();
  await page.mouse.click(60, 500);
  await expect(page.locator('#meni-dodaj')).toBeHidden();
});

async function openPodaci(page) {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="podaci"]').click();
}

test('Postavke: bez aplikacije kartica samo kaže da se podešava na telefonu', async ({ page }) => {
  await openPodaci(page);
  await expect(page.locator('#pouzdanost-lista [data-id="aplikacija"]')).toContainText('u aplikaciji na telefonu');
  await expect(page.locator('#btn-dozvoli-obavijesti')).toBeHidden();
  await expect(page.locator('#btn-postavke-obavijesti')).toBeHidden();
  await expect(page.locator('#btn-iskljuci-bateriju')).toBeHidden();
});

test('Postavke u aplikaciji: upozorenje za isključene obavijesti i uključenu optimizaciju baterije, dugmad zovu most', async ({ page }) => {
  await page.addInitScript(() => {
    window.__poziv = [];
    window.__notif = false;
    window.__bat = false;
    window.AndroidNotif = { imaDozvolu: () => window.__notif, trazi: () => window.__poziv.push('trazi'), postavke: () => window.__poziv.push('postavke'), prikazi: () => {}, vibriraj: () => {} };
    window.AndroidGps = { isIgnoringBattery: () => window.__bat, requestBatteryExemption: () => window.__poziv.push('baterija'), openBatterySettings: () => window.__poziv.push('baterija-postavke'), start: () => 'ok', stop: () => {}, isRunning: () => false, read: () => '', clear: () => {} };
  });
  await openPodaci(page);
  await expect(page.locator('#p-pouzdanost')).toHaveAttribute('data-stanje', 'upozorenje');
  await expect(page.locator('#pouzdanost-lista [data-id="obavijesti"]')).toHaveAttribute('data-stanje', 'upozorenje');
  await expect(page.locator('#pouzdanost-lista [data-id="baterija"]')).toContainText('prekinuti snimanje traga');
  for (const id of ['#btn-dozvoli-obavijesti', '#btn-postavke-obavijesti', '#btn-iskljuci-bateriju']) {
    await expect(page.locator(id)).toBeVisible();
    expect((await page.locator(id).boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#btn-dozvoli-obavijesti').click();
  await page.locator('#btn-postavke-obavijesti').click();
  await page.locator('#btn-iskljuci-bateriju').click();
  expect(await page.evaluate(() => window.__poziv)).toEqual(['trazi', 'postavke', 'baterija-postavke']);

  // korisnik je dozvolio i vratio se u aplikaciju: stanje se osvježi, upozorenja nestaju
  await page.evaluate(() => { window.__notif = true; window.__bat = true; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#p-pouzdanost')).toHaveAttribute('data-stanje', 'ok');
  await expect(page.locator('#btn-dozvoli-obavijesti')).toBeHidden();
  // dugmad za sistemske postavke ostaju: lovac može promijeniti i kad je sve uključeno
  await expect(page.locator('#btn-postavke-obavijesti')).toBeVisible();
  await expect(page.locator('#btn-iskljuci-bateriju')).toBeVisible();
  await page.locator('#btn-iskljuci-bateriju').click();
  expect((await page.evaluate(() => window.__poziv)).pop()).toBe('baterija-postavke');
});

test('značka nepročitanih poruka je crvena puna kružnica sa brojem', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { const b = document.getElementById('nav-sekcija-znacka'); b.parentElement.hidden = false; b.hidden = false; b.textContent = '3'; });
  const stil = await page.locator('#nav-sekcija-znacka').evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundColor, color: s.color, w: s.minWidth, h: s.height, r: s.borderRadius }; });
  expect(stil.bg).toBe('rgb(228, 30, 63)');
  expect(stil.color).toBe('rgb(255, 255, 255)');
  expect(stil.w).toBe('22px');
  expect(stil.h).toBe('22px');
  expect(parseFloat(stil.r)).toBeGreaterThanOrEqual(10);
});

test.describe('prekidač Moja lokacija i marker na karti', () => {
  test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });
  test('isključen prekidač sakriva marker pozicije, uključen ga vraća', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#karta .gps-nisan')).toHaveCount(1);
    await page.locator('#btn-moja-lokacija').click();
    // dijeljenje je poseban prekidač: njegovo gašenje NE sakriva marker
    await page.locator('#btn-lok-auto').click();
    await expect(page.locator('#btn-lok-auto')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#karta .gps-nisan')).toHaveCount(1);
    await page.locator('#btn-lok-prikaz').click();
    await expect(page.locator('#btn-lok-prikaz')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#karta .gps-nisan')).toHaveCount(0);
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.lokacija') || 'null')))?.on).toBe(false);
    await page.locator('#btn-lok-prikaz').click();
    await expect(page.locator('#karta .gps-nisan')).toHaveCount(1);
  });
});
