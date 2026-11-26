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
  await expect(page.locator('#postavke-admin')).toBeHidden();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await expect(page.locator('#postavke-admin')).toBeHidden();
});

test('admin vidi korisnike (neodobreni prvi) i odobrava jednim dodirom', async ({ page }) => {
  const rpc = await setup(page);
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-korisnici').click(); // administracija je prva kartica u Opšte
  await expect(page.locator('#korisnici')).toBeVisible();
  const rows = page.locator('#korisnici-spisak [data-id]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveAttribute('data-id', 'b2');
  await expect(rows.first()).toContainText('Novo Lice (127)');
  await expect(rows.first()).toContainText('Čeka odobrenje');
  await expect(page.locator('#korisnici-ceka')).toHaveText('1');
  await expect(page.locator('#kor-hero-odobreni')).toHaveText('2');
  await expect(page.locator('#kor-hero-admini')).toHaveText('1');

  await rows.first().locator('[data-akcija="odobri"]').click();
  await expect.poll(() => rpc.length).toBe(1);
  expect(rpc[0]).toEqual({ fn: 'admin_odobri', body: { p_korisnik: 'b2', p_odobren: true } });
});

test('admin: uloga, reset PIN-a (6-8 cifara) i brisanje drugim dodirom', async ({ page }) => {
  const rpc = await setup(page);
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-korisnici').click(); // administracija je prva kartica u Opšte
  const lovac = page.locator('#korisnici-spisak [data-id="c3"]');
  await lovac.locator('summary').click(); // "Više radnji"
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
  await page.locator('#btn-korisnici').click(); // administracija je prva kartica u Opšte
  const ja = page.locator('#korisnici-spisak [data-id="a1"]');
  await expect(ja.locator('[data-akcija="odobri"]')).toHaveCount(0);
  await expect(ja.locator('[data-akcija="obrisi"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#korisnici')).toBeHidden();
});

test('Korisnici i odobrenja: administracija je kartica odmah poslije ažuriranja u Opšte, značka pokazuje koliko čeka, filteri i pretraga', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  const kartice = page.locator('#p-opste > .p-kartica');
  await expect(kartice.nth(1)).toHaveAttribute('id', 'postavke-admin');
  await expect(page.locator('#korisnici-znacka')).toBeHidden(); // još nije učitano, nema izmišljenog broja
  await page.locator('#btn-korisnici').click();
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(3);
  await expect(page.locator('#kor-filter [data-filter="cekaju"]')).toHaveText('Čekaju (1)');
  await page.locator('#kor-filter [data-filter="cekaju"]').click();
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(1);
  await page.locator('#kor-filter [data-filter="svi"]').click();
  await page.fill('#kor-trazi', 'lovro');
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(1);
  await expect(page.locator('#korisnici-spisak [data-id="c3"]')).toContainText('Odobren');
  await page.fill('#kor-trazi', 'nema takvog');
  await expect(page.locator('#korisnici-prazno')).toBeVisible();
  await page.fill('#kor-trazi', '');
  await page.screenshot({ path: process.env.SNIMCI_DIR ? `${process.env.SNIMCI_DIR}/korisnici.png` : '/tmp/korisnici.png' });
  // značka na dugmetu u Postavkama poslije zatvaranja
  await page.locator('#btn-korisnici-zatvori').click();
  await page.locator('#btn-postavke').click();
  await expect(page.locator('#korisnici-znacka')).toHaveText('1 čeka odluku');
  // dodirna meta dugmeta ≥ 44 px
  const b = await page.locator('#btn-korisnici').boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(44);
});

test('Korisnici: "Odobri i primi u sekciju" odobri nalog I prijem u traženu sekciju; grupovođa dobije čip uloge', async ({ page }) => {
  const rpc = await setup(page);
  const patchovi = [];
  await page.route(/lazni\.supabase\.test\/rest\/v1\/sekcija_clanovi/, (r) => {
    patchovi.push({ metoda: r.request().method(), url: decodeURIComponent(r.request().url()), body: r.request().postData() });
    return r.fulfill({ status: 204, body: '' });
  });
  await page.goto('/');
  await page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('lovac');
    open.onsuccess = () => {
      const tx = open.result.transaction('spiskovi', 'readwrite');
      tx.objectStore('spiskovi').put({ id: 'sekcije', rows: {
        reviri: [{ id: 'r1', naziv: 'Krupa' }],
        sekcije: [{ id: 's1', naziv: 'Krupa 1', revir_id: 'r1', grupovodja_id: 'c3' }],
        clanovi: [{ sekcija_id: 's1', korisnik_id: 'b2', status: 'ceka' }],
        grupovodje: [{ korisnik_id: 'c3', revir_id: 'r1' }], lovocuvari: [],
      } });
      tx.oncomplete = () => resolve();
    };
  }));
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-korisnici').click();
  const novi = page.locator('#korisnici-spisak [data-id="b2"]');
  await expect(novi).toContainText('Traži ulaz: Krupa 1 (Krupa)');
  await expect(novi.locator('[data-akcija="odobri"]')).toHaveText('Odobri i primi u Krupa 1');
  await expect(page.locator('#korisnici-spisak [data-id="c3"]')).toContainText('Grupovođa · Krupa');
  await novi.locator('[data-akcija="odobri"]').click();
  await expect.poll(() => rpc.length).toBe(1);
  expect(rpc[0]).toEqual({ fn: 'admin_odobri', body: { p_korisnik: 'b2', p_odobren: true } });
  await expect.poll(() => patchovi.some((p) => p.metoda === 'PATCH' && /sekcija_id=eq\.s1/.test(p.url) && /korisnik_id=eq\.b2/.test(p.url) && /odobren/.test(p.body || ''))).toBe(true);
});
