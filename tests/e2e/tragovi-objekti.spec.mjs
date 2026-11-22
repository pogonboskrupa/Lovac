import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo', viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });
test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

const seed = (page, store, rows) => page.evaluate(([s, r]) => new Promise((resolve) => {
  const q = indexedDB.open('lovac');
  q.onsuccess = () => { const tx = q.result.transaction(s, 'readwrite'); r.forEach((x) => tx.objectStore(s).put(x)); tx.oncomplete = resolve; };
}), [store, rows]);

const DAY = 86400000;
const track = (id, naziv, daysAgo, n, vrsta = 'obilazak') => {
  const start = Date.now() - daysAgo * DAY;
  return { id, naziv, status: 'gotovo', vrsta, start, kraj: start + 3600000, vidljivost: 'privatno', pauze: [],
    tacke: Array.from({ length: n }, (_, i) => ({ lat: 44.88 + i * 0.0006, lon: 16.15 + (i % 3) * 0.0004, t: start + i * 30000, acc: 5 })) };
};

test('Moji tragovi: sličica rute, brojke po tragu, mjeseci, period i redoslijed, stupci zadnjih 7 dana', async ({ page }) => {
  await page.goto('/');
  await seed(page, 'tragovi', [track('a', 'Jutarnji obilazak', 1, 40), track('b', 'Duga tura', 3, 90), track('c', 'Stari trag', 400, 30), track('d', 'Potraga', 0.2, 25, 'potraga')]);
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-tragovi').click();
  const cards = page.locator('#tragovi-spisak .tr-kartica');
  await expect(cards).toHaveCount(4);
  // sličica rute i brojke
  await expect(page.locator('#tragovi-spisak [data-id="b"] .tr-mini path')).toHaveCount(1);
  await expect(page.locator('#tragovi-spisak [data-id="b"] [data-brojka="tacaka"]')).toContainText('90');
  await expect(page.locator('#tragovi-spisak [data-id="b"] [data-brojka="brzina"]')).toContainText('km/h');
  // naslovi mjeseci (nisu kartice)
  expect(await page.locator('#tragovi-spisak .tr-mjesec').count()).toBeGreaterThanOrEqual(1);
  // stupci zadnjih 7 dana: 7 stupaca, jučer i prije 3 dana imaju km
  await expect(page.locator('#tr-sedmica .tr-stupac')).toHaveCount(7);
  const kms = await page.locator('#tr-sedmica .tr-stupac').evaluateAll((els) => els.map((e) => Number(e.dataset.km)));
  expect(kms[5]).toBeGreaterThan(0);
  expect(kms[3]).toBeGreaterThan(0);
  // period: 7 dana izbacuje stari trag
  await page.locator('#tr-period').selectOption('sedmica');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('#tragovi-spisak [data-id="c"]')).toHaveCount(0);
  // redoslijed: najduže prvo, bez naslova mjeseci
  await page.locator('#tr-sort').selectOption('duze');
  await expect(cards.first()).toHaveAttribute('data-id', 'b');
  await expect(page.locator('#tragovi-spisak .tr-mjesec')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const objekat = (id, naziv, o = {}) => ({ id, naziv, vrsta: 'ceka_visoka', stanje: 'ispravno', lat: 44.88, lon: 16.15, vidljivost: 'privatno', rev: 1, sinhronizovano: true,
  fotografije: [], zadnji_obilazak: ymd(new Date()), ...o });

test('Objekti: dugo bez obilaska, filter po vrsti, redoslijed i brze akcije (Obiđen danas, Vodi me)', async ({ page }) => {
  await page.goto('/');
  const old = ymd(new Date(Date.now() - 60 * DAY));
  await seed(page, 'objekti', [
    objekat('o1', 'Čeka Potok'),
    objekat('o2', 'Čeka Vrh', { zadnji_obilazak: old, stanje: 'popravka' }),
    objekat('o3', 'Hranilište Livada', { vrsta: 'hraniliste', zadnji_obilazak: null, lat: 44.9 }),
  ]);
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-objekti').click();
  await expect(page.locator('#obj-stat-ukupno')).toHaveText('3');
  await expect(page.locator('#obj-stat-kasni')).toHaveText('2');
  const cards = page.locator('#objekti-spisak .obj-red');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('#objekti-spisak [data-id="o1"]')).toHaveAttribute('data-kasni', 'false');
  await expect(page.locator('#objekti-spisak [data-id="o2"] [data-kasni="true"]')).toHaveText('Dugo bez obilaska');
  await expect(page.locator('#objekti-spisak [data-id="o3"] [data-kasni="true"]')).toHaveText('Nije obilažen');
  await expect(page.locator('#objekti-spisak [data-id="o1"]')).toContainText('obiđen danas');
  // filter "dugo bez obilaska"
  await page.locator('#objekti-filter [data-filter="kasni"]').click();
  await expect(cards).toHaveCount(2);
  await page.locator('#objekti-filter [data-filter="svi"]').click();
  // filter po vrsti (samo kad ima više vrsta)
  await expect(page.locator('#objekti-vrste')).toBeVisible();
  await page.locator('#objekti-vrste [data-vrsta-filter="hraniliste"]').click();
  await expect(cards).toHaveCount(1);
  await page.locator('#objekti-vrste [data-vrsta-filter=""]').click();
  // redoslijed: najdavnije obiđeni (nije obilažen prvi)
  await page.locator('#objekti-sort').selectOption('obilazak');
  await expect(cards.first()).toHaveAttribute('data-id', 'o3');
  await page.locator('#objekti-sort').selectOption('naziv');
  await expect(cards.first()).toHaveAttribute('data-id', 'o1');
  // brza akcija: Obiđen danas upisuje obilazak i makne "dugo bez obilaska"
  await page.locator('#objekti-spisak [data-id="o2"] [data-akcija="obidjeno"]').click();
  await expect(page.locator('#objekti-spisak [data-id="o2"]')).toHaveAttribute('data-kasni', 'false');
  await expect(page.locator('#obj-stat-kasni')).toHaveText('1');
  // Vodi me zatvara spisak i pokreće navigaciju
  await page.locator('#objekti-spisak [data-id="o1"] [data-akcija="vodi"]').click();
  await expect(page.locator('#objekti')).toBeHidden();
  await expect(page.locator('#navigacija')).toBeVisible();
  // dodirne mete akcija
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
