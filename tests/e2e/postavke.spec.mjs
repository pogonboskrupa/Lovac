import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Ado', prezime: 'Adić', nadimak: '127', odobren: true, is_admin: true }));
  });
});

test('postavke se otvaraju sa karte i prikazuju nalog i verziju', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#postavke')).toBeVisible();
  await expect(page.locator('#postavke-nalog')).toHaveText('Ado Adić (127) · administrator');
  await expect(page.locator('#postavke-verzija')).toHaveText(/^v\d+\.\d+\.\d+$/);
});

test('tema se mijenja iz postavki i pamti', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('[data-tema-izbor="dan"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'dan');
  await expect(page.locator('[data-tema-izbor="dan"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'dan');
});

test('podloga se bira iz postavki', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#postavke [data-podloga="osm"]').click();
  await expect(page.locator('#postavke [data-podloga="osm"]')).toHaveAttribute('aria-pressed', 'true');
});

test('dugme Nazad (window.__nazad) prvo zatvara postavke, tek onda dozvoljava izlaz', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.locator('#btn-postavke').click();
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#postavke')).toBeHidden();
  expect(await page.evaluate(() => window.__nazad())).toBe(false);
});

test('brisanje keša pločica traži drugi dodir (WebView nema confirm dijalog)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await page.waitForTimeout(800);
  await page.locator('#btn-postavke').click();
  const broj = async () => Number((await page.locator('#postavke-kes').innerText()).match(/\d+/)?.[0] ?? -1);
  await expect.poll(broj).toBeGreaterThan(0);
  await page.locator('#btn-kes-obrisi').click();
  expect(await broj()).toBeGreaterThan(0);
  await page.locator('#btn-kes-obrisi').click();
  await expect.poll(broj).toBe(0);
});

test('odjava iz postavki vodi na prijavu odmah, i kad server ne odgovara, i briše sesiju', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) - 3600, user: { id: 'u1', aud: 'authenticated', role: 'authenticated' },
    }));
  });
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    const src = (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'");
    await route.fulfill({ response: res, body: src });
  });
  await page.route(/lazni\.supabase\.test/, () => new Promise(() => {}));
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-postavke-odjava').click();
  await expect(page.locator('#ekran-prijava')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('lovac.profil'))).toBeNull();
  // Server visi, pa se lokalna sesija briše tek nakon kratkog roka čekanja.
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('sb-')).length), { timeout: 8000 }).toBe(0);
});

test('dodirne mete u postavkama su ≥ 44 px', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  for (const sel of ['#btn-postavke-zatvori', '[data-tema-izbor="noc"]', '[data-tema-izbor="dan"]', '#postavke [data-podloga="topo"]',
    '#btn-kes-obrisi', '#btn-provjeri-azuriranje', '#btn-postavke-odjava']) {
    const b = await page.locator(sel).boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
});
