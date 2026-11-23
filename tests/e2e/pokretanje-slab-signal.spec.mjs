import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

// Lovac sa sačuvanim profilom se na slabom ili nikakvom signalu NIKAD ne izbacuje na prijavu sam od sebe.
// Sesija je istekla (treba je osvježiti), a server/mreža vraća razne loše odgovore.
const ME = { id: 'u1', ime: 'A', prezime: 'B', odobren: true };
const cases = {
  'stranica operatera (200 HTML)': (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html>Prijava na mrežu operatera</html>' }),
  'prazan odgovor (200 {})': (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  'greška servera 500': (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"x"}' }),
  'proksi 502': (r) => r.fulfill({ status: 502, body: 'Bad gateway' }),
  'prekinuta veza': (r) => r.abort('failed'),
  'veza visi': () => new Promise(() => {}),
};

async function setup(page, handler) {
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\//, handler);
  await page.addInitScript((me) => {
    if (sessionStorage.getItem('test.ucitano')) return;
    sessionStorage.setItem('test.ucitano', '1');
    localStorage.setItem('lovac.profil', JSON.stringify(me));
    const past = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: past, user: { id: me.id, aud: 'authenticated', role: 'authenticated' } }));
  }, ME);
}

for (const [name, handler] of Object.entries(cases)) {
  test(`slab signal pri pokretanju (${name}): aplikacija se otvara na karti i ostaje na njoj, bez prijave`, async ({ page }) => {
    await setup(page, handler);
    await page.goto('/');
    await expect(page.locator('#ekran-mapa')).toBeVisible();
    await page.waitForTimeout(4000); // pozadinska provjera sesije završi
    await expect(page.locator('#ekran-mapa')).toBeVisible();
    await expect(page.locator('#ekran-prijava')).toBeHidden();
    // i ponovno pokretanje (lovac ugasi i upali aplikaciju)
    await page.reload();
    await page.waitForTimeout(2500);
    await expect(page.locator('#ekran-mapa')).toBeVisible();
    await expect(page.locator('#ekran-prijava')).toBeHidden();
  });
}

test('kad server stvarno ne prihvati sesiju: traka "Prijava istekla", prijava tek na dodir lovca', async ({ page }) => {
  await setup(page, (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'refresh_token_not_found', error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }) }));
  await page.goto('/');
  await expect(page.locator('#prijava-istekla')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.locator('#prijava-istekla').click();
  await expect(page.locator('#ekran-prijava')).toBeVisible();
});
