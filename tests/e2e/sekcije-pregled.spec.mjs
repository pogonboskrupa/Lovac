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





async function openSekcijeScreen(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-sekcije').click();
  await expect(page.locator('#sekcije')).toBeVisible();
}

test('Sekcije (lovovođa sekcije): hero, "Moje" kao zadani prikaz, zahtjevi na vrhu se odobravaju bez otvaranja upravljanja, tekst u Meniju', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push({ sekcija_id: ID(200), korisnik_id: VAN.id, status: 'ceka', created_at: '2026-11-01T10:00:00Z' });
  await setup(page, server, GV);
  await openSekcijeScreen(page);
  await expect(page.locator('#sks-moje')).toHaveText('1');
  await expect(page.locator('#sks-odobrenje')).toHaveText('1');
  await expect(page.locator('#sks-ukupno')).toHaveText('3');
  await expect(page.locator('#sekcije-filter [data-filter="moje"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(1);
  await expect(page.locator('#sekcije-zahtjevi')).toContainText('Vanja Van');
  await expect(page.locator('#sekcije-zahtjevi')).toContainText('Krupa 1');
  await expect(page.locator('#sekcije-filter [data-filter="zahtjevi"] .znacka-broj')).toHaveText('1');
  // Odobri direktno sa vrha
  await page.locator('#sekcije-zahtjevi [data-akcija="odobri"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.find((c) => c.korisnik_id === VAN.id).status).toBe('odobren');
  await expect(page.locator('#sekcije-zahtjevi')).toHaveCount(0);
  await expect(page.locator('#sks-odobrenje')).toHaveText('0');
});

test('Sekcije (lovac bez sekcije): zadani prikaz "Sve", Bez pristupa, pretraga po reviru i lovovođi sekcije, Zatraži pristup', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, VAN);
  await openSekcijeScreen(page);
  await expect(page.locator('#sks-moje')).toHaveText('0');
  await expect(page.locator('#sekcije-filter [data-filter="sve"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(3);
  await page.locator('#sekcije-filter [data-filter="moje"]').click();
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(0);
  await expect(page.locator('#sekcije-prazno')).toBeVisible();
  await page.locator('#sekcije-filter [data-filter="slobodne"]').click();
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(3);
  await page.fill('#sekcije-trazi', 'otoka');
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(1);
  await page.fill('#sekcije-trazi', 'goran'); // lovovođa sekcije Krupe 1
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(1);
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toContainText('Krupa 1');
  await page.locator('#sekcije-spisak .sekcija-kartica [data-akcija="zatrazi"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.some((c) => c.korisnik_id === VAN.id && c.sekcija_id === ID(200))).toBe(true);
  await page.fill('#sekcije-trazi', '');
  await page.locator('#sekcije-filter [data-filter="moje"]').click();
  await expect(page.locator('#sekcije-spisak .sekcija-kartica')).toHaveCount(1); // zahtjev na čekanju je "moje"
  await expect(page.locator('#sks-odobrenje')).toHaveText('0');
});

test('Meni: pločica Sekcije i pristup pokazuje koliko zahtjeva čeka lovovođu sekcije', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push({ sekcija_id: ID(200), korisnik_id: VAN.id, status: 'ceka', created_at: '2026-11-01T10:00:00Z' });
  await setup(page, server, GV);
  await openSekcijeScreen(page);
  await expect(page.locator('#sks-odobrenje')).toHaveText('1');
  await page.locator('#btn-sekcije-zatvori').click();
  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#btn-sekcije-opis')).toHaveText('1 zahtjev čeka tvoje odobrenje');
});
