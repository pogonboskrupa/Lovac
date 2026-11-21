import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';
import { readFileSync } from 'node:fs';

test.use({ viewport: { width: 360, height: 740 } });

const base = { vidljivost: 'privatno', rev: 1, sinhronizovano: true, lat: 44.88, lon: 16.15 };
const seed = (page, store, rows) => page.evaluate(([s, r]) => new Promise((resolve) => {
  const req = indexedDB.open('lovac');
  req.onsuccess = () => {
    const tx = req.result.transaction(s, 'readwrite');
    r.forEach((x) => tx.objectStore(s).put(x));
    tx.oncomplete = resolve;
  };
}), [store, rows]);
const all = (page, store) => page.evaluate((s) => new Promise((resolve) => {
  const req = indexedDB.open('lovac');
  req.onsuccess = () => { const q = req.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => resolve(q.result); };
}), store);

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Grupovođa', odobren: true, is_admin: false }));
  });
});

test('profil kartica: inicijali, uloge iz keša sekcija i stanje slanja', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('spiskovi', 'readwrite');
      tx.objectStore('spiskovi').put({ id: 'sekcije', rows: {
        reviri: [{ id: 'R1', naziv: 'Krupa' }], sekcije: [{ id: 'S1', naziv: 'Krupa 1', revir_id: 'R1', grupovodja_id: 'u1' }],
        clanovi: [], grupovodje: [{ korisnik_id: 'u1', revir_id: 'R1' }], lovocuvari: [],
      } });
      tx.oncomplete = resolve;
    };
  }));
  await page.reload();
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#p-avatar')).toHaveText('GG');
  await expect(page.locator('#p-ime')).toHaveText('Goran Grupovođa');
  await expect(page.locator('#p-uloge .p-uloga')).toHaveText(['Grupovođa · Krupa', 'Vodi sekciju Krupa 1']);
  await expect(page.locator('#p-stanje')).toContainText('sve je poslano');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('lokacija u postavkama: isključivanje i učestalost se pamte', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#p-dijeli')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#p-dijeli').click();
  await expect(page.locator('#p-dijeli')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#p-interval [data-interval="stedi"]').click();
  await page.reload();
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#p-dijeli')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#p-interval [data-interval="stedi"]')).toHaveAttribute('aria-pressed', 'true');
});

test('rezervna kopija: izvoz bez tuđih zapisa, uvoz samo dodaje nove', async ({ page }) => {
  await page.goto('/');
  await seed(page, 'objekti', [
    { ...base, id: 'obj-00000001', naziv: 'Čeka 1', vrsta: 'cekalo', stanje: 'dobro', zadnji_obilazak: '2026-11-01' },
    { ...base, id: 'obj-00000002', naziv: 'Tuđa', vrsta: 'cekalo', stanje: 'dobro', zadnji_obilazak: '2026-11-01', tudji: true },
  ]);
  await seed(page, 'odstrel', [{ ...base, id: 'ods-00000001', vrsta: 'zec', vrijeme: Date.now(), kategorija: 'nepoznato' }]);
  await page.locator('#btn-postavke').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btn-rezerva-izvoz').click()]);
  expect(download.suggestedFilename()).toMatch(/^lovac-rezerva-\d{4}-\d\d-\d\d\.json$/);
  const text = readFileSync(await download.path(), 'utf8');
  const body = JSON.parse(text);
  expect(body.podaci.objekti.map((r) => r.id)).toEqual(['obj-00000001']);
  expect(body.podaci.odstrel).toHaveLength(1);

  // uvoz u "prazan" telefon: obriši lokalno, pa vrati iz kopije
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction(['objekti', 'odstrel'], 'readwrite'); tx.objectStore('objekti').clear(); tx.objectStore('odstrel').clear(); tx.oncomplete = resolve; };
  }));
  await page.locator('#rezerva-ulaz').setInputFiles({ name: 'kopija.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#rezerva-status')).toContainText('Vraćeno zapisa: 2, preskočeno');
  expect((await all(page, 'objekti')).map((r) => r.id)).toEqual(['obj-00000001']);
  expect((await all(page, 'objekti'))[0].sinhronizovano).toBe(false);
  // ponovni uvoz ne duplira
  await page.locator('#rezerva-ulaz').setInputFiles({ name: 'kopija.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#rezerva-status')).toContainText('Vraćeno zapisa: 0');
  await page.locator('#rezerva-ulaz').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"drugo"}') });
  await expect(page.locator('#rezerva-status')).toContainText('nije rezervna kopija');
});

test('odjava sa neposlanim zapisima traži drugi dodir i upozorava', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('red', 'readwrite'); tx.objectStore('red').put({ id: 'objekti:x', store: 'objekti', recId: 'x', tombstone: null, seq: '1', pokusaja: 0, sljedeci: 0, dodano: Date.now() }); tx.oncomplete = resolve; };
  }));
  await page.locator('#btn-postavke-zatvori').click();
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#postavke-odjava-upozorenje')).toBeVisible();
  await page.locator('#btn-postavke-odjava').click();
  await expect(page.locator('#btn-postavke-odjava')).toContainText('dodirni ponovo');
  await expect(page.locator('#postavke')).toBeVisible();
});
