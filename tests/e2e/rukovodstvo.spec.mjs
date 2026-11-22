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

const ruk = (id, autor, tekst, minAgo) => ({ id, kanal: 'rukovodstvo', sekcija_id: null, autor_id: autor, tekst, created_at: new Date(Date.now() - minAgo * 60000).toISOString() });

test('grupovođa vidi kanal Rukovodstvo i piše drugim grupovođama i lovočuvarima', async ({ page }) => {
  const server = makeServer();
  server.db.poruke.push(ruk(ID(700), VAN.id, 'Lovočuvar Krupe: sutra obilazak granice', 30));
  await setup(page, server, GV);
  await openTab(page);
  await expect(page.locator('#sk-nav-ruk')).toBeVisible();
  await expect(page.locator('#sk-k-ruk')).toBeVisible();
  await expect(page.locator('#sk-ruk-poruke')).toContainText('sutra obilazak granice');
  // poruke sekcije se ne miješaju sa rukovodstvom
  await expect(page.locator('#sk-poruke')).not.toContainText('obilazak granice');
  await page.fill('#forma-ruk input[name=tekst]', 'Pogon u Krupi je u subotu');
  await page.locator('#forma-ruk button[type=submit]').click();
  await expect.poll(() => server.db.poruke.filter((m) => m.kanal === 'rukovodstvo').length).toBe(2);
  const sent = server.db.poruke.find((m) => m.tekst === 'Pogon u Krupi je u subotu');
  expect(sent).toMatchObject({ kanal: 'rukovodstvo', sekcija_id: null, autor_id: GV.id });
  await expect(page.locator('#sk-ruk-poruke .poruka-red.moja')).toContainText('subotu');
});

test('običan član ne vidi kanal Rukovodstvo; lovočuvar revira ga vidi i nepročitane se broje u znački', async ({ page, browser }) => {
  const server = makeServer();
  server.db.poruke.push(ruk(ID(701), GV.id, 'Za rukovodstvo', 5));
  await setup(page, server, LOVAC);
  await openTab(page);
  await expect(page.locator('#sk-k-ruk')).toBeHidden();
  await expect(page.locator('#sk-nav-ruk')).toBeHidden();

  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx2.newPage();
  const server2 = makeServer();
  server2.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  server2.db.poruke.push(ruk(ID(702), GV.id, 'Za rukovodstvo', 5));
  await setup(p2, server2, VAN);
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-sekcija').click();
  await expect(p2.locator('#sk-ruk-poruke')).toContainText('Za rukovodstvo');
  await expect(p2.locator('#sk-k-ruk')).toBeVisible();
  await ctx2.close();
});

test('lovočuvar piše članovima sekcije kroz kanal sekcije', async ({ page }) => {
  const server = makeServer();
  server.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  await setup(page, server, VAN);
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-izbor')).toBeVisible();
  await page.fill('#forma-poruka input[name=tekst]', 'Pozdrav od lovočuvara');
  await page.locator('#forma-poruka button[type=submit]').click();
  await expect.poll(() => server.db.poruke.some((m) => m.tekst === 'Pozdrav od lovočuvara' && m.sekcija_id === ID(200))).toBe(true);
});
