import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok } from './helpers.mjs';

const tracks = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => {
    const q = r.result.transaction('tragovi').objectStore('tragovi').getAll();
    q.onsuccess = () => resolve(q.result);
  };
}));

test.beforeEach(async ({ page, context }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.88, longitude: 16.15, accuracy: 4 });
});

async function startSearch(page) {
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveText('±4 m');
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-potragu').click();
  await expect(page.locator('#potraga-start')).toBeVisible();
  await page.locator('#btn-nastrijel-gps').click();
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  await expect(page.locator('#potraga-dugmad')).toBeVisible();
}

test('potraga: nastrijel na GPS poziciji, krv dodirom, oznake na karti i u tragu', async ({ page, context }) => {
  await startSearch(page);
  await expect(page.locator('#snim-vrsta')).toHaveText('Potraga · ');
  await expect(page.locator('.oznaka-nastrijel')).toHaveCount(1);
  await context.setGeolocation({ latitude: 44.8805, longitude: 16.1505, accuracy: 4 });
  await page.waitForTimeout(300);
  await page.locator('#btn-krv').click();
  await expect(page.locator('#potraga-info')).toContainText('znakova 1');
  await expect(page.locator('.oznaka-krv')).toHaveCount(1);
  const [tr] = await tracks(page);
  expect(tr.vrsta).toBe('potraga');
  expect(tr.nastrijel).toMatchObject({ lat: 44.88, lon: 16.15 });
  expect(tr.krv[0]).toMatchObject({ lat: 44.8805, lon: 16.1505 });
});

test('Vodi me nazad nudi tačku nastrijela i najbližu čeku, pa pokreće navigaciju', async ({ page }) => {
  await page.goto('/');
  // Čeka na sredini karte.
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await page.locator('#objekt-vrste [data-kod="ceka_visoka"]').click();
  await page.fill('#forma-objekt input[name=naziv]', 'Moja čeka');
  await page.locator('#forma-objekt button[type=submit]').click();
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-potragu').click();
  await page.locator('#btn-nastrijel-gps').click();
  await page.locator('#btn-vodi-nazad').click();
  const opts = page.locator('#nazad-spisak [data-i]');
  await expect(opts.first()).toHaveText('Tačka nastrijela');
  await expect(page.locator('#nazad-spisak')).toContainText('Moja čeka');
  await page.locator('#nazad-spisak [data-i]', { hasText: 'Moja čeka' }).click();
  await expect(page.locator('#navigacija')).toBeVisible();
  await expect(page.locator('#nav-cilj')).toHaveText('Moja čeka');
});

test('potraga teče paralelno sa obilaskom; panel pokazuje potragu, a obilazak ostaje', async ({ page }) => {
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-potragu').click();
  await page.locator('#btn-nastrijel-nisan').click();
  await expect(page.locator('#snim-vrsta')).toHaveText('Potraga · ');
  // potraga se završava izborom ishoda
  await page.locator('#btn-snim-stop').click();
  await expect(page.locator('#potraga-kraj')).toBeVisible();
  await page.locator('#potraga-ishod [data-ishod="prekinuta"]').click();
  await expect(page.locator('#snim-vrsta')).toHaveText('');
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  const list = await tracks(page);
  expect(list.find((t) => t.vrsta === 'potraga').status).toBe('gotovo');
  expect(list.find((t) => t.vrsta === 'obilazak').status).toBe('snima');
});

test('GPX potrage sadrži nastrijel i krv kao tačke', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__shared = [];
    window.AndroidShare = { shareFile: (name, mime, content) => window.__shared.push({ name, content }) };
  });
  await startSearch(page);
  await page.locator('#btn-krv').click();
  await page.locator('#btn-potraga-znak').click();
  await page.locator('#potraga-znak-izbor [data-tip="dlaka"]').click();
  await page.locator('#btn-snim-stop').click();
  await page.locator('#potraga-ishod [data-ishod="nije_pronadjena"]').click();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-tragovi').click();
  await page.locator('#tragovi-spisak [data-akcija="gpx"]').click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  const gpx = (await page.evaluate(() => window.__shared[0])).content;
  expect(gpx).toContain('<name>Nastrijel</name>');
  expect(gpx).toContain('<name>Krv</name>');
  expect(gpx).toContain('<name>Dlaka</name>');
});

test('potraga: divljač, vrijeme pucnja i znakovi na nastrijelu, savjet, znakovi na tragu po vrsti, kraj sa ishodom', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveText('±4 m');
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-potragu').click();
  await expect(page.locator('#potraga-start')).toBeVisible();
  await expect(page.locator('#potraga-vrsta option')).not.toHaveCount(1);
  await page.locator('#potraga-vrsta').selectOption('divlja_svinja');
  await page.locator('#potraga-prije [data-prije="30"]').click();
  await expect(page.locator('#potraga-savjet')).toBeHidden();
  await page.locator('#potraga-znakovi [data-znak="krv_tamna"]').click();
  await expect(page.locator('#potraga-savjet')).toContainText('vodičem psa krvara');
  await page.locator('#potraga-znakovi [data-znak="dlaka"]').click();
  await page.locator('#btn-nastrijel-gps').click();
  await expect(page.locator('#potraga-info')).toContainText('Divlja svinja');
  await expect(page.locator('#potraga-info')).toContainText('od pucnja 30 min');

  await context.setGeolocation({ latitude: 44.8810, longitude: 16.1505, accuracy: 4 });
  await page.waitForTimeout(300);
  await page.locator('#btn-krv').click();
  await page.locator('#btn-potraga-znak').click();
  await page.locator('#potraga-znak-izbor [data-tip="lezaj"]').click();
  await expect(page.locator('#potraga-info')).toContainText('znakova 2');
  await expect(page.locator('#potraga-info')).toContainText('nastrijel 1');
  await expect(page.locator('.oznaka-znak-lezaj')).toHaveCount(1);

  await page.locator('#btn-snim-stop').click();
  await page.locator('#potraga-ishod [data-ishod="pronadjena"]').click();
  await expect(page.locator('#panel-snimanje')).toBeHidden();
  const [tr] = await tracks(page);
  expect(tr.status).toBe('gotovo');
  expect(tr.ishod).toBe('pronadjena');
  expect(tr.nastrijel).toMatchObject({ vrsta: 'divlja_svinja', prije_min: 30, znakovi: ['krv_tamna', 'dlaka'] });
  expect(tr.krv.map((k) => k.tip)).toEqual(['krv', 'lezaj']);
  expect(tr.naziv).toContain('Divlja svinja');

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-tragovi').click();
  await expect(page.locator('#tragovi-spisak .tr-ishod')).toHaveText('Divljač pronađena');
});

test('Moja lokacija: drugi red koordinata (MGI 5), dodir na red prekidača ga mijenja', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#gps-tacnost')).toHaveText('±4 m');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-oznaka')).toHaveText('WGS84');
  await expect(page.locator('#lok-oznaka2')).toHaveText('MGI 5');
  await expect(page.locator('#lok-koord2')).toContainText('Y 5');
  await expect(page.locator('#btn-lok-prikaz')).toHaveAttribute('aria-checked', 'true');
  await page.locator('#lok-prikaz .lok-pravac-tekst b').click();
  await expect(page.locator('#btn-lok-prikaz')).toHaveAttribute('aria-checked', 'false');
  for (const b of await page.locator('#lok-ploca .lok-prekidac').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
});
