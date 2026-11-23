import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG } from './helpers.mjs';

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



test.use({ timezoneId: 'Europe/Sarajevo', viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });

const seed = (page, store, rows) => page.evaluate(([s, r]) => new Promise((resolve) => {
  const q = indexedDB.open('lovac');
  q.onsuccess = () => { const tx = q.result.transaction(s, 'readwrite'); r.forEach((x) => tx.objectStore(s).put(x)); tx.oncomplete = resolve; };
}), [store, rows]);

test('Moji tragovi: pregled (broj, km, sati), filter po vrsti, pretraga i kartice sa vrstom traga', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.goto('/');
  const T = Date.now();
  await seed(page, 'tragovi', [
    { id: 't1', naziv: 'Obilazak Vrh', status: 'gotovo', vrsta: 'obilazak', start: T - 7200000, kraj: T - 3600000, vidljivost: 'privatno', tacke: [{ lat: 44.88, lon: 16.15, t: T - 7200000 }, { lat: 44.889, lon: 16.15, t: T - 3600000 }], pauze: [] },
    { id: 't2', naziv: 'Potraga srndać', status: 'gotovo', vrsta: 'potraga', start: T - 1800000, kraj: T - 900000, vidljivost: 'privatno', tacke: [{ lat: 44.88, lon: 16.15, t: T - 1800000 }, { lat: 44.881, lon: 16.15, t: T - 900000 }], pauze: [] },
  ]);
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-tragovi').click();
  await expect(page.locator('#tr-stat-broj')).toHaveText('2');
  await expect(page.locator('#tr-stat-km')).toHaveText(/^1(,\d)?$/);
  await expect(page.locator('#tragovi-spisak .tr-kartica')).toHaveCount(2);
  await expect(page.locator('#tragovi-spisak [data-id="t2"] .tr-chip')).toHaveText('Potraga');
  await page.locator('#tr-filter [data-tip="potraga"]').click();
  await expect(page.locator('#tragovi-spisak .tr-kartica')).toHaveCount(1);
  await expect(page.locator('#tragovi-spisak')).toContainText('Potraga srndać');
  await page.locator('#tr-filter [data-tip="svi"]').click();
  await page.fill('#tr-trazi', 'vrh');
  await expect(page.locator('#tragovi-spisak .tr-kartica')).toHaveCount(1);
  await expect(page.locator('#tragovi-spisak [data-akcija="prikazi"]')).toHaveText('Prikaži na karti');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('Zajednički lov: kartice grupisane (danas i u toku, planirani, završeni) sa logom sekcije, značkom i brojevima', async ({ page }) => {
  const server = makeServer();
  const zav = { ...server.db.lovovi[0], id: ID(310), naziv: 'Stari lov', status: 'zavrsen', datum: '2026-10-01' };
  const plan = { ...server.db.lovovi[0], id: ID(311), naziv: 'Budući lov', status: 'planiran', datum: '2099-01-01' };
  server.db.lovovi.push(zav, plan);
  await setup(page, server, LOVAC);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  await page.locator('#btn-lovovi-osvjezi').click();
  await expect(page.locator('#lovovi-spisak .lov-kartica')).toHaveCount(3);
  await expect(page.locator('#lovovi-spisak .lk-grupa')).toHaveText(['Danas i u toku (1)', 'Planirani (1)', 'Završeni (1)']);
  const live = page.locator(`#lovovi-spisak [data-id="${LOV}"]`);
  await expect(live.locator('.lk-chip')).toHaveText('U TOKU');
  await expect(live.locator('.sek-logo')).toHaveAttribute('style', /data:image\/svg/);
  await expect(live.locator('.lk-statovi')).toContainText('učesnika');
  await expect(live.locator('[data-akcija="prikazi"]')).toHaveText('Raspored na karti');
  await expect(page.locator(`#lovovi-spisak [data-id="${ID(310)}"] [data-akcija="izvjestaj"]`)).toBeVisible();
  await expect(page.locator(`#lovovi-spisak [data-id="${ID(311)}"] [data-akcija="izvjestaj"]`)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('Moj pas: ime i slika iz profila, strelica pokazuje smjer ka psu, dugme vodi u profil', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.addInitScript((png) => {
    localStorage.setItem('lovac.profil.lovac', JSON.stringify({ pas_ime: 'Rex', pas_slika: `data:image/png;base64,${png}`, oprema: [], neposlano: false }));
  }, PNG.toString('base64'));
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pas').click();
  await expect(page.locator('#pas-profil-ime')).toHaveText('Rex');
  await expect(page.locator('#pas-foto')).toHaveClass(/ima-sliku/);
  await expect(page.locator('#pas-strelica')).toBeHidden();
  await page.fill('#pas-unos', '44.89000, 16.15000');
  await page.locator('#btn-pas-prikazi').click();
  await expect(page.locator('#pas-stanje')).toContainText('Rex: 1,1 km S od tebe');
  await expect(page.locator('#pas-strelica')).toBeVisible();
  expect(await page.locator('#pas-strelica').evaluate((e) => e.style.transform)).toMatch(/rotate\((0|-?\d+)deg\)/);
  await page.locator('#btn-pas-profil').click();
  await expect(page.locator('#postavke')).toBeVisible();
  await expect(page.locator('#p-profil')).toBeVisible();
});

test('Zajednički lov: pregled sa brojevima, datum sa danom u sedmici, planirani od najbližeg, bez dupliranog statusa', async ({ page }) => {
  const server = makeServer();
  server.db.lovovi.push(
    { ...server.db.lovovi[0], id: ID(312), naziv: 'Daleki lov', status: 'planiran', datum: '2099-01-01' },
    { ...server.db.lovovi[0], id: ID(313), naziv: 'Bliski lov', status: 'planiran', datum: '2098-12-05' },
    { ...server.db.lovovi[0], id: ID(314), naziv: 'Stari lov', status: 'zavrsen', datum: '2026-10-01' });
  await setup(page, server, LOVAC);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  await page.locator('#btn-lovovi-osvjezi').click();
  await expect(page.locator('#lovovi-spisak .lov-kartica')).toHaveCount(4);
  await expect(page.locator('#lovh-danas')).toHaveText('1');
  await expect(page.locator('#lovh-plan')).toHaveText('2');
  await expect(page.locator('#lovh-zavrsen')).toHaveText('1');
  const plan = page.locator('#lovovi-spisak .lov-kartica[data-status="planiran"] .trag-naslov b');
  await expect(plan).toHaveText(['Bliski lov', 'Daleki lov']);
  await expect(page.locator(`#lovovi-spisak [data-id="${ID(313)}"] .lk-datum`)).toHaveText('petak, 5.12.2098.');
  await expect(page.locator(`#lovovi-spisak [data-id="${LOV}"] .trag-naslov`)).not.toContainText('U toku');
});
