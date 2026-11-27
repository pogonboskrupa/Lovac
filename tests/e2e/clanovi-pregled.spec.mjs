import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = (n, ime, prezime, extra = {}) => ({ id: ID(n), ime, prezime, odobren: true, is_admin: false, ...extra });
const PRED = U(1, 'Petar', 'Predsjednik'), LVR = U(2, 'Luka', 'Vođa Krupe'), LOVAC = U(3, 'Lovro', 'Lovac');
const A = U(10, 'Ado', 'Prvi'), B = U(11, 'Beno', 'Drugi'), C = U(12, 'Cero', 'Treći'), E = U(13, 'Edo', 'Otočanin');
const R = { krupa: ID(100), otoka: ID(101) };
const G1 = ID(700);

function server() {
  const db = {
    korisnici: [PRED, LVR, LOVAC, A, B, C, E],
    reviri: [{ id: R.krupa, naziv: 'Krupa', aktivno: true }, { id: R.otoka, naziv: 'Otoka', aktivno: true }],
    sekcije: [
      { id: ID(200), revir_id: R.krupa, naziv: 'Krupa 1', grupovodja_id: null, aktivno: true },
      { id: ID(201), revir_id: R.otoka, naziv: 'Otoka 1', grupovodja_id: null, aktivno: true },
    ],
    grupe: [{ id: G1, sekcija_id: ID(200), grupovodja_id: A.id, dozvola_visih: false }],
    sekcija_clanovi: [
      { sekcija_id: ID(200), korisnik_id: A.id, status: 'odobren', grupa_id: G1 },
      { sekcija_id: ID(200), korisnik_id: B.id, status: 'odobren', grupa_id: G1 },
      { sekcija_id: ID(200), korisnik_id: C.id, status: 'odobren', grupa_id: null },
      { sekcija_id: ID(200), korisnik_id: ID(99), status: 'ceka', grupa_id: null },
      { sekcija_id: ID(201), korisnik_id: E.id, status: 'odobren', grupa_id: null },
    ],
    drustvo_uloge: [{ korisnik_id: PRED.id, uloga: 'predsjednik' }],
    revir_vodje: [{ revir_id: R.krupa, korisnik_id: LVR.id }],
  };
  return { db, async handle(route) {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (route.request().method() === 'GET') return json(db[table] || []);
    return json([]);
  } };
}

async function setup(page, user) {
  const s = server();
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  await page.route(/lazni\.supabase\.test\/rest\/v1\//, (r) => s.handle(r));
  await page.addInitScript((u) => {
    localStorage.setItem('lovac.profil', JSON.stringify(u));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, aud: 'authenticated', role: 'authenticated' } }));
  }, user);
}

async function otvori(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#btn-clanovi')).toBeVisible({ timeout: 20000 });
  await page.locator('#btn-clanovi').click();
  await expect(page.locator('#clanovi-pregled')).toBeVisible();
  await expect(page.locator('#cp-stat-clanova')).not.toHaveText('0');
}

test('Članovi i grupe: predsjednik vidi cijelo društvo (oba revira), brojke, grupe i članove', async ({ page }) => {
  await setup(page, PRED);
  await otvori(page);
  await expect(page.locator('#cp-uloga')).toHaveText('Predsjednik');
  await expect(page.locator('#cp-stat-clanova')).toHaveText('4');
  await expect(page.locator('#cp-stat-grupa')).toHaveText('1');
  await expect(page.locator('#cp-stat-bez')).toHaveText('2');
  await expect(page.locator('#cp-stat-cekaju')).toHaveText('1');
  await expect(page.locator('.cp-revir')).toHaveCount(2);
  await page.locator('#btn-cp-sve').click();
  await expect(page.locator('.cp-grupa h4').first()).toContainText('grupovođa Ado Prvi');
  await expect(page.locator('.cp-clan', { hasText: 'Ado Prvi' })).toContainText('Grupovođa');
  await expect(page.locator('.cp-bez')).toHaveCount(2);
  if (process.env.SNIMCI_DIR) await page.screenshot({ path: `${process.env.SNIMCI_DIR}/clanovi.png` });
});

test('Članovi i grupe: lovovođa revira vidi samo svoj revir; filteri i pretraga sužavaju prikaz', async ({ page }) => {
  await setup(page, LVR);
  await otvori(page);
  await expect(page.locator('#cp-uloga')).toHaveText('Lovovođa revira');
  await expect(page.locator('.cp-revir')).toHaveCount(1);
  await expect(page.locator('.cp-revir')).toContainText('Krupa');
  await expect(page.locator('#cp-stablo')).not.toContainText('Edo');
  await page.locator('#cp-filter [data-f="bez-grupe"]').click();
  await expect(page.locator('.cp-grupa:not(.cp-bez)')).toHaveCount(0);
  await expect(page.locator('.cp-bez')).toContainText('Cero Treći');
  await page.locator('#cp-filter [data-f="svi"]').click();
  await page.locator('#cp-trazi').fill('beno');
  await expect(page.locator('.cp-clan')).toHaveCount(1);
  await expect(page.locator('.cp-clan')).toContainText('Beno Drugi');
});

test('Članovi i grupe: običan lovac nema pločicu u Meniju', async ({ page }) => {
  await setup(page, LOVAC);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.waitForTimeout(8000);
  await expect(page.locator('#btn-clanovi')).toBeHidden();
});
