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

const poz = (server) => server.db.lov_pozicije.filter((p) => p.korisnik_id === LOVAC.id);

test('lov u toku: pozicija se šalje i bez otvorenog rasporeda; ekran lokacije; isključivanje briše poziciju', async ({ page }) => {
  const server = makeServer();
  server.db.lov_pozicije = server.db.lov_pozicije.filter((p) => p.korisnik_id !== LOVAC.id);
  await setup(page, server, LOVAC);
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  await expect.poll(() => poz(server).length, { timeout: 10000 }).toBeGreaterThan(0);
  expect(poz(server)[0]).toMatchObject({ lov_id: LOV, lat: 44.88, lon: 16.15 });
  await expect(page.locator('#uzivo')).toBeVisible();

  await page.locator('#btn-lokacija').click();
  await expect(page.locator('#lokacija-ekran')).toBeVisible();
  await expect(page.locator('#lokacija-lov')).toContainText('Pogon Grmeč');
  // sat je pomjeren: Goran je "svjež" u odnosu na lažni sat
  const fakeNow = await page.evaluate(() => Date.now());
  server.db.lov_pozicije.find((p) => p.korisnik_id === GV.id).t = new Date(fakeNow - 30000).toISOString();
  await page.clock.runFor(21000);
  const goran = page.locator(`#lokacija-clanovi [data-uid="${GV.id}"]`);
  await expect(goran).toHaveAttribute('data-stanje', 'zivo');
  await expect(goran).toContainText(/Dijeli uživo · [A-Z]+ /);
  await expect(page.locator(`#lokacija-clanovi [data-uid="${LOVAC2.id}"]`)).toContainText(/Dijeli|Bez signala|Ne dijeli/);
  // marker sa inicijalima na mapi
  await expect(page.locator('.uc-marker').first()).toContainText('GG');
  // dodir na marker kolege: ime i prezime + udaljenost od mene
  await page.locator('.uc-marker').first().evaluate((el) => el.click());
  await expect(page.locator('.leaflet-popup .kolega-kartica')).toContainText('Goran');
  await expect(page.locator('.leaflet-popup .kolega-kartica')).toContainText(/ od tebe/);

  await page.locator('#lokacija-interval [data-interval="stedi"]').click();
  await expect(page.locator('#lokacija-interval [data-interval="stedi"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#lokacija-prekidac').click();
  await expect(page.locator('#lokacija-prekidac')).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => poz(server).length).toBe(0);
  await expect(page.locator('#lokacija-moje')).toHaveText('Drugi ne vide gdje si.');
  // dok je isključeno, nova slanja nema
  await page.clock.runFor(130000);
  expect(poz(server)).toHaveLength(0);

  await page.locator('#lokacija-prekidac').click();
  await expect.poll(() => poz(server).length, { timeout: 10000 }).toBeGreaterThan(0);
});

test('lokacija: "Na karti" pomjera mapu na člana', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  await page.locator('#btn-lokacija').click();
  await page.locator(`#lokacija-clanovi [data-uid="${GV.id}"] [data-akcija="na-karti"]`).click();
  await expect(page.locator('#lokacija-ekran')).toBeHidden();
  await expect(page.locator('#koord-gk')).toHaveText(/^44\.88\d*, 16\.15\d*$/);
});

test('status: GPS tačnost je u ploči Moja lokacija, svjetlo u Postavkama; veza OK se ne prikazuje na mapi', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await expect(page.locator('#veza')).toBeHidden();
  await expect(page.locator('#svjetlo-chip')).toBeHidden();
  expect(await page.locator('#postavke #svjetlo-chip').count()).toBe(1);
  expect(await page.locator('#lok-ploca #gps-status').count()).toBe(1);
  expect(await page.locator('#postavke #gps-status').count()).toBe(0);
});
