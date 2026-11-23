import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => localStorage.setItem('lovac.profil', JSON.stringify({ id: 'ja', ime: 'Goran', prezime: 'Lovac', odobren: true, is_admin: false })));
});

const REC = {
  id: 'l1',
  lov: { id: 'l1', naziv: 'Pogon Bara', status: 'u_toku', pocetak: new Date(Date.now() - 50 * 60000).toISOString(), napomena: 'Okupljanje kod lovačke kuće' },
  ucesnici: [{ korisnik_id: 'ja', uloga: 'strijelac' }, { korisnik_id: 'v', uloga: 'vodja' }],
  stanovi: [{ id: 's1', broj: 4, korisnik_id: 'ja' }],
  sekcija: { naziv: 'Krupa 1' }, revir: { naziv: 'Krupa' },
};

test('"Lov danas" je u ploči + samo dok je lov u toku i pokazuje podatke o lovu', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#meni-dodaj')).toBeVisible();
  await expect(page.locator('#btn-lov-danas')).toBeHidden();

  await page.evaluate((rec) => document.dispatchEvent(new CustomEvent('lov:aktivan', { detail: { lov: rec } })), REC);
  await expect(page.locator('#btn-lov-danas')).toBeVisible();
  await expect(page.locator('#btn-lov-danas')).toContainText('Pogon Bara');
  await page.locator('#btn-lov-danas').click();
  const ekran = page.locator('#lov-danas');
  await expect(ekran).toBeVisible();
  await expect(page.locator('#meni-dodaj')).toBeHidden();
  await expect(ekran).toContainText('Krupa 1 · Krupa');
  await expect(ekran).toContainText('Strijelac · stan 4');
  await expect(ekran).toContainText('Okupljanje kod lovačke kuće');
  await expect(ekran.locator('.clan-red')).toHaveCount(2);
  await expect(ekran).toContainText('ne zamjenjuje pravila lova');
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(ekran).toBeHidden();

  // kraj lova: dugme nestaje
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('lov:aktivan', { detail: { lov: null } })));
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#meni-dodaj')).toBeVisible();
  await expect(page.locator('#btn-lov-danas')).toBeHidden();
});

test('avatar je logo društva dok lovac ne izabere svoju sliku', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  const av = page.locator('#p-avatar');
  await expect(av).toHaveClass(/logo-avatar/);
  expect(await av.evaluate((el) => el.style.backgroundImage)).toContain('logo-192.png');
});
