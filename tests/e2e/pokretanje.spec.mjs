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
  await page.locator('#pr-nadimak summary').click(); // nadimak je u sklopivom dijelu
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

test('prijava: tabovi Prijava / Novi nalog, prikaz PIN-a i zapamćeno ime poslije uspješne prijave', async ({ page }) => {
  await fakeServerConfigHanging(page);
  await page.goto('/');
  await expect(page.locator('#ekran-prijava')).toBeVisible();
  await expect(page.locator('#btn-prijava')).toHaveText('Prijavi se');
  await page.locator('#pr-mod [data-mod="registracija"]').click();
  await expect(page.locator('#btn-prijava')).toHaveText('Napravi nalog');
  await expect(page.locator('#btn-prijava')).toHaveAttribute('value', 'registracija');
  await expect(page.locator('#pr-reg-napomena')).toBeVisible();
  await page.locator('#pr-mod [data-mod="prijava"]').click();
  await expect(page.locator('#pr-reg-napomena')).toBeHidden();
  await page.fill('#forma-prijava input[name=pin]', '123456');
  await page.locator('#btn-pin-prikazi').click();
  await expect(page.locator('#forma-prijava input[name=pin]')).toHaveAttribute('type', 'text');
  await page.locator('#btn-pin-prikazi').click();
  await expect(page.locator('#forma-prijava input[name=pin]')).toHaveAttribute('type', 'password');
  // dodirne mete
  for (const sel of ['#pr-mod [data-mod="prijava"]', '#btn-pin-prikazi', '#btn-prijava', '#pr-nadimak summary']) {
    const b = await page.locator(sel).boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
  // zapamćeno ime (bez PIN-a) se upiše pri sljedećem otvaranju
  await page.evaluate(() => localStorage.setItem('lovac.prijava.zadnja', JSON.stringify({ ime: 'Mujo', prezime: 'Mujić', nadimak: '7' })));
  await page.reload();
  await expect(page.locator('#forma-prijava input[name=ime]')).toHaveValue('Mujo');
  await expect(page.locator('#forma-prijava input[name=prezime]')).toHaveValue('Mujić');
  await expect(page.locator('#forma-prijava input[name=nadimak]')).toHaveValue('7');
  await expect(page.locator('#pr-nadimak')).toHaveAttribute('open', '');
  await expect(page.locator('#forma-prijava input[name=pin]')).toHaveValue('');
});

test('probni period: neodobren lovac radi 24 sata uz traku, a poslije isteka vidi ekran čekanja', async ({ page }) => {
  await fakeServerConfigHanging(page);
  await serveTiles(page);
  await page.addInitScript(() => {
    const dana = Number(sessionStorage.getItem('dana') ?? '3');
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'p1', ime: 'Novi', prezime: 'Lovac', odobren: false, probni_do: new Date(Date.now() + dana * 86400000).toISOString() }));
    // važeća sesija (server visi, pa se profil ne osvježava i ostaje zadnji poznati)
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'p1', aud: 'authenticated', role: 'authenticated' },
    }));
  });
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await expect(page.locator('#probni-traka')).toBeVisible();
  await expect(page.locator('#probni-traka')).toContainText('još 3 dana');
  await page.locator('#probni-traka').click();
  await expect(page.locator('#sekcije')).toBeVisible();

  await page.evaluate(() => sessionStorage.setItem('dana', '-1'));
  await page.reload();
  await expect(page.locator('#ekran-cekanje')).toBeVisible();
  await expect(page.locator('#cekanje-tekst')).toContainText('Probni period od 24 sata je istekao');
});

test('registracija: revir i sekcija se biraju sa servera (javne_sekcije), šalju u nalog', async ({ page }) => {
  await fakeServerConfigHanging(page);
  await page.addInitScript(() => { window.__signup = null; });
  await page.route(/lazni\.supabase\.test/, async (r) => {
    const url = r.request().url();
    if (url.includes('/rpc/javne_sekcije')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { sekcija_id: '55555555-0000-4000-8000-000000000001', naziv: 'Sekcija A', revir_id: '66666666-0000-4000-8000-000000000001', revir: 'Krupa' },
        { sekcija_id: '55555555-0000-4000-8000-000000000002', naziv: 'Sekcija B', revir_id: '66666666-0000-4000-8000-000000000002', revir: 'Otoka' },
      ]) });
    }
    if (url.includes('/auth/v1/signup')) {
      const body = JSON.parse(r.request().postData() || '{}');
      await page.evaluate((b) => { window.__signup = b; }, body);
      return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'test' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await expect(page.locator('#pr-sekcija-blok')).toBeHidden();
  await page.locator('#pr-mod [data-mod="registracija"]').click();
  await expect(page.locator('#pr-sekcija-blok')).toBeVisible();
  await expect(page.locator('#pr-revir option')).toHaveCount(3);
  await expect(page.locator('#pr-sekcija')).toBeDisabled();
  await page.selectOption('#pr-revir', { label: 'Otoka' });
  await expect(page.locator('#pr-sekcija option')).toHaveCount(2);
  await page.selectOption('#pr-sekcija', { label: 'Sekcija B' });
  await page.fill('#forma-prijava input[name=ime]', 'Novi');
  await page.fill('#forma-prijava input[name=prezime]', 'Lovac');
  await page.fill('#forma-prijava input[name=pin]', '123456');
  await page.locator('#btn-prijava').click();
  await expect.poll(() => page.evaluate(() => window.__signup)).not.toBeNull();
  const body = await page.evaluate(() => window.__signup);
  expect(body.data.sekcija).toBe('55555555-0000-4000-8000-000000000002');
  expect(body.data.probni).toBe(true);
});
