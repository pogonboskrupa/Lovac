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
const base = { vidljivost: 'privatno', rev: 1, sinhronizovano: true, lat: 44.88, lon: 16.15, fotografije: [] };
const ods = (id, vrsta, tezina, daysAgo, extra = {}) => ({ ...base, id, vrsta, kategorija: 'nepoznato', tezina, vrijeme: Date.now() - daysAgo * DAY, lovac: 'Lovro', ...extra });
const opa = (id, vrsta, broj, daysAgo, hour, extra = {}) => {
  const d = new Date(Date.now() - daysAgo * DAY); d.setHours(hour, 0, 0, 0);
  return { ...base, id, vrsta, kategorija: 'nepoznato', broj, vrijeme: d.getTime(), ...extra };
};

test('Odstrel: najveći komad, emblem vrste, filter prijave, redoslijed, stupci 12 mjeseci, Na karti', async ({ page }) => {
  await page.goto('/');
  await seed(page, 'odstrel', [ods('a', 'zec', 3.5, 2), ods('b', 'divlja_svinja', 95, 5), ods('c', 'srna', 22, 40), ods('d', 'zec', 4, 3)]);
  await page.evaluate(() => localStorage.setItem('lovac.prijave.poslane', JSON.stringify(['b'])));
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  await page.locator('#ods-period [data-period="sve"]').click();
  await expect(page.locator('#ods-hero-komada')).toHaveText('4');
  await expect(page.locator('#ods-hero-najveci')).toHaveText('95');
  await expect(page.locator('#odstrel-spisak [data-id="b"] .div-emblem')).toHaveText('DS');
  // 12 mjeseci: stupci, a zbir svih mjeseci je 4
  await expect(page.locator('#ods-mjeseci .pr-mj')).toHaveCount(12);
  const n = await page.locator('#ods-mjeseci .pr-mj').evaluateAll((els) => els.reduce((s, e) => s + Number(e.dataset.n), 0));
  expect(n).toBe(4);
  // filter prijave
  await page.locator('#ods-prijava').selectOption('prijavljeni');
  await expect(page.locator('#odstrel-spisak li[data-id]')).toHaveCount(1);
  await expect(page.locator('#odstrel-spisak [data-id="b"]')).toBeVisible();
  await page.locator('#ods-prijava').selectOption('neprijavljeni');
  await expect(page.locator('#odstrel-spisak li[data-id]')).toHaveCount(3);
  await page.locator('#ods-prijava').selectOption('svi');
  // redoslijed po težini: bez naslova mjeseci
  await page.locator('#ods-sort').selectOption('teze');
  await expect(page.locator('#odstrel-spisak li[data-id]').first()).toHaveAttribute('data-id', 'b');
  await expect(page.locator('#odstrel-spisak .tr-mjesec')).toHaveCount(0);
  await page.locator('#ods-sort').selectOption('novije');
  await expect(page.locator('#odstrel-spisak .tr-mjesec').first()).toBeVisible();
  // Na karti zatvara spisak
  await page.locator('#odstrel-spisak [data-id="a"] [data-akcija="prikazi"]').click();
  await expect(page.locator('#odstrel')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('Opažanja: zadnje viđeno, doba dana iz sunca, redoslijed po grlima, grupe po mjesecima', async ({ page }) => {
  await page.goto('/');
  await seed(page, 'opazanja', [opa('a', 'srna', 2, 1, 6), opa('b', 'divlja_svinja', 7, 3, 22), opa('c', 'zec', 1, 0, 12)]);
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-opazanja').click();
  await page.locator('#op-period [data-period="sve"]').click();
  await expect(page.locator('#op-stat-opazanja')).toHaveText('3');
  await expect(page.locator('#op-stat-zadnje')).toHaveText('danas');
  // doba dana: svako opažanje ima chip iz sunca; podne = dan, 22 h = noć
  await expect(page.locator('#opazanja-spisak [data-id="c"] [data-doba]')).toHaveAttribute('data-doba', 'dan');
  await expect(page.locator('#opazanja-spisak [data-id="b"] [data-doba]')).toHaveAttribute('data-doba', 'noc');
  const dist = await page.locator('#op-doba .div-akt-stup').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.doba, Number(e.dataset.grla)])));
  expect(dist.noc).toBe(7);
  expect(dist.dan).toBe(1);
  expect(dist.zora + dist.dan + dist.sumrak + dist.noc).toBe(10);
  // emblem i redoslijed
  await expect(page.locator('#opazanja-spisak [data-id="b"] .div-emblem')).toHaveText('DS');
  await page.locator('#op-sort').selectOption('grla');
  await expect(page.locator('#opazanja-spisak li[data-id]').first()).toHaveAttribute('data-id', 'b');
  await expect(page.locator('#opazanja-spisak .tr-mjesec')).toHaveCount(0);
  await page.locator('#op-sort').selectOption('novije');
  await expect(page.locator('#opazanja-spisak .tr-mjesec').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
