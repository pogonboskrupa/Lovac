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



test.use({ geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });

async function openLok(page) {
  await page.goto('/');
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible();
}

test('Moja lokacija: ploča pokazuje koordinate u izabranom sistemu i prati dodir na okvir', async ({ page }) => {
  await setup(page, makeServer(), LOVAC);
  await openLok(page);
  await expect(page.locator('#lok-oznaka')).toHaveText('WGS84');
  await expect(page.locator('#lok-koord')).toHaveText(/^44\.88\d*, 16\.15\d*$/);
  await page.locator('#koord-traka').click();
  await expect(page.locator('#lok-oznaka')).toHaveText('MGI 5');
  await expect(page.locator('#lok-koord')).toHaveText(/^Y 55\d{5}, X 49\d{5}$/);
});

test('član dijeli lokaciju sa sekcijom na izabrano vrijeme i prekida je (red se briše sa servera)', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_lokacije = [];
  await setup(page, server, LOVAC);
  await openLok(page);
  await expect(page.locator('#lok-sek-forma')).toBeVisible();
  await expect(page.locator('#lok-sek-prekidac')).toContainText('Počni dijeliti sa: Krupa 1');
  await page.locator('#lok-sek-trajanje [data-trajanje="4"]').click();
  const before = Date.now();
  await page.locator('#lok-sek-prekidac').click();
  await expect(page.locator('#lok-sek-prekidac')).toHaveText('Prekini dijeljenje');
  await expect(page.locator('#lok-sek-stanje')).toContainText('Dijeliš lokaciju sa sekcijom Krupa 1 do');
  await expect.poll(() => server.db.sekcija_lokacije.length).toBeGreaterThan(0);
  const row = server.db.sekcija_lokacije[0];
  expect(row).toMatchObject({ sekcija_id: ID(200), korisnik_id: LOVAC.id, lat: 44.88, lon: 16.15 });
  const hours = (Date.parse(row.do_) - before) / 3600000;
  expect(hours).toBeGreaterThan(3.9);
  expect(hours).toBeLessThan(4.1);
  // dok dijeli, dugme "Moja lokacija" na karti trepće tirkizno-crveno i blago podrhtava
  const dugme = page.locator('#btn-moja-lokacija');
  await expect(dugme).toHaveClass(/dijeli-lokaciju/);
  expect(await dugme.evaluate((b) => getComputedStyle(b).animationName)).toContain('dijeli-boja');
  await page.locator('#lok-sek-prekidac').click();
  await expect(page.locator('#lok-sek-prekidac')).toContainText('Počni dijeliti');
  await expect(dugme).not.toHaveClass(/dijeli-lokaciju/);
  // isti prekidač "Dijeli lokaciju" u ploči (izvan lova): zadano isključen, pali i gasi dijeljenje sa sekcijom
  const sw = page.locator('#btn-lok-auto');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#lok-auto-stanje')).toContainText('Krupa 1');
  await expect.poll(() => server.db.sekcija_lokacije.length).toBeGreaterThan(0);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => server.db.sekcija_lokacije.length).toBe(0);
  await expect.poll(() => server.db.sekcija_lokacije.length).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('lovac.sekcija_dijeljenje'))).toBe('null');
});

test('lokacije članova koji dijele: spisak u ploči, marker na karti i "Na karti"; istekle se ne vide', async ({ page }) => {
  const server = makeServer();
  const now = Date.now();
  server.db.sekcija_lokacije = [
    { sekcija_id: ID(200), korisnik_id: GV.id, lat: 44.882, lon: 16.152, t: new Date(now - 60000).toISOString(), do_: new Date(now + 3600000).toISOString() },
    { sekcija_id: ID(200), korisnik_id: LOVAC2.id, lat: 44.9, lon: 16.2, t: new Date(now - 60000).toISOString(), do_: new Date(now - 1000).toISOString() },
  ];
  await setup(page, server, LOVAC);
  await openLok(page);
  await expect(page.locator('#lok-sek-lista [data-uid]')).toHaveCount(1);
  await expect(page.locator(`#lok-sek-lista [data-uid="${GV.id}"]`)).toContainText('Goran Grupovođa');
  await expect(page.locator('#lok-sek-broj')).toHaveText('(1)');
  await expect(page.locator('.sek-marker')).toHaveText('GG');
  await page.locator('.sek-marker').evaluate((el) => el.click());
  await expect(page.locator('.leaflet-popup .kolega-kartica')).toContainText('Goran Grupovođa');
  await expect(page.locator('.leaflet-popup .kolega-kartica')).toContainText(/ od tebe/);
  await page.locator(`#lok-sek-lista [data-uid="${GV.id}"] [data-akcija="na-karti"]`).click();
  await expect(page.locator('#lok-ploca')).toBeHidden();
  await expect(page.locator('#koord-gk')).toHaveText(/^44\.882\d*, 16\.152\d*$/);
});

test('lovočuvar revira vidi ko dijeli, ali ne dijeli sam; vanjski korisnik nema ni jedno ni drugo', async ({ page, browser }) => {
  const server = makeServer();
  const now = Date.now();
  server.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  server.db.sekcija_lokacije = [{ sekcija_id: ID(200), korisnik_id: GV.id, lat: 44.882, lon: 16.152, t: new Date(now - 60000).toISOString(), do_: new Date(now + 3600000).toISOString() }];
  await setup(page, server, VAN);
  await openLok(page);
  await expect(page.locator('#lok-sek-forma')).toBeHidden();
  await expect(page.locator('#lok-sek-nema')).toBeVisible();
  await expect(page.locator('#lok-sek-lista [data-uid]')).toHaveCount(1);
});
