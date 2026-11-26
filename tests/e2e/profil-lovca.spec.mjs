import { test, expect } from '@playwright/test';
import { serveTiles, PNG } from './helpers.mjs';

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
        for (const r of [].concat(req.postDataJSON())) { const ex = rows.find((x) => (r.id && x.id === r.id) || (!r.id && r.korisnik_id && x.korisnik_id === r.korisnik_id)); if (ex) Object.assign(ex, r); else rows.push(r.korisnik_id && !r.id ? { ...r } : { id: ID(++n), ...r }); }
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



test.use({ timezoneId: 'Europe/Sarajevo' });

const seed = (page, store, rows) => page.evaluate(([s, r]) => new Promise((resolve) => {
  const q = indexedDB.open('lovac');
  q.onsuccess = () => { const tx = q.result.transaction(s, 'readwrite'); r.forEach((x) => tx.objectStore(s).put(x)); tx.oncomplete = resolve; };
}), [store, rows]);

async function openProfil(page) {
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="profil"]').click();
  await expect(page.locator('#p-profil')).toBeVisible();
}

test('profil lovca: avatar, pas (ime i slika), oprema i telefon; sačuvano na telefonu i poslano na server', async ({ page }) => {
  const server = makeServer();
  server.db.profili = [];
  server.db.profili_oprema = [];
  await setup(page, server, LOVAC);
  await openProfil(page);
  await expect(page.locator('#pf-podtabovi [data-pftab="profil"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#telefon')).toBeVisible(); // telefon je dio profila lovca
  await expect(page.locator('#p-opste')).toBeHidden();

  await page.locator('#pf-avatar-ulaz').setInputFiles({ name: 'ja.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#pf-avatar')).toHaveClass(/ima-sliku/);
  await expect(page.locator('#p-avatar')).toHaveClass(/ima-sliku/);
  await page.locator('#pf-pas-ulaz').setInputFiles({ name: 'pas.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#pf-pas-slika')).toHaveClass(/ima-sliku/);
  await page.fill('#pf-pas-ime', 'Rex');
  await page.locator('#pf-oprema-vrsta').selectOption('puska');
  await page.fill('#pf-oprema-opis', 'Sauer 202, .308 Win');
  await page.locator('#btn-pf-oprema-dodaj').click();
  await page.locator('#pf-oprema-vrsta').selectOption('optika');
  await page.fill('#pf-oprema-opis', 'Zeiss 3-12x56');
  await page.locator('#btn-pf-oprema-dodaj').click();
  await expect(page.locator('#pf-oprema li')).toHaveCount(2);
  await page.locator('#pf-oprema li').nth(1).locator('[data-akcija="ukloni"]').click();
  await expect(page.locator('#pf-oprema li')).toHaveCount(1);
  await page.locator('#btn-pf-sacuvaj').click();

  await expect.poll(() => server.db.profili[0]?.pas_ime).toBe('Rex');
  expect(server.db.profili[0]).toMatchObject({ korisnik_id: LOVAC.id, pas_ime: 'Rex' });
  expect(server.db.profili[0].avatar).toMatch(/^data:image\/jpeg/);
  expect(server.db.profili[0].pas_slika).toMatch(/^data:image\/jpeg/);
  await expect.poll(() => server.db.profili_oprema[0]?.oprema?.length).toBe(1);
  expect(server.db.profili_oprema[0].oprema).toEqual([{ vrsta: 'puska', opis: 'Sauer 202, .308 Win' }]);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lovac.profil.lovac')).neposlano)).toBe(false);
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.profil.lovac')));
  expect(local).toMatchObject({ pas_ime: 'Rex', neposlano: false });

  await page.reload();
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab]').nth(1).click();
  await expect(page.locator('#pf-pas-ime')).toHaveValue('Rex');
  await expect(page.locator('#pf-avatar')).toHaveClass(/ima-sliku/);
});

test('statistika lovca: lovovi, sati, ulov, najveći komad, tragovi, opažanja i izbor godine', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await page.goto('/');
  const T = (y, m, d) => new Date(y, m, d, 9).getTime();
  await seed(page, 'lovovi', [
    { id: ID(950), lov: { id: ID(950), naziv: 'Lov A', status: 'zavrsen', datum: '2026-11-01', pocetak: '2026-11-01T07:00:00Z', kraj: '2026-11-01T11:30:00Z' }, ucesnici: [{ korisnik_id: LOVAC.id, uloga: 'strijelac' }], stanovi: [], sektori: [] },
    { id: ID(951), lov: { id: ID(951), naziv: 'Lov B', status: 'zavrsen', datum: '2025-10-10', pocetak: '2025-10-10T07:00:00Z', kraj: '2025-10-10T09:00:00Z' }, ucesnici: [{ korisnik_id: LOVAC.id, uloga: 'strijelac' }], stanovi: [], sektori: [] },
  ]);
  const b = { vidljivost: 'privatno', rev: 1, sinhronizovano: true, lat: 44.88, lon: 16.15, kategorija: 'nepoznato' };
  await seed(page, 'odstrel', [
    { ...b, id: 'o1', vrsta: 'divlja_svinja', tezina: 90, vrijeme: T(2026, 10, 1) },
    { ...b, id: 'o2', vrsta: 'divlja_svinja', tezina: 70, vrijeme: T(2026, 10, 5) },
    { ...b, id: 'o3', vrsta: 'zec', tezina: 4, vrijeme: T(2025, 9, 10) },
  ]);
  await seed(page, 'tragovi', [{ id: 't1', status: 'gotovo', vrsta: 'obilazak', start: T(2026, 10, 2), tacke: [{ lat: 44.88, lon: 16.15, t: 0 }, { lat: 44.89, lon: 16.15, t: 1000 }] }]);
  await seed(page, 'opazanja', [{ ...b, id: 'p1', vrsta: 'jelen', broj: 3, vrijeme: T(2026, 10, 2) }]);
  await page.reload();
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="profil"]').click();
  await page.locator('#pf-podtabovi [data-pftab="statistika"]').click();
  await expect(page.locator('#pf-statistika')).toBeVisible();
  const tile = (label) => page.locator('#pf-stat-tiles .pf-tile', { hasText: label });
  await expect(tile('lovova').locator('b')).toHaveText('2');
  await expect(tile('u lovu').locator('b')).toHaveText('6,5 h');
  await expect(tile('ulova').locator('b')).toHaveText('3');
  await expect(tile('najveći')).toContainText('90 kg');
  await expect(tile('najveći')).toContainText('Divlja svinja');
  await expect(tile('tragova').locator('b')).toContainText('1,1 km');
  await expect(tile('opažanja')).toContainText('(3 grla)');
  await expect(page.locator('#pf-stat-vrste')).toContainText('Divlja svinja: 2');
  await page.locator('#pf-stat-godina').selectOption('2025');
  await expect(tile('lovova').locator('b')).toHaveText('1');
  await expect(tile('ulova').locator('b')).toHaveText('1');
  await expect(page.locator('#pf-stat-vrste')).toContainText(/Zec.*: 1/);
});
