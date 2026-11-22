import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo' });
test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-07-15T10:00:00+02:00'));
});

async function openDivljac(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-divljac').click();
  await expect(page.locator('#divljac')).toBeVisible();
}

test('Divljač: mreža od sedam vrsta, filter grupe, pretraga, Nazad vraća na spisak', async ({ page }) => {
  await openDivljac(page);
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(7);
  await expect(page.locator('#divljac-napomena')).toContainText('Ne zamjenjuju propise');
  await page.locator('#divljac-grupe [data-grupa="zvijer"]').click();
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(3);
  await page.locator('#divljac-grupe [data-grupa="sitna"]').click();
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(2);
  await page.locator('#divljac-grupe [data-grupa="sve"]').click();
  await page.fill('#divljac-trazi', 'čagalj');
  await expect(page.locator('#divljac-spisak .div-kartica')).toHaveCount(1);
  await page.fill('#divljac-trazi', 'nepostojeca rijec');
  await expect(page.locator('#divljac-prazno')).toBeVisible();
  await page.fill('#divljac-trazi', '');
  await page.locator('#divljac-spisak [data-id="srna"] [data-otvori]').click();
  await expect(page.locator('#divljac-detalj')).toBeVisible();
  await expect(page.locator('#divljac-lista')).toBeHidden();
  expect(await page.evaluate(() => window.__nazad())).toBe(true); // Nazad: detalj → spisak
  await expect(page.locator('#divljac-lista')).toBeVisible();
  expect(await page.evaluate(() => window.__nazad())).toBe(true); // Nazad: spisak → zatvoreno
  await expect(page.locator('#divljac')).toBeHidden();
});

test('Divljač: "u julu u prirodi" prikazuje biološke događaje (nije lovostaj) i vodi u detalj', async ({ page }) => {
  await openDivljac(page);
  await expect(page.locator('#divljac-mjesec-naslov')).toHaveText('U julu u prirodi');
  await expect(page.locator('#divljac-mjesec-lista [data-vrsta="srna"][data-dogadjaj="parenje"]')).toBeVisible();
  await expect(page.locator('#divljac-mjesec-lista [data-vrsta="medvjed"][data-dogadjaj="parenje"]')).toBeVisible();
  await expect(page.locator('#divljac-mjesec-lista [data-dogadjaj="san"]')).toHaveCount(0);
  await expect(page.locator('#divljac-mjesec')).toContainText('Nije lovostaj');
  await page.locator('#divljac-mjesec-lista [data-vrsta="srna"] button').click();
  await expect(page.locator('#divljac-detalj-glava')).toContainText('Srndać');
});

test('Divljač: detalj sa tabovima, kalendar sa označenim mjesecom, aktivnost, lovostaj nikad izmišljen', async ({ page }) => {
  await openDivljac(page);
  await page.locator('#divljac-spisak [data-id="divlja_svinja"] [data-otvori]').click();
  await expect(page.locator('#divljac-detalj-sezona')).toContainText('Nije uneseno');
  await expect(page.locator('#divljac-detalj-sadrzaj .div-brojke')).toContainText('Težina');
  await expect(page.locator('#divljac-detalj-sadrzaj .div-kal-red[data-dogadjaj="parenje"] .div-kal-celija.on')).toHaveCount(3);
  await expect(page.locator('#divljac-detalj-sadrzaj .div-kal-celija.ovaj').first()).toBeVisible(); // juli označen
  await expect(page.locator('#divljac-detalj-sadrzaj .div-akt-stup[data-doba="noc"]')).toHaveAttribute('data-nivo', '3');
  await expect(page.locator('#divljac-detalj-sadrzaj')).toContainText('Izgled i karakteristike');
  await expect(page.locator('#divljac-detalj-sadrzaj')).not.toContainText('Značajno za lov');
  await page.locator('#divljac-tabovi [data-tab="lov"]').click();
  await expect(page.locator('#divljac-detalj-sadrzaj')).toContainText('Značajno za lov');
  await expect(page.locator('#divljac-detalj-sadrzaj')).toContainText('trihinelu');
  await expect(page.locator('#divljac-detalj-sadrzaj')).toContainText('Zdravlje i bolesti');
  await page.locator('#divljac-tabovi [data-tab="biologija"]').click();
  await expect(page.locator('#divljac-detalj-sadrzaj')).toContainText('Spol i dob');
  await page.locator('#divljac-tabovi [data-tab="ponasanje"]').click();
  await expect(page.locator('#divljac-detalj-sadrzaj')).toContainText('Tragovi i znakovi');
});

test('pločica Divljač u meniju i pločice vrsta imaju dodirnu metu ≥ 44 px', async ({ page }) => {
  await openDivljac(page);
  for (const sel of ['#btn-divljac-zatvori', '#divljac-spisak [data-otvori]', '#divljac-grupe [data-grupa]']) {
    const b = await page.locator(sel).first().boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
});
