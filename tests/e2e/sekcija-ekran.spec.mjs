import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

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
  await expect(page.locator('#sekcija-ekran')).toBeVisible();
  await expect(page.locator('#sk-status')).toHaveText('');
  await expect(page.locator('#sk-clanovi [data-uid]').first()).toBeVisible();
}

test('dugme u navigaciji nosi ime sekcije; ekran pokazuje članove i ko je aktivan u tekućem lovu', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openTab(page);
  await expect(page.locator('#btn-sekcija')).toContainText('Krupa 1');
  await expect(page.locator('#sk-naslov')).toHaveText('Krupa 1');
  await expect(page.locator('#sk-podnaslov')).toContainText('Revir Krupa');
  await expect(page.locator('#btn-sekcija')).toHaveAttribute('aria-current', 'page');
  const rows = page.locator('#sk-clanovi [data-uid]');
  await expect(rows).toHaveCount(3);
  // redoslijed: grupovođa prvi
  await expect(rows.first()).toContainText('Goran Grupovođa');
  await expect(rows.first()).toHaveAttribute('data-stanje', 'aktivan');
  await expect(rows.first()).toContainText('Grupovođa');
  await expect(rows.first()).toContainText(/Aktivan u lovu · prije [01] min|Aktivan u lovu · upravo/);
  const pogonic = page.locator(`#sk-clanovi [data-uid="${LOVAC2.id}"]`);
  await expect(pogonic).toHaveAttribute('data-stanje', 'bez-signala');
  await expect(pogonic).toContainText('U lovu, bez signala');
  await expect(pogonic).toContainText('Pogonič');
  const ja = page.locator(`#sk-clanovi [data-uid="${LOVAC.id}"]`);
  await expect(ja).toContainText('(ti)');
  await expect(ja.locator('[data-akcija="poruka"]')).toHaveCount(0);
  // tekući lov
  await expect(page.locator('#sk-lov')).toContainText('Pogon Grmeč');
  await expect(page.locator('#sk-lov')).toContainText('U TOKU');
  await expect(page.locator('#sk-lov')).toContainText('aktivnih sada: 1');
  await expect(page.locator('#sk-lov')).toContainText('Moja uloga: Strijelac, stan 1');
  await expect(page.locator('#sk-lov')).toContainText('Divlja svinja: 1 kom., 85,5 kg');
  // svi podaci
  await expect(page.locator('#sk-podaci')).toContainText('Grupovođa');
  await expect(page.locator('#sk-podaci')).toContainText('Lovova sekcije');
  await expect(page.locator('#sk-podaci li[data-lov]')).toHaveCount(1);
});

test('"Na karti" pomjera mapu na poziciju člana, "Raspored na karti" otvara raspored lova', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openTab(page);
  await page.locator(`#sk-clanovi [data-uid="${GV.id}"] [data-akcija="na-karti"]`).click();
  await expect(page.locator('#sekcija-ekran')).toBeHidden();
  await expect(page.locator('#koord-wgs')).toHaveText(/^44\.88\d*, 16\.15\d*$/);
  await page.locator('#btn-sekcija').click();
  await page.locator('#sk-lov [data-akcija="raspored"]').click();
  await expect(page.locator('#lov-panel')).toBeVisible();
  await expect(page.locator('#lov-panel-naziv')).toContainText('Pogon Grmeč');
});

