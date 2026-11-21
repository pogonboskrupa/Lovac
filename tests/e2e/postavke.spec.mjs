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
  await page.locator('#btn-podloga').click();
  await expect(page.locator('#meni-podloga button')).toHaveText(['Topo', 'Satelit', 'Teren']);
  await page.locator('#meni-podloga [data-podloga="satelit"]').click();
  await expect(page.locator('#meni-podloga [data-podloga="satelit"]')).toHaveAttribute('aria-pressed', 'true');
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
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
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
  for (const sel of ['#btn-postavke-zatvori', '[data-tema-izbor="noc"]', '[data-tema-izbor="dan"]',
    '#btn-provjeri-azuriranje', '#btn-preuzmi-zadnju', '#btn-postavke-odjava']) {
    const b = await page.locator(sel).boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
});

test('provjera ažuriranja koristi version.json i nudi instalaciju', async ({ page }) => {
  await page.route(/raw\.githubusercontent\.com/, (r) => r.fulfill({
    status: 200, body: '{"verzija":"v9.9.9"}', headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  }));
  await page.goto('/');
  await expect(page.locator('#nova-verzija')).toBeVisible();
  await expect(page.locator('#nova-verzija .nv-tekst')).toHaveText('Nova verzija v9.9.9');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-provjeri-azuriranje').click();
  await expect(page.locator('#postavke-azur-status')).toHaveText('Nova verzija v9.9.9');
  await expect(page.locator('#btn-instaliraj-azuriranje')).toBeVisible();
});

test('kad server za verzije ne odgovara, postavke to kažu (ne lažno "najnovija")', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-provjeri-azuriranje').click();
  await expect(page.locator('#postavke-azur-status')).toHaveText(/Provjera nije uspjela/);
});

test('"Preuzmi zadnju verziju" je uvijek dostupno i u APK-u zove AndroidUpdate most', async ({ page }) => {
  await page.addInitScript(() => {
    window.__pozvano = [];
    window.AndroidUpdate = { downloadAndInstall: (u) => window.__pozvano.push(u) };
  });
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-preuzmi-zadnju').click();
  expect(await page.evaluate(() => window.__pozvano)).toEqual([expect.stringMatching(/\/releases\/latest\/download\/app-debug\.apk$/)]);
});
