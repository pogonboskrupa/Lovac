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
  for (const name of ['ime', 'prezime', 'nadimak', 'pin']) {
    const el = page.locator(`#forma-prijava input[name=${name}]`);
    expect((await el.boundingBox()).height).toBeGreaterThanOrEqual(48);
    expect(await el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  }
});

test('prijava čeka spor server do 30 s (ne javlja grešku poslije 12 s) i pokazuje da čeka', async ({ page }) => {
  test.setTimeout(60000);
  await fakeServerConfigHanging(page);
  await page.unroute(/lazni\.supabase\.test/);
  let warmed = 0;
  await page.route(/lazni\.supabase\.test\/auth\/v1\/health/, (r) => { warmed++; return r.fulfill({ status: 200, body: '{}' }); });
  await page.route(/lazni\.supabase\.test\/auth\/v1\/token/, async (r) => {
    await new Promise((resolve) => setTimeout(resolve, 14000)); // duže od starog roka od 12 s
    return r.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }) });
  });
  await page.goto('/');
  await expect.poll(() => warmed).toBeGreaterThan(0); // server se budi čim se pokaže prijava
  await page.fill('input[name=ime]', 'Mujo');
  await page.fill('input[name=prezime]', 'Mujić');
  await page.fill('input[name=pin]', '123456');
  await page.locator('button[value=prijava]').click();
  await expect(page.locator('#prijava-status')).toContainText('Server sporo odgovara, čekam', { timeout: 10000 });
  await expect(page.locator('#prijava-status')).toHaveText('Pogrešno ime, prezime ili PIN.', { timeout: 30000 });
});
