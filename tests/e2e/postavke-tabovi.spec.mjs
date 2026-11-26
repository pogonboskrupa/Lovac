import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Lovac', odobren: true, is_admin: false }));
  });
});

const tab = (page, t) => page.locator(`#p-tabovi [data-ptab="${t}"]`).click();

test('postavke imaju četiri taba i svaki pokazuje samo svoje kartice', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#p-tabovi [data-ptab]:not([hidden])')).toHaveCount(4); // peti tab (LD Grmeč) je samo za rukovodioce
  await expect(page.locator('#p-velicina')).toBeVisible();
  await expect(page.locator('#btn-rezerva-izvoz')).toBeHidden();
  await tab(page, 'podaci');
  await expect(page.locator('#btn-rezerva-izvoz')).toBeVisible();
  await expect(page.locator('#p-velicina')).toBeHidden();
  await tab(page, 'nalog');
  await expect(page.locator('#btn-postavke-odjava')).toBeVisible();
  await expect(page.locator('#btn-rezerva-izvoz')).toBeHidden();
  await tab(page, 'profil');
  await expect(page.locator('#p-profil')).toBeVisible();
  await expect(page.locator('#btn-postavke-odjava')).toBeHidden();
});

test('spremnost: pohrana, slanje i podsjetnik za rezervnu kopiju', async ({ page }) => {
  await page.addInitScript(() => {
    const est = { usage: 90 * 1024 * 1024, quota: 100 * 1024 * 1024 };
    Object.defineProperty(navigator, 'storage', {
      value: { estimate: async () => est, persisted: async () => false, persist: async () => true },
    });
  });
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await tab(page, 'podaci');
  await expect(page.locator('#sp-pohrana')).toContainText('90');
  await expect(page.locator('#sp-pohrana')).toHaveAttribute('data-stanje', 'upozorenje');
  await expect(page.locator('#sp-slanje')).toContainText('zadnje slanje još nikad');
  await expect(page.locator('#sp-kopija')).toContainText('Nema podataka');
  await expect(page.locator('#btn-zastiti-pohranu')).toBeVisible();
  await page.locator('#btn-zastiti-pohranu').click();
});
