import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GV = { id: ID(2), ime: 'Goran', prezime: 'Grupovođa', odobren: true, is_admin: false };
const LOVAC = { id: ID(3), ime: 'Lovro', prezime: 'Lovac', odobren: true, is_admin: false };
const LOVAC2 = { id: ID(4), ime: 'Luka', prezime: 'Pogonič', odobren: true, is_admin: false };
const VAN = { id: ID(5), ime: 'Vanja', prezime: 'Van', odobren: true, is_admin: false };
const R = { krupa: ID(100), otoka: ID(101) };
const LOV = ID(300);

function makeServer({ pozicije = true } = {}) {
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
  const db = {
    korisnici: [GV, LOVAC, LOVAC2, VAN],
    reviri: [{ id: R.krupa, naziv: 'Krupa', aktivno: true }, { id: R.otoka, naziv: 'Otoka', aktivno: true }],
    grupovodje: [{ korisnik_id: GV.id, revir_id: R.krupa }],
    revir_lovocuvari: [],
    sekcije: [
      { id: ID(200), revir_id: R.krupa, naziv: 'Krupa 1', grupovodja_id: GV.id, aktivno: true },
      { id: ID(201), revir_id: R.krupa, naziv: 'Krupa 2', grupovodja_id: null, aktivno: true },
      { id: ID(202), revir_id: R.otoka, naziv: 'Otoka 1', grupovodja_id: null, aktivno: true },
    ],
    sekcija_clanovi: [
      { sekcija_id: ID(200), korisnik_id: LOVAC.id, status: 'odobren' },
      { sekcija_id: ID(200), korisnik_id: LOVAC2.id, status: 'odobren' },
    ],
    lovovi: [{ id: LOV, revir_id: R.krupa, sekcija_id: ID(200), naziv: 'Pogon Grmeč', datum: new Date().toISOString().slice(0, 10), status: 'u_toku', organizator_id: GV.id }],
    lov_ucesnici: [
      { lov_id: LOV, korisnik_id: GV.id, uloga: 'vodja' },
      { lov_id: LOV, korisnik_id: LOVAC.id, uloga: 'strijelac' },
      { lov_id: LOV, korisnik_id: LOVAC2.id, uloga: 'pogonic' },
    ],
    stanovi: [{ id: ID(400), lov_id: LOV, broj: 1, lat: 44.88, lon: 16.15, korisnik_id: LOVAC.id }],
    sektori: [],
    lov_pozicije: pozicije ? [
      { lov_id: LOV, korisnik_id: GV.id, lat: 44.881, lon: 16.151, t: ago(1) },
      { lov_id: LOV, korisnik_id: LOVAC2.id, lat: 44.882, lon: 16.152, t: ago(30) },
    ] : [],
    lov_odstrel: [{ id: ID(500), lov_id: LOV, korisnik_id: LOVAC.id, vrsta: 'divlja_svinja', tezina: 85.5, vrijeme: ago(20) }],
    sos: [],
    poruke: [{ id: ID(600), sekcija_id: ID(200), autor_id: GV.id, tekst: 'Pogon kreće u 7', created_at: ago(120) }],
  };
  let n = 1000;
  const match = (row, params) => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(row[k]));
    return true;
  });
  return {
    db, failPost: false,
    async handle(route) {
      const req = route.request();
      const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const rows = db[table] || (db[table] = []);
      if (req.method() === 'GET') return json(200, rows.filter((r) => match(r, url.searchParams)));
      if (req.method() === 'POST') {
        if (this.failPost) return json(503, { message: 'server nedostupan' });
        for (const r of [].concat(req.postDataJSON())) if (!rows.some((x) => x.id && x.id === r.id)) rows.push({ id: ID(++n), ...r });
        return json(201, []);
      }
      if (req.method() === 'DELETE') {
        const keep = rows.filter((r) => !match(r, url.searchParams));
        this.deleted = (this.deleted || 0) + (rows.length - keep.length);
        db[table] = keep;
      }
      return route.fulfill({ status: 204, body: '' });
    },
  };
}

async function setup(page, server, user) {
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  await page.route(/lazni\.supabase\.test\/rest\/v1\//, (r) => server.handle(r));
  await page.addInitScript((u) => {
    window.__notif = [];
    window.AndroidNotif = { prikazi: (n, t) => window.__notif.push({ n, t }), vibriraj: () => {} };
    localStorage.setItem('lovac.profil', JSON.stringify(u));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, aud: 'authenticated', role: 'authenticated' } }));
  }, user);
}



test.use({ geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });

async function startApp(page, user) {
  const server = makeServer();
  await setup(page, server, user);
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  await expect(page.locator('#btn-tok')).toBeVisible();
  return server;
}

