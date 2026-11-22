import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const USERS = [
  { id: 'a1', ime: 'Ado', prezime: 'Admin', nadimak: null, odobren: true, is_admin: true, created_at: '2026-11-18T08:00:00Z' },
  { id: 'b2', ime: 'Novo', prezime: 'Lice', nadimak: '127', odobren: false, is_admin: false, created_at: '2026-11-19T08:00:00Z' },
  { id: 'c3', ime: 'Lovro', prezime: 'Lovac', nadimak: null, odobren: true, is_admin: false, created_at: '2026-11-18T09:00:00Z' },
];

async function setup(page, { admin = true } = {}) {
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    const src = (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'");
    await route.fulfill({ response: res, body: src });
  });
  const rpc = [];
  await page.route(/lazni\.supabase\.test\/auth\//, (r) => new Promise(() => {}));
  await page.route(/lazni\.supabase\.test\/rest\/v1\/korisnici/, (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(USERS),
  }));
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\//, async (r) => {
    rpc.push({ fn: r.request().url().split('/rpc/')[1], body: r.request().postDataJSON() });
    await r.fulfill({ status: 204, body: '' });
  });
  await page.addInitScript((isAdmin) => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'a1', ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: isAdmin }));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'a1', aud: 'authenticated', role: 'authenticated' },
    }));
  }, admin);
  return rpc;
}

test('lovac koji nije admin ne vidi administraciju', async ({ page }) => {
  await setup(page, { admin: false });
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await expect(page.locator('#postavke-admin')).toBeHidden();
});

test('admin vidi korisnike (neodobreni prvi) i odobrava jednim dodirom', async ({ page }) => {
  const rpc = await setup(page);
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await page.locator('#btn-korisnici').click();
  await expect(page.locator('#korisnici')).toBeVisible();
  const rows = page.locator('#korisnici-spisak [data-id]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveAttribute('data-id', 'b2');
  await expect(rows.first()).toContainText('Novo Lice (127)');
  await expect(rows.first()).toContainText('čeka odobrenje');
  await expect(page.locator('#korisnici-ceka')).toHaveText('Čeka odobrenje: 1');

  await rows.first().locator('[data-akcija="odobri"]').click();
  await expect.poll(() => rpc.length).toBe(1);
  expect(rpc[0]).toEqual({ fn: 'admin_odobri', body: { p_korisnik: 'b2', p_odobren: true } });
});

test('admin: uloga, reset PIN-a (6-8 cifara) i brisanje drugim dodirom', async ({ page }) => {
  const rpc = await setup(page);
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await page.locator('#btn-korisnici').click();
  const lovac = page.locator('#korisnici-spisak [data-id="c3"]');
  await lovac.locator('[data-akcija="admin"]').click();
  await expect.poll(() => rpc.length).toBe(1);
  expect(rpc[0]).toEqual({ fn: 'admin_postavi_ulogu', body: { p_korisnik: 'c3', p_admin: true } });

  await lovac.locator('input[name="novi-pin"]').fill('12');
  await lovac.locator('[data-akcija="pin"]').click();
  await expect(page.locator('#korisnici-status')).toHaveText('PIN mora imati 6 do 8 cifara');
  await lovac.locator('input[name="novi-pin"]').fill('654321');
  await lovac.locator('[data-akcija="pin"]').click();
  await expect.poll(() => rpc.length).toBe(2);
  expect(rpc[1]).toEqual({ fn: 'admin_reset_pin', body: { p_korisnik: 'c3', p_pin: '654321' } });

  await lovac.locator('[data-akcija="obrisi"]').click();
  await page.waitForTimeout(200);
  expect(rpc.length).toBe(2);
  await lovac.locator('[data-akcija="obrisi"]').click();
  await expect.poll(() => rpc.length).toBe(3);
  expect(rpc[2]).toEqual({ fn: 'admin_obrisi_korisnika', body: { p_korisnik: 'c3' } });
});

test('admin ne može opozvati ni obrisati sam sebe iz UI-ja', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await page.locator('#btn-korisnici').click();
  const ja = page.locator('#korisnici-spisak [data-id="a1"]');
  await expect(ja.locator('[data-akcija="odobri"]')).toHaveCount(0);
  await expect(ja.locator('[data-akcija="obrisi"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#korisnici')).toBeHidden();
});
