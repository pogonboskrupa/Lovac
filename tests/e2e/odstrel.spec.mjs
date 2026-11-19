import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo' });

const allHarvest = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => {
    const q = r.result.transaction('odstrel').objectStore('odstrel').getAll();
    q.onsuccess = () => resolve(q.result);
  };
}));

async function seedLovostaj(page) {
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('spiskovi', 'readwrite');
      tx.objectStore('spiskovi').put({ id: 'lovostaj', rows: [
        { id: 'l1', vrsta_kod: 'srna', kategorija_kod: 'srndac', otvoreno_od: '05-01', otvoreno_do: '09-30', aktivno: true },
        { id: 'l2', vrsta_kod: 'zec', kategorija_kod: null, otvoreno_od: '10-01', otvoreno_do: '12-31', aktivno: true },
      ] });
      tx.objectStore('spiskovi').put({ id: 'lovno_vrijeme', rows: [{ id: 'v1', vrsta_kod: null, prije_izlaska_min: 60, poslije_zalaska_min: 60, aktivno: true }] });
      tx.oncomplete = resolve;
    };
  }));
}

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+01:00'));
  await page.goto('/');
  await seedLovostaj(page);
  await page.reload();
});

async function openForm(page) {
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-odstrel').click();
  await expect(page.locator('#odstrel-forma')).toBeVisible();
}

test('odstrel: vrsta, kategorija, težina sa zarezom, lovac; ne zamjenjuje dnevnik', async ({ page }) => {
  await openForm(page);
  await expect(page.locator('#odstrel-forma')).toContainText('ne zamjenjuje službeni lovački dnevnik');
  await page.locator('#ods-vrste [data-kod="zec"]').click();
  await page.fill('#forma-odstrel input[name=tezina]', '4,2');
  await page.fill('#forma-odstrel input[name=trofej]', 'dobar');
  await expect(page.locator('#forma-odstrel input[name=lovac]')).toHaveValue('');
  await page.fill('#forma-odstrel input[name=lovac]', 'Mujo Mujić');
  await expect(page.locator('#ods-upozorenja')).toBeHidden();
  await page.locator('#btn-ods-sacuvaj').click();
  await expect(page.locator('#odstrel-forma')).toBeHidden();
  const [o] = await allHarvest(page);
  expect(o).toMatchObject({ vrsta: 'zec', tezina: 4.2, trofej: 'dobar', lovac: 'Mujo Mujić', vidljivost: 'privatno', upozorenja: [] });
  await expect(page.locator('path.ods-tacka')).toHaveCount(1);
});

test('lovostaj i van lovnog vremena: upozorenje, čuvanje tek drugim dodirom', async ({ page }) => {
  await openForm(page);
  await page.locator('#ods-vrste [data-kod="srna"]').click();
  await page.locator('#ods-kategorija [data-kat="srndac"]').click();
  await expect(page.locator('#ods-upozorenja')).toContainText('lovostaju (otvara se 1.5.)');
  await page.fill('#forma-odstrel input[name=vrijeme]', '2026-11-19T22:30');
  await page.locator('#forma-odstrel input[name=vrijeme]').dispatchEvent('change');
  await expect(page.locator('#ods-upozorenja')).toContainText('van lovnog vremena');
  await page.locator('#btn-ods-sacuvaj').click();
  await expect(page.locator('#odstrel-forma')).toBeVisible();
  await expect(page.locator('#btn-ods-sacuvaj')).toHaveText('Sačuvaj uprkos upozorenju');
  expect(await allHarvest(page)).toHaveLength(0);
  await page.locator('#btn-ods-sacuvaj').click();
  await expect(page.locator('#odstrel-forma')).toBeHidden();
  const [o] = await allHarvest(page);
  expect(o.upozorenja).toHaveLength(2);
});

test('neispravna težina se odbija', async ({ page }) => {
  await openForm(page);
  await page.locator('#ods-vrste [data-kod="zec"]').click();
  await page.fill('#forma-odstrel input[name=tezina]', 'teško');
  await page.locator('#btn-ods-sacuvaj').click();
  await expect(page.locator('#ods-status')).toContainText('Težina');
  expect(await allHarvest(page)).toHaveLength(0);
});

test('spisak: zbir, izvoz CSV za Excel (BOM, ;, zarez) i PDF kroz AndroidPrint', async ({ page }) => {
  await page.addInitScript(() => {
    window.__shared = [];
    window.__printed = [];
    window.AndroidShare = { shareFile: (name, mime, content) => window.__shared.push({ name, mime, content }) };
    window.AndroidPrint = { printHtml: (html, job) => window.__printed.push({ html, job }) };
  });
  await page.reload();
  for (const kg of ['18,5', '20']) {
    await openForm(page);
    await page.locator('#ods-vrste [data-kod="zec"]').click();
    await page.fill('#forma-odstrel input[name=tezina]', kg);
    await page.locator('#btn-ods-sacuvaj').click();
    await expect(page.locator('#odstrel-forma')).toBeHidden();
  }
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  await expect(page.locator('#odstrel-spisak [data-id]')).toHaveCount(2);
  await expect(page.locator('#ods-zbir')).toContainText('Zec obični: 2 kom., 38,5 kg');

  await page.locator('#btn-ods-csv').click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  const csv = (await page.evaluate(() => window.__shared[0]));
  expect(csv.name).toMatch(/^odstrel-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(csv.content.charCodeAt(0)).toBe(0xfeff);
  expect(csv.content).toContain('Datum i vrijeme;Vrsta;Spol/dob;Težina (kg)');
  expect(csv.content).toContain(';18,5;');

  await page.locator('#btn-ods-pdf').click();
  await expect.poll(() => page.evaluate(() => window.__printed.length)).toBe(1);
  const pdf = await page.evaluate(() => window.__printed[0]);
  expect(pdf.html).toContain('Evidencija odstrela');
  expect(pdf.html).toContain('ne zamjenjuje službeni lovački dnevnik');
  expect(pdf.html).toContain('38,5 kg');
});

test('brisanje drugim dodirom; Nazad zatvara formu i spisak', async ({ page }) => {
  await openForm(page);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#odstrel-forma')).toBeHidden();
  await openForm(page);
  await page.locator('#ods-vrste [data-kod="zec"]').click();
  await page.locator('#btn-ods-sacuvaj').click();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  const del = page.locator('#odstrel-spisak [data-akcija="obrisi"]');
  await del.click();
  await expect(page.locator('#odstrel-spisak [data-id]')).toHaveCount(1);
  await del.click();
  await expect(page.locator('#odstrel-spisak [data-id]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#odstrel')).toBeHidden();
});