test('tok lova: učesnik javlja status; offline čeka slanje; komandu vođe prima kao baner', async ({ page }) => {
  const server = await startApp(page, LOVAC);
  await page.locator('#btn-tok').click();
  await expect(page.locator('#tok-ekran')).toBeVisible();
  await expect(page.locator('#tok-stanje')).toHaveText('Pogon još nije počeo.');
  await expect(page.locator('#tok-vodja')).toBeHidden();
  await expect(page.locator(`#tok-ucesnici [data-uid="${LOVAC.id}"]`)).toContainText('Nije se javio');

  await page.locator('#tok-moje [data-vrsta="na_stanu"]').click();
  await expect.poll(() => (server.db.lov_dogadjaji || []).length).toBe(1);
  expect(server.db.lov_dogadjaji[0]).toMatchObject({ lov_id: LOV, autor_id: LOVAC.id, vrsta: 'na_stanu', lat: 44.88 });
  await expect(page.locator('#tok-moje [data-vrsta="na_stanu"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`#tok-ucesnici [data-uid="${LOVAC.id}"]`)).toContainText('Na stanu');

  server.failPost = true;
  await page.locator('#tok-moje [data-vrsta="pauza"]').click();
  await expect(page.locator('#tok-linija li').first()).toContainText('čeka slanje');
  expect(server.db.lov_dogadjaji).toHaveLength(1);
  server.failPost = false;
  await page.clock.runFor(16000);
  await expect.poll(() => server.db.lov_dogadjaji.length).toBe(2);
  await expect(page.locator('#tok-linija')).not.toContainText('čeka slanje');

  // vođa prekida lov
  const fakeNow = await page.evaluate(() => Date.now());
  server.db.lov_dogadjaji.push({ id: ID(900), lov_id: LOV, autor_id: GV.id, vrsta: 'prekid', tekst: 'Vuk u pogonu', created_at: new Date(fakeNow).toISOString() });
  await page.clock.runFor(16000);
  await expect(page.locator('#tok-baner')).toBeVisible();
  await expect(page.locator('#tok-baner-tekst')).toContainText('PREKID LOVA');
  await expect(page.locator('#tok-baner-tekst')).toContainText('Vuk u pogonu');
  await expect(page.locator('#tok-stanje')).toContainText('LOV PREKINUT');
  await expect(page.locator('#btn-tok')).toHaveText('PREKID');
  const notif = await page.evaluate(() => window.__notif);
  expect(notif.at(-1).n).toBe('Lov');
  await page.locator('#btn-tok-baner-ok').click();
  await expect(page.locator('#tok-baner')).toBeHidden();
});

test('tok lova: vođa vidi komande; dvostruki dodir šalje početak pogona', async ({ page }) => {
  const server = await startApp(page, GV);
  await page.locator('#btn-tok').click();
  await expect(page.locator('#tok-vodja')).toBeVisible();
  const btn = page.locator('#tok-vodja [data-vrsta="pocetak_pogona"]');
  await page.fill('#tok-tekst', 'Idemo od potoka');
  await btn.click();
  expect(server.db.lov_dogadjaji || []).toHaveLength(0);
  await btn.click();
  await expect.poll(() => (server.db.lov_dogadjaji || []).length).toBe(1);
  expect(server.db.lov_dogadjaji[0]).toMatchObject({ vrsta: 'pocetak_pogona', autor_id: GV.id, tekst: 'Idemo od potoka' });
  await expect(page.locator('#tok-stanje')).toContainText('Pogon u toku od');
  await expect(page.locator('#btn-tok')).toHaveText('Pogon');
});

test('PREKID: uz server otvara se i SMS sa brojevima učesnika (bez mog)', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, GV);
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\/lov_telefoni/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([
      { korisnik_id: GV.id, telefon: '+387 61 000 111' },
      { korisnik_id: LOVAC.id, telefon: '+387 61 222 333' },
      { korisnik_id: LOVAC2.id, telefon: '+387 62 444 555' },
    ]),
  }));
  await page.addInitScript(() => { window.__sms = []; window.AndroidSms = { posalji: (n, t) => window.__sms.push({ n, t }) }; });
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  await page.locator('#btn-tok').click();
  await page.fill('#tok-tekst', 'Vuk u pogonu');
  const btn = page.locator('#tok-vodja [data-vrsta="prekid"]');
  await btn.click();
  await btn.click();
  await expect.poll(() => page.evaluate(() => window.__sms.length)).toBe(1);
  const [sms] = await page.evaluate(() => window.__sms);
  expect(sms.n).toBe('+38761222333;+38762444555');
  expect(sms.t).toContain('PREKID LOVA "Pogon Grmeč"');
  expect(sms.t).toContain('Vuk u pogonu');
  expect(server.db.lov_dogadjaji.at(-1).vrsta).toBe('prekid');
});

test('pregled stana: sigurnost, udaljenost, vjetar i svjetlo u jednom pogledu', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  await page.evaluate((id) => document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id } })), LOV);
  await expect(page.locator('#lov-panel')).toBeVisible();
  await page.locator('#btn-lov-stan').click();
  await expect(page.locator('#stan-ekran')).toBeVisible();
  await expect(page.locator('#stan-naslov-broj')).toHaveText('Stan 1');
  await expect(page.locator('#stan-udaljenost')).toHaveText('Na stanu');
  await expect(page.locator('#stan-sigurnost')).toContainText('Kompas nije dostupan');
  await expect(page.locator('#stan-vjetar')).toContainText('Nema prognoze vjetra');
  await expect(page.locator('#stan-svjetlo')).not.toHaveText('');
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#stan-ekran')).toBeHidden();
});
