import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo' });

const seed = (page, store, rows) => page.evaluate(([s, r]) => new Promise((resolve) => {
  const req = indexedDB.open('lovac');
  req.onsuccess = () => {
    const tx = req.result.transaction(s, 'readwrite');
    r.forEach((x) => tx.objectStore(s).put(x));
    tx.oncomplete = resolve;
  };
}), [store, rows]);

const ms = (y, m, d) => new Date(y, m, d, 9).getTime();
const rec = (id, o) => ({ id, vidljivost: 'privatno', rev: 1, sinhronizovano: true, lat: 44.88, lon: 16.15, kategorija: 'nepoznato', ...o });

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+01:00'));
  await page.goto('/');
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('spiskovi', 'readwrite');
      tx.objectStore('spiskovi').put({ id: 'lovostaj', rows: [{ id: 'l1', vrsta_kod: 'srna', kategorija_kod: null, otvoreno_od: '05-01', otvoreno_do: '09-30', aktivno: true }] });
      tx.objectStore('spiskovi').put({ id: 'sekcije', rows: { reviri: [{ id: 'R1', naziv: 'Krupa' }], sekcije: [{ id: 'S1', naziv: 'Krupa 1', revir_id: 'R1' }], clanovi: [], grupovodje: [], lovocuvari: [] } });
      tx.oncomplete = resolve;
    };
  }));
  await seed(page, 'odstrel', [
    rec('a', { vrsta: 'divlja_svinja', vrijeme: ms(2026, 0, 10), tezina: 90, lovac: 'Šaban Čović', revir_id: 'R1', sekcija_id: 'S1' }),
    rec('b', { vrsta: 'divlja_svinja', vrijeme: ms(2026, 0, 20), tezina: 70, lovac: 'Mujo', napomena: 'noćni lov' }),
    rec('c', { vrsta: 'zec', vrijeme: ms(2026, 2, 5), tezina: 4, lovac: 'Mujo' }),
    rec('d', { vrsta: 'zec', vrijeme: ms(2025, 2, 5), tezina: 3, lovac: 'Mujo' }),
  ]);
  await page.reload();
});

test('odstrel: pretraga bez obzira na dijakritike i velika slova', async ({ page }) => {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  await expect(page.locator('#odstrel-spisak li')).toHaveCount(3);
  await page.fill('#ods-trazi', 'SABAN covic');
  await expect(page.locator('#odstrel-spisak li')).toHaveCount(1);
  await page.fill('#ods-trazi', 'nocni');
  await expect(page.locator('#odstrel-spisak li')).toHaveCount(1);
  await page.fill('#ods-trazi', 'nema ovoga');
  await expect(page.locator('#odstrel-spisak li')).toHaveCount(0);
});

test('statistika odstrela: godina, vrsta, revir, sekcija i mjeseci', async ({ page }) => {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  await page.locator('#btn-ods-stat').click();
  await expect(page.locator('#odstrel-stat')).toBeVisible();
  await expect(page.locator('#ods-stat-godina')).toHaveValue('2026');
  await expect(page.locator('#ods-stat-ukupno')).toContainText('Ukupno 3 kom., 164 kg');
  await expect(page.locator('#ods-stat-mjeseci li').first().locator('b')).toHaveText('2');
  await expect(page.locator('#ods-stat-vrste li').first()).toContainText('2');
  await expect(page.locator('#ods-stat-vrste li').first()).toContainText('prosjek 80 kg');
  await expect(page.locator('#ods-stat-reviri')).toContainText('Krupa: 1 kom.');
  await expect(page.locator('#ods-stat-reviri')).toContainText('Izvan lova / nije navedeno: 2 kom.');
  await page.locator('#ods-stat-sekcija').selectOption('S1');
  await expect(page.locator('#ods-stat-ukupno')).toContainText('Ukupno 1 kom., 90 kg');
  await page.locator('#ods-stat-sekcija').selectOption('');
  await page.locator('#ods-stat-godina').selectOption('2025');
  await expect(page.locator('#ods-stat-ukupno')).toContainText('Ukupno 1 kom., 3 kg');
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#odstrel-stat')).toBeHidden();
});

test('lovostaj: vrsta je označena odmah, a upozorenje je alarm', async ({ page }) => {
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-odstrel').click();
  // 19.11. srna je u lovostaju (otvoreno 01.05.–30.09.)
  await expect(page.locator('#ods-vrste [data-kod="srna"]')).toContainText('(lovostaj)');
  await expect(page.locator('#ods-vrste [data-kod="srna"]')).toHaveAttribute('data-lovostaj', 'true');
  await expect(page.locator('#ods-vrste [data-kod="zec"]')).not.toHaveAttribute('data-lovostaj', 'true');
  await page.locator('#ods-vrste [data-kod="srna"]').click();
  await expect(page.locator('#ods-upozorenja')).toBeVisible();
  await expect(page.locator('#ods-upozorenja')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#ods-upozorenja')).toContainText('lovostaju');
});

test('pretraga u objektima i opažanjima', async ({ page }) => {
  await seed(page, 'objekti', [
    rec('o1', { naziv: 'Čeka Potok', vrsta: 'cekalo', stanje: 'dobro', zadnji_obilazak: '2026-11-01' }),
    rec('o2', { naziv: 'Hranilište Vrh', vrsta: 'hraniliste', stanje: 'dobro', zadnji_obilazak: '2026-11-01' }),
  ]);
  await seed(page, 'opazanja', [
    rec('p1', { vrsta: 'jelen', broj: 2, vrijeme: ms(2026, 10, 10), napomena: 'na proplanku' }),
    rec('p2', { vrsta: 'zec', broj: 1, vrijeme: ms(2026, 10, 11), napomena: 'uz put' }),
  ]);
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-objekti').click();
  await expect(page.locator('#objekti-spisak li')).toHaveCount(2);
  await page.fill('#objekti-trazi', 'ceka');
  await expect(page.locator('#objekti-spisak li')).toHaveCount(1);
  await expect(page.locator('#objekti-spisak')).toContainText('Čeka Potok');
  await page.locator('#btn-objekti-zatvori').click();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-opazanja').click();
  await page.locator('#op-period [data-period="sve"]').click();
  await expect(page.locator('#opazanja-spisak li')).toHaveCount(2);
  await page.fill('#op-trazi', 'PROPLANKU');
  await expect(page.locator('#opazanja-spisak li')).toHaveCount(1);
});
