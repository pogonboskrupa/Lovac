import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok, PNG } from './helpers.mjs';

const allObs = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => {
    const req = r.result.transaction('opazanja').objectStore('opazanja').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  };
}));

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

async function quickObs(page, { vrsta, plus = 0, kat } = {}) {
  await lok(page, '#btn-opazanje');
  await expect(page.locator('#opazanje-forma')).toBeVisible();
  if (vrsta) await page.locator(`#op-vrste [data-kod="${vrsta}"]`).click();
  for (let i = 0; i < plus; i++) await page.locator('#op-broj-plus').click();
  if (kat) await page.locator(`#op-kategorija [data-kat="${kat}"]`).click();
  await page.locator('#forma-opazanje button[type=submit]').click();
  await expect(page.locator('#opazanje-forma')).toBeHidden();
}

test('opažanje na GPS poziciji: vrijeme samo, broj, spol/dob, privatno', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.9012, longitude: 16.1234, accuracy: 6 });
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveText('±6 m');
  const t0 = Date.now();
  await lok(page, '#btn-opazanje');
  await expect(page.locator('#op-pozicija')).toHaveText('Pozicija: GPS ±6 m');
  await page.locator('#op-vrste [data-kod="srna"]').click();
  await page.locator('#op-broj-plus').click();
  await page.locator('#op-broj-plus').click();
  await page.locator('#op-kategorija [data-kat="srndac"]').click();
  await page.fill('#forma-opazanje textarea[name=napomena]', 'Na rubu šume');
  await page.locator('#forma-opazanje button[type=submit]').click();
  const [o] = await allObs(page);
  expect(o).toMatchObject({ vrsta: 'srna', broj: 3, kategorija: 'srndac', lat: 44.9012, lon: 16.1234, vidljivost: 'privatno', napomena: 'Na rubu šume' });
  expect(o.vrijeme).toBeGreaterThanOrEqual(t0 - 1000);
  await expect(page.locator('.op-znak')).toHaveCount(1);
  // oznaka: emblem vrste (znak iz Divljači), broj grla u uglu, tek upisano pulsira, meta za prst 44 px
  const znak = page.locator('.op-znak');
  await expect(znak.locator('.op-broj')).toHaveText('3');
  await expect(znak).toHaveAttribute('data-starost', 'danas');
  await expect(znak).toHaveClass(/op-novo/);
  expect((await page.locator('.op-ikona').boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('"jednim dodirom": zadnja vrsta je unaprijed izabrana', async ({ page }) => {
  await page.goto('/');
  await quickObs(page, { vrsta: 'divlja_svinja' });
  await lok(page, '#btn-opazanje');
  await expect(page.locator('#op-vrste [data-kod="divlja_svinja"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#forma-opazanje button[type=submit]').click();
  const list = await allObs(page);
  expect(list.map((o) => o.vrsta)).toEqual(['divlja_svinja', 'divlja_svinja']);
});

test('bez GPS-a se koristi odabir na karti i to se jasno kaže', async ({ page }) => {
  await page.goto('/');
  await lok(page, '#btn-opazanje');
  await expect(page.locator('#op-pozicija')).toContainText('nema GPS-a');
});

test('pregled: filter po vrsti i periodu, zbir grla, gustina umjesto tačaka', async ({ page }) => {
  await page.goto('/');
  await quickObs(page, { vrsta: 'srna', plus: 1 });
  await quickObs(page, { vrsta: 'zec' });
  // Staro opažanje (prije 2 godine) direktno u bazu.
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('opazanja', 'readwrite');
      tx.objectStore('opazanja').put({ id: 'staro', vrsta: 'srna', broj: 4, kategorija: 'nepoznato', vrijeme: Date.now() - 730 * 86400000, lat: 44.88, lon: 16.15, vidljivost: 'privatno' });
      tx.oncomplete = resolve;
    };
  }));
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-opazanja').click();
  await page.locator('#op-period [data-period="30"]').click();
  await expect(page.locator('#opazanja-spisak [data-id]')).toHaveCount(2);
  await page.locator('#op-filter-vrsta').selectOption('srna');
  await expect(page.locator('#opazanja-spisak [data-id]')).toHaveCount(1);
  await expect(page.locator('#op-zbir')).toContainText('2 grla u 1 opažanju');
  await page.locator('#op-period [data-period="sve"]').click();
  await expect(page.locator('#opazanja-spisak [data-id]')).toHaveCount(2);
  await expect(page.locator('#op-zbir')).toContainText('6 grla u 2 opažanja');

  await page.locator('#op-prikaz [data-prikaz="gustina"]').click();
  await expect(page.locator('path.op-gustina').first()).toBeAttached();
  await expect(page.locator('.op-znak')).toHaveCount(0);
  await page.locator('#op-na-karti').click();
  await expect(page.locator('path.op-gustina')).toHaveCount(0);
});

