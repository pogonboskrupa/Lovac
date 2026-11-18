import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigHanging } from './helpers.mjs';

// Keširan profil + Supabase sesija kojoj je access token istekao (traži osvježavanje).
function seedExpiredSession(odobren = true) {
  localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'A', prezime: 'B', odobren }));
  const past = Math.floor(Date.now() / 1000) - 3600;
  localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
    access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: past,
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated' },
  }));
}

test('keširan profil ulazi ODMAH na kartu i ostaje tu kad osvježavanje tokena istekne na mrtvoj vezi', async ({ page }) => {
  await serveTiles(page);
  await fakeServerConfigHanging(page);
  await page.clock.install();
  await page.addInitScript(seedExpiredSession);
  const t0 = Date.now();
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible({ timeout: 3000 });
  expect(Date.now() - t0).toBeLessThan(3000);
  // Rok poziva je 12 s, a supabase-js ponavlja osvježavanje sa backoff-om;
  // ni nakon svih pokušaja ne smije biti odjave.
  for (let i = 0; i < 12; i++) await page.clock.runFor(10000);
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await expect(page.locator('#ekran-prijava')).toBeHidden();
});

test('keširan neodobren profil ide na čekanje, ne na prijavu', async ({ page }) => {
  await fakeServerConfigHanging(page);
  await page.addInitScript(seedExpiredSession, false);
  await page.goto('/');
  await expect(page.locator('#ekran-cekanje')).toBeVisible();
});

test('bez profila: prijava, a kratak PIN se odbija bez slanja na server', async ({ page }) => {
  await fakeServerConfigHanging(page);
  await page.goto('/');
  await expect(page.locator('#ekran-prijava')).toBeVisible();
  await page.fill('input[name=ime]', 'Mujo');
  await page.fill('input[name=prezime]', 'Mujić');
  await page.fill('input[name=pin]', '1234');
  await page.locator('button[value=prijava]').click();
  await expect(page.locator('#prijava-status')).toHaveText('PIN mora imati 6 do 8 cifara');
});

test('polja forme su ≥ 48 px i font ≥ 16 px (WebView inače zumira)', async ({ page }) => {
  await fakeServerConfigHanging(page);
  await page.goto('/');
  for (const name of ['ime', 'prezime', 'pin']) {
    const el = page.locator(`input[name=${name}]`);
    expect((await el.boundingBox()).height).toBeGreaterThanOrEqual(48);
    expect(await el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  }
});
