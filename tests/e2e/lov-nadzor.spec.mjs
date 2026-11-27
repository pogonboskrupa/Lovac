import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const U = (n, ime, prezime, extra = {}) => ({ id: ID(n), ime, prezime, odobren: true, is_admin: false, ...extra });
const PRED = U(1, 'Petar', 'Predsjednik'), LOVAC = U(3, 'Lovro', 'Lovac'), A = U(10, 'Ado', 'Prvi'), B = U(11, 'Beno', 'Drugi');
const R = { krupa: ID(100) };
const G1 = ID(700);
const LOV = ID(900);

function server(status) {
  const db = {
    korisnici: [PRED, LOVAC, A, B],
    reviri: [{ id: R.krupa, naziv: 'Krupa', aktivno: true }],
    sekcije: [{ id: ID(200), revir_id: R.krupa, naziv: 'Krupa 1', grupovodja_id: null, aktivno: true }],
    grupe: [{ id: G1, sekcija_id: ID(200), grupovodja_id: A.id, dozvola_visih: false }],
    sekcija_clanovi: [{ sekcija_id: ID(200), korisnik_id: A.id, status: 'odobren', grupa_id: G1 }, { sekcija_id: ID(200), korisnik_id: B.id, status: 'odobren', grupa_id: G1 },
      { sekcija_id: ID(200), korisnik_id: LOVAC.id, status: 'odobren', grupa_id: G1 }],
    drustvo_uloge: [{ korisnik_id: PRED.id, uloga: 'predsjednik' }],
    revir_vodje: [],
    lovovi: [{ id: LOV, naziv: 'Pogon Grmeč', status, revir_id: R.krupa, sekcija_id: ID(200), grupa_id: G1, pocetak: new Date(Date.now() - 3600e3).toISOString(), organizator_id: A.id, promijenjeno: new Date().toISOString() }],
    lov_ucesnici: [{ lov_id: LOV, korisnik_id: A.id, uloga: 'vodja' }, { lov_id: LOV, korisnik_id: B.id, uloga: 'strijelac' }, { lov_id: LOV, korisnik_id: LOVAC.id, uloga: 'pogonic' }],
  };
  return { async handle(route) {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (route.request().method() === 'GET') return json(db[table] || []);
    return json([]);
  } };
}

async function setup(page, user, status) {
  const s = server(status);
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

test('vodstvo: tab "Lov" se pojavi dok traje lov u opsegu i pokazuje lov, grupu i učesnike', async ({ page }) => {
  await setup(page, PRED, 'u_toku');
  await page.goto('/');
  const tab = page.locator('#btn-lov-nadzor');
  await expect(tab).toBeVisible({ timeout: 30000 });
  await tab.click();
  await expect(page.locator('#lov-nadzor')).toBeVisible();
  const kartica = page.locator('#lnz-sadrzaj .ln-lov');
  await expect(kartica).toHaveCount(1);
  await expect(kartica).toContainText('Pogon Grmeč');
  await expect(kartica).toContainText('grupa — grupovođa Ado Prvi');
  await expect(page.locator('#lnz-stat-lovaca')).toHaveText('3');
  await expect(tab).toHaveAttribute('aria-current', 'page');
  await page.locator('#btn-lnz-zatvori').click();
  await expect(page.locator('#lov-nadzor')).toBeHidden();
});

test('tab "Lov" se ne vidi lovcu, ni vodstvu kad lov nije u toku', async ({ page, browser }) => {
  await setup(page, LOVAC, 'u_toku');
  await page.goto('/');
  await page.waitForTimeout(6000);
  await expect(page.locator('#btn-lov-nadzor')).toBeHidden();
  const p2 = await browser.newPage();
  await setup(p2, PRED, 'planiran');
  await p2.goto('/');
  await p2.waitForTimeout(6000);
  await expect(p2.locator('#btn-lov-nadzor')).toBeHidden();
  await p2.close();
});