test('brisanje opažanja drugim dodirom; Nazad zatvara pregled', async ({ page }) => {
  await page.goto('/');
  await quickObs(page, { vrsta: 'lisica' });
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-opazanja').click();
  await page.locator('#op-period [data-period="sve"]').click();
  await page.locator('#op-filter-vrsta').selectOption('');
  const del = page.locator('#opazanja-spisak [data-akcija="obrisi"]');
  await del.click();
  await expect(page.locator('#opazanja-spisak [data-id]')).toHaveCount(1);
  await del.click();
  await expect(page.locator('#opazanja-spisak [data-id]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#opazanja')).toBeHidden();
});

test('dodirne mete opažanja ≥ 44 px', async ({ page }) => {
  await page.goto('/');
  await lok(page, '#btn-opazanje');
  for (const sel of ['#op-vrste [data-kod]', '#op-kategorija [data-kat]', '#op-broj-plus', '#op-broj-minus']) {
    const b = await page.locator(sel).first().boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
  const inp = await page.locator('#forma-opazanje input[name=broj]').boundingBox();
  expect(inp.height).toBeGreaterThanOrEqual(48);
});

test('opažanje na karti: kartica pokazuje ko je vidio i može se obrisati (drugi dodir)', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.9012, longitude: 16.1234, accuracy: 6 });
  await page.addInitScript(() => localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Lovac', odobren: true, is_admin: false })));
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveText('±6 m');
  await quickObs(page, { vrsta: 'srna', plus: 1 });
  await expect(page.locator('.op-znak')).toHaveCount(1);
  await page.locator('.op-znak').dispatchEvent('click');
  const kartica = page.locator('.leaflet-popup .op-popup');
  await expect(kartica).toBeVisible();
  await expect(kartica).toContainText('Vidio: ti (Goran Lovac)');
  const del = kartica.locator('[data-akcija="obrisi"]');
  expect((await del.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await del.click();
  expect((await allObs(page)).length).toBe(1);
  await del.click();
  await expect.poll(async () => (await allObs(page)).length).toBe(0);
  await expect(page.locator('.op-znak')).toHaveCount(0);
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
});

test('opažanje sa slikom: na karti je sličica, kartica pokazuje sliku; vidi se samo do razmjere iz Postavki', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.88, longitude: 16.15, accuracy: 6 });
  await page.addInitScript(() => { if (!localStorage.getItem('lovac.pogled')) localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 15 })); });
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveText('±6 m');
  await lok(page, '#btn-opazanje');
  await page.locator('#op-vrste [data-kod="srna"]').click();
  await page.locator('#op-foto-input').setInputFiles({ name: 'srna.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(async () => (await page.locator('#forma-opazanje img').count())).toBeGreaterThan(0);
  await page.locator('#forma-opazanje button[type=submit]').click();
  await expect(page.locator('#opazanje-forma')).toBeHidden();

  // zoom 15 ≈ 1:12 500: sličica umjesto tačke
  const slika = page.locator('.op-slika .slika-marker img');
  await expect(slika).toHaveCount(1);
  await expect(page.locator('.op-znak')).toHaveCount(0);
  // dodir na sličicu: velika slika preko ekrana, crveni X, cijeli ekran; "Detalji" otvara karticu
  await page.locator('.op-slika').click();
  const pregled = page.locator('#slika-velika');
  await expect(pregled).toBeVisible();
  await expect(page.locator('#slika-velika-opis')).toContainText('Vidio: ti');
  await expect.poll(() => page.locator('#slika-velika-img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(await page.locator('#btn-slika-velika-zatvori').evaluate((b) => getComputedStyle(b).backgroundColor)).toBe('rgb(220, 38, 38)');
  await page.locator('#btn-slika-pun').click();
  await expect(pregled).toHaveClass(/pun/);
  const box = await page.locator('#slika-velika-img').boundingBox();
  const vp = page.viewportSize();
  expect(Math.round(box.width)).toBe(vp.width);
  await page.locator('#btn-slika-pun').click();
  await expect(pregled).not.toHaveClass(/pun/);
  await page.locator('#slika-velika-akcije button', { hasText: 'Detalji' }).click();
  await expect(pregled).toBeHidden();
  await expect(page.locator('.leaflet-popup .op-popup-foto img')).toHaveCount(1);
  expect(await page.locator('.leaflet-popup .op-popup-foto img').evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
  // i slika u kartici se otvara velika; crveni X zatvara
  await page.locator('.leaflet-popup .op-popup-foto img').click();
  await expect(pregled).toBeVisible();
  await page.locator('#btn-slika-velika-zatvori').click();
  await expect(pregled).toBeHidden();

  // zoom 13 (~1:51 000): ne crta se
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 13 })));
  await page.reload();
  await expect(page.locator('.op-slika')).toHaveCount(0);

  // Postavke → Prikaz na karti: "Uvijek"
  await page.locator('#btn-postavke').click();
  await page.locator('#p-razmjer [data-razmjer="0"]').click();
  await expect(page.locator('#p-razmjer [data-razmjer="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.op-slika')).toHaveCount(1);
  // isključeno ograničenje za tačke uz razmjer 1:12 500 također prikazuje
  await page.locator('#p-razmjer [data-razmjer="12500"]').click();
  await expect(page.locator('.op-slika')).toHaveCount(0);
  await page.locator('#p-razmjer-vrste [data-vrsta-prikaza="tacke"]').click();
  await expect(page.locator('.op-slika')).toHaveCount(1);
});
