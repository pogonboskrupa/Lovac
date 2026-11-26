import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const GV = { id: ID(2), ime: 'Goran', prezime: 'Lovovođa sekcije', odobren: true, is_admin: false };
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
      if (req.method() === 'PATCH') {
        const patch = req.postDataJSON();
        rows.filter((r) => match(r, url.searchParams)).forEach((r) => Object.assign(r, patch));
      }
      if (req.method() === 'DELETE') {
        db[table] = rows.filter((r) => !match(r, url.searchParams));
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



async function openTab(page) {
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-clanovi [data-uid]').first()).toBeVisible();
}


const ping = (id, od, za, minAgo, extra = {}) => ({ id, sekcija_id: ID(200), od_id: od, za_id: za, created_at: new Date(Date.now() - minAgo * 60000).toISOString(), odgovor: null, ...extra });
const ime = (u) => `${u.ime} ${u.prezime}`;

test('Gdje si?: član pita drugog člana; dugme nema uz sebe', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openTab(page);
  await expect(page.locator(`#sk-clanovi [data-uid="${LOVAC.id}"] [data-akcija="ping"]`)).toHaveCount(0);
  await page.locator(`#sk-clanovi [data-uid="${LOVAC2.id}"] [data-akcija="ping"]`).click();
  await expect.poll(() => server.db.lokacija_zahtjevi?.length).toBe(1);
  expect(server.db.lokacija_zahtjevi[0]).toMatchObject({ od_id: LOVAC.id, za_id: LOVAC2.id, sekcija_id: ID(200), odgovor: null });
  await expect(page.locator('#poruka')).toContainText('Pitanje poslano');
  // isti lovac odmah ponovo: lokalna zaštita, ništa novo ne ide
  await page.locator(`#sk-clanovi [data-uid="${LOVAC2.id}"] [data-akcija="ping"]`).click();
  await expect(page.locator('#poruka')).toContainText('Već si pitao');
  expect(server.db.lokacija_zahtjevi).toHaveLength(1);
});

test('Gdje si?: primalac dobija dijalog, "Da" uključuje dijeljenje sa sekcijom na 1 h', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.88, longitude: 16.15, accuracy: 5 });
  const server = makeServer();
  server.db.lokacija_zahtjevi = [ping(ID(800), LOVAC.id, LOVAC2.id, 1)];
  await setup(page, server, LOVAC2);
  await openTab(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('ping:osvjezi')));
  await expect(page.locator('#ping-dijalog')).toBeVisible();
  await expect(page.locator('#ping-tekst')).toHaveText(`${ime(LOVAC)} traži tvoju lokaciju.`);
  expect(await page.evaluate(() => window.__notif.some((x) => x.n === 'Gdje si?'))).toBe(true);
  await page.locator('#btn-ping-da').click();
  await expect(page.locator('#ping-dijalog')).toBeHidden();
  expect(server.db.lokacija_zahtjevi[0].odgovor).toBe('da');
  const sh = await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.sekcija_dijeljenje')));
  expect(sh.sekcijaId).toBe(ID(200));
  expect(sh.do - Date.now()).toBeGreaterThan(55 * 60000);
  expect(sh.do - Date.now()).toBeLessThanOrEqual(60 * 60000);
  await expect.poll(() => server.db.sekcija_lokacije?.length, { timeout: 8000 }).toBe(1);
});

test('Gdje si?: "Ne" ne pokreće dijeljenje; istekao zahtjev se ne prikazuje', async ({ page }) => {
  const server = makeServer();
  server.db.lokacija_zahtjevi = [ping(ID(801), LOVAC.id, LOVAC2.id, 2), ping(ID(802), GV.id, LOVAC2.id, 40)];
  await setup(page, server, LOVAC2);
  await openTab(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('ping:osvjezi')));
  await expect(page.locator('#ping-dijalog')).toBeVisible();
  await expect(page.locator('#ping-tekst')).toContainText(ime(LOVAC));
  await page.locator('#btn-ping-ne').click();
  await expect(page.locator('#ping-dijalog')).toBeHidden();
  expect(server.db.lokacija_zahtjevi.find((r) => r.id === ID(801)).odgovor).toBe('ne');
  expect(server.db.lokacija_zahtjevi.find((r) => r.id === ID(802)).odgovor).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('lovac.sekcija_dijeljenje'))).toBeNull();
});

test('Gdje si?: pošiljalac dobija obavijest o odgovoru (jednom)', async ({ page }) => {
  const server = makeServer();
  server.db.lokacija_zahtjevi = [ping(ID(803), LOVAC.id, LOVAC2.id, 3, { odgovor: 'ne', odgovoreno: new Date().toISOString() })];
  await setup(page, server, LOVAC);
  await openTab(page);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('ping:osvjezi')));
  await expect(page.locator('#poruka')).toContainText('odgovorio: NE');
  await expect.poll(() => page.evaluate(() => window.__notif.filter((x) => x.n === 'Gdje si?').length)).toBe(1);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('ping:osvjezi')));
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__notif.filter((x) => x.n === 'Gdje si?').length)).toBe(1);
});