test('poruke: slanje, brza poruka, "Poruka" članu; offline ostaje u redu i stiže kad server proradi', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openTab(page);
  await expect(page.locator('#sk-poruke')).toContainText('Pogon kreće u 7');
  await page.locator('#sk-brze [data-brza="Stigao sam na stan"]').click();
  await expect(page.locator('#forma-poruka input[name=tekst]')).toHaveValue('Stigao sam na stan');
  await page.locator('#forma-poruka button[type=submit]').click();
  await expect(page.locator('#sk-poruke .poruka-red.moja')).toContainText('Stigao sam na stan');
  await expect.poll(() => server.db.poruke.length).toBe(2);
  expect(server.db.poruke[1]).toMatchObject({ sekcija_id: ID(200), autor_id: LOVAC.id, tekst: 'Stigao sam na stan', lov_id: LOV });
  await expect(page.locator('#sk-poruke')).not.toContainText('čeka slanje');

  server.failPost = true;
  await page.locator(`#sk-clanovi [data-uid="${GV.id}"] [data-akcija="poruka"]`).click();
  await expect(page.locator('#forma-poruka input[name=tekst]')).toHaveValue('Goran Grupovođa: ');
  await page.fill('#forma-poruka input[name=tekst]', 'Goran Grupovođa: kasnim 10 min');
  await page.locator('#forma-poruka button[type=submit]').click();
  await expect(page.locator('#sk-poruke .poruka-red.moja').last()).toContainText('čeka slanje');
  expect(server.db.poruke).toHaveLength(2);

  server.failPost = false;
  await page.locator('#nav-mapa').click();
  await page.locator('#btn-sekcija').click();
  await expect.poll(() => server.db.poruke.length, { timeout: 10000 }).toBe(3);
  await expect(page.locator('#sk-poruke')).not.toContainText('čeka slanje');
  await page.fill('#forma-poruka input[name=tekst]', '   ');
  await page.locator('#forma-poruka button[type=submit]').click();
  await expect(page.locator('#poruka')).toContainText('Upiši poruku');
});

test('nova poruka: značka na dugmetu sekcije i obavijest dok je app otvorena; otvaranje briše značku', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.clock.runFor(6000);
  await expect(page.locator('#btn-sekcija')).toContainText('Krupa 1');
  // stara poruka je nepročitana dok se ekran ne otvori; otvaranje je označi pročitanom
  await expect(page.locator('#nav-sekcija-znacka')).toHaveText('1');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-poruke')).toContainText('Pogon kreće u 7');
  await page.locator('#nav-mapa').click();
  await expect(page.locator('#nav-sekcija-znacka')).toBeHidden();
  server.db.poruke.push({ id: ID(601), sekcija_id: ID(200), autor_id: GV.id, tekst: 'Okupljanje kod kuće', created_at: new Date(Date.now() + 1000).toISOString() });
  await page.clock.runFor(61000);
  await expect(page.locator('#nav-sekcija-znacka')).toHaveText('1');
  const notif = await page.evaluate(() => window.__notif);
  expect(notif.at(-1)).toEqual({ n: 'Krupa 1 — Goran Grupovođa', t: 'Okupljanje kod kuće' });
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-poruke')).toContainText('Okupljanje kod kuće');
  await expect(page.locator('#nav-sekcija-znacka')).toBeHidden();
});

test('lovočuvar revira prati SVE sekcije svog revira (izbor), ne i druge revire; lovac bez pristupa vidi prazan ekran', async ({ page, browser }) => {
  const server = makeServer();
  server.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  await setup(page, server, VAN);
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-izbor')).toBeVisible();
  await expect(page.locator('#sk-izbor option')).toHaveText(['Krupa 1', 'Krupa 2']);
  await expect(page.locator('#sk-podnaslov')).toContainText('lovočuvar revira');
  await expect(page.locator(`#sk-clanovi [data-uid="${VAN.id}"]`)).toHaveCount(1);
  await expect(page.locator('#sk-clanovi [data-uid="' + GV.id + '"]')).toContainText('Aktivan u lovu');
  await page.locator('#sk-izbor').selectOption(ID(201));
  await expect(page.locator('#sk-naslov')).toHaveText('Krupa 2');
  await expect(page.locator('#sk-lov')).toContainText('Nema lova');
  await expect(page.locator('#btn-sekcija')).toContainText('Krupa 2');

  // Lovac koji nije u sekciji: prazan ekran sa putem do zahtjeva.
  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx2.newPage();
  await setup(p2, makeServer(), { ...VAN, id: ID(9), ime: 'Nov', prezime: 'Lovac' });
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-sekcija').click();
  await expect(p2.locator('#sk-prazno')).toBeVisible();
  await expect(p2.locator('#btn-sekcija')).toContainText('Sekcija');
  await p2.locator('#btn-sk-pristup').click();
  await expect(p2.locator('#sekcije')).toBeVisible();
  await ctx2.close();
});

test('dugme Nazad zatvara ekran sekcije', async ({ page }) => {
  await setup(page, makeServer(), LOVAC);
  await openTab(page);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#sekcija-ekran')).toBeHidden();
});
