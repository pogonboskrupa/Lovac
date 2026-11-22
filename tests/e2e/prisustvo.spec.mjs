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

function planned(server) {
  server.db.lovovi[0].status = 'planiran';
  server.db.lov_ucesnici = [{ lov_id: LOV, korisnik_id: GV.id, uloga: 'vodja', samoprijava: false }];
  server.db.lov_pozicije = [];
}

test('grupovođa pravi lov za danas jednim dodirom i upisuje sebe kao vođu', async ({ page }) => {
  const server = makeServer();
  server.db.lovovi = [];
  server.db.lov_ucesnici = [];
  await setup(page, server, GV);
  await openTab(page);
  await page.locator('#sk-lov [data-akcija="lov-novi"]').click();
  await expect.poll(() => server.db.lovovi.length + server.db.lov_ucesnici.length).toBe(2);
  expect(server.db.lovovi[0]).toMatchObject({ sekcija_id: ID(200), revir_id: R.krupa, status: 'planiran' });
  expect(server.db.lovovi[0].naziv).toMatch(/^Krupa 1 — \d\d\.\d\d\.\d{4}\.$/);
  expect(server.db.lov_ucesnici[0]).toMatchObject({ korisnik_id: GV.id, uloga: 'vodja' });
  await expect(page.locator('#sk-lov [data-prisutni] li')).toHaveCount(1);
  await expect(page.locator('#sk-lov [data-akcija="lov-pokreni"]')).toBeVisible();
});

test('član javlja da je prisutan i može se odjaviti; grupovođa ga vidi kao "prijavio se sam"', async ({ page }) => {
  const server = makeServer();
  planned(server);
  await setup(page, server, LOVAC);
  await openTab(page);
  await expect(page.locator('#sk-lov [data-akcija="lov-novi"]')).toHaveCount(0);
  await expect(page.locator('#sk-lov [data-prisutni]')).toHaveCount(0);
  await page.locator('#sk-lov [data-akcija="lov-prijavi"]').click();
  await expect.poll(() => server.db.lov_ucesnici.length).toBe(2);
  expect(server.db.lov_ucesnici[1]).toMatchObject({ lov_id: LOV, korisnik_id: LOVAC.id, uloga: 'strijelac', samoprijava: true });
  await expect(page.locator('#sk-lov')).toContainText('Moja uloga: Strijelac');
  await page.locator('#sk-lov [data-akcija="lov-odjavi"]').click();
  await expect.poll(() => server.db.lov_ucesnici.length).toBe(1);
  await expect(page.locator('#sk-lov [data-akcija="lov-prijavi"]')).toBeVisible();
});

test('grupovođa uklanja neprisutnog (drugi dodir), dodaje člana sa spiska i pokreće lov', async ({ page }) => {
  const server = makeServer();
  planned(server);
  server.db.lov_ucesnici.push({ lov_id: LOV, korisnik_id: LOVAC.id, uloga: 'strijelac', samoprijava: true });
  await setup(page, server, GV);
  await openTab(page);
  const row = page.locator(`#sk-lov [data-prisutni] [data-uid="${LOVAC.id}"]`);
  await expect(row).toContainText('prijavio se sam');
  await row.locator('[data-akcija="lov-ukloni"]').click();
  expect(server.db.lov_ucesnici).toHaveLength(2); // prvi dodir samo traži potvrdu
  await expect(row.locator('[data-akcija="lov-ukloni"]')).toHaveText('Dodirni ponovo');
  await row.locator('[data-akcija="lov-ukloni"]').click();
  await expect.poll(() => server.db.lov_ucesnici.length).toBe(1);
  await expect(page.locator(`#sk-lov [data-prisutni] [data-uid="${LOVAC.id}"]`)).toHaveCount(0);

  await page.locator(`#sk-lov [data-spisak] input[value="${LOVAC2.id}"]`).check();
  await page.locator('#sk-lov [data-akcija="lov-dodaj"]').click();
  await expect.poll(() => server.db.lov_ucesnici.length).toBe(2);
  expect(server.db.lov_ucesnici.at(-1)).toMatchObject({ korisnik_id: LOVAC2.id, uloga: 'strijelac' });
  await expect(page.locator(`#sk-lov [data-prisutni] [data-uid="${LOVAC2.id}"]`)).toBeVisible();

  await page.locator('#sk-lov [data-akcija="lov-pokreni"]').click();
  await expect.poll(() => server.db.lovovi[0].status).toBe('u_toku');
  await expect(page.locator('#sk-lov')).toContainText('U TOKU');
  await page.locator('#sk-lov [data-akcija="lov-zavrsi"]').click();
  await expect.poll(() => server.db.lovovi[0].status).toBe('zavrsen');
});

test('lovočuvar revira prati lov, ali ga ne vodi: nema dugmadi za prijavu ni upravljanje', async ({ page }) => {
  const server = makeServer();
  planned(server);
  server.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  await setup(page, server, VAN);
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-lov')).toContainText('Raspored na karti');
  await expect(page.locator('#sk-lov [data-akcija="lov-prijavi"]')).toHaveCount(0);
  await expect(page.locator('#sk-lov [data-akcija="lov-pokreni"]')).toHaveCount(0);
  await expect(page.locator('#sk-lov [data-prisutni]')).toHaveCount(0);
});
