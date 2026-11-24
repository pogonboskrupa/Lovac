import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG, lok } from './helpers.mjs';

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
        for (const r of [].concat(req.postDataJSON())) { const ex = rows.find((x) => x.id && x.id === r.id); if (ex) Object.assign(ex, r); else rows.push({ id: ID(++n), ...r }); }
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

const idb = (page, store) => page.evaluate((s) => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => resolve(q.result); };
}), store);

test('tokom snimanja traga: tačka sa nazivom i slika vezana za trag; sve ostaje u zapisu traga', async ({ page, context }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(300);
    await context.setGeolocation({ latitude: 44.88 + i * 0.0005, longitude: 16.15, accuracy: 5 });
  }
  await expect.poll(async () => Number(await page.locator('#snim-tacke').innerText())).toBeGreaterThanOrEqual(2);

  await page.locator('#btn-snim-tacka').click();
  await page.fill('#tacka-naziv', 'Stan kod hrasta');
  await page.locator('#btn-tacka-sacuvaj').click();
  await expect(page.locator('#snim-krv')).toContainText('tačke: 1');
  await expect(page.locator('.oznaka-tacka')).toHaveCount(1);
  await page.locator('#btn-snim-tacka').click();
  await page.locator('#btn-tacka-sacuvaj').click(); // bez naziva: "Tačka 2"
  await expect(page.locator('#snim-krv')).toContainText('tačke: 2');

  await page.locator('#btn-snim-slika').click();
  await expect(page.locator('#slika-naslov')).toHaveText('Slika na tragu');
  await page.locator('#slika-ulaz').setInputFiles({ name: 'trag.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#slika-pregled-mala img')).toBeVisible();
  await page.locator('#btn-slika-sacuvaj').click();
  await expect(page.locator('.slika-marker img')).toBeVisible();

  await page.locator('#btn-snim-stop').click();
  await page.locator('#btn-snim-stop').click();
  await expect.poll(async () => (await idb(page, 'tragovi')).length).toBe(1);
  const [trag] = await idb(page, 'tragovi');
  expect(trag.tackeInteresa.map((w) => w.naziv)).toEqual(['Stan kod hrasta', 'Tačka 2']);
  const [slika] = await idb(page, 'slike');
  expect(slika.trag_id).toBe(trag.id);
});

async function sekcijeLoaded(page) {
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  // lovočuvar/admin: spisak lovaca je zadano sklopljen (v1.1.5) — čekamo da su lovci nacrtani
  await expect(page.locator('#sk-clanovi [data-uid]').first()).toBeAttached();
  await page.locator('#nav-mapa').click();
}

test('kamere: lovočuvar revira ih postavlja (lokalno pa na server), vidi na karti i skida; niko drugi ne vidi ni dugme ni marker', async ({ page, browser }) => {
  const server = makeServer();
  server.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  server.db.kamere = [];
  await setup(page, server, VAN);
  await sekcijeLoaded(page);
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#btn-dodaj-kameru')).toBeVisible();
  await page.locator('#btn-dodaj-kameru').click();
  await expect(page.locator('#kamera-forma')).toBeVisible();
  await expect(page.locator('#kamera-revir option')).toHaveText(['Krupa']);
  await page.locator('#btn-kamera-sacuvaj').click();
  await expect(page.locator('#kamera-status')).toHaveText('Upiši naziv kamere');
  await page.fill('#forma-kamera [name=naziv]', 'Kamera Vrh');
  await page.fill('#forma-kamera [name=napomena]', 'prema hranilištu');
  await page.locator('#btn-kamera-sacuvaj').click();
  await expect(page.locator('#kamera-forma')).toBeHidden();
  await expect.poll(() => server.db.kamere.length).toBe(1);
  expect(server.db.kamere[0]).toMatchObject({ naziv: 'Kamera Vrh', revir_id: R.krupa, lat: 44.88, lon: 16.15, aktivno: true, autor_id: VAN.id });
  expect(server.db.kamere[0]).not.toHaveProperty('sinhronizovano');

  await page.locator('.kamera-marker').click();
  await expect(page.locator('.kamera-popup')).toContainText('Kamera Vrh');
  await expect(page.locator('.kamera-popup')).toContainText('prema hranilištu');
  const skini = page.locator('.kamera-popup [data-akcija="skini"]');
  await skini.click();
  await skini.click();
  await expect.poll(() => server.db.kamere[0].aktivno).toBe(false);
  await expect(page.locator('.kamera-marker')).toHaveCount(0);

  // grupovođa: nema dugmeta i, i da server pogrešno vrati redove, nema markera (klijent ih ne crta)
  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx2.newPage();
  const server2 = makeServer();
  server2.db.kamere = [{ id: ID(990), revir_id: R.krupa, naziv: 'Tajna', lat: 44.88, lon: 16.15, aktivno: true, autor_id: VAN.id }];
  await setup(p2, server2, GV);
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-sekcija').click();
  await expect(p2.locator('#sk-clanovi [data-uid]').first()).toBeVisible();
  await p2.locator('#nav-mapa').click();
  await p2.locator('#btn-dodaj').click();
  await expect(p2.locator('#btn-dodaj-kameru')).toBeHidden();
  await expect(p2.locator('.kamera-marker')).toHaveCount(0);
  await ctx2.close();
});
