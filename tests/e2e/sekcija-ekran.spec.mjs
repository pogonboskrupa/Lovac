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
      if (table === 'javne_grupe') { db.javneZatrazene = (db.javneZatrazene || 0) + 1; return json(200, db.javneGrupe || []); }
      if (req.method() === 'GET') return json(200, rows.filter((r) => match(r, url.searchParams)));
      if (req.method() === 'POST') {
        if (this.failPost) return json(503, { message: 'server nedostupan' });
        if (table === 'zeljena_grupa') { const b = req.postDataJSON(); db.zelja = b; return json(200, null); }
        if (table === 'dodijeli_grupu') {
          const b = req.postDataJSON();
          const c = db.sekcija_clanovi.find((x) => x.sekcija_id === b.p_sekcija && x.korisnik_id === b.p_korisnik);
          if (c) c.grupa_id = b.p_grupa;
          return json(200, null);
        }
        const made = [];
        for (const r of [].concat(req.postDataJSON())) if (!rows.some((x) => x.id && x.id === r.id)) { const row = { id: ID(++n), ...r }; rows.push(row); made.push(row); }
        return json(201, made);
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
  // Lovac i grupovođa u grupi dobiju "Moja grupa"; cijela sekcija je dugme na tom ekranu.
  const grupa = page.locator('#grupa-ekran');
  if (await grupa.isVisible().catch(() => false)) await page.locator('#btn-gr-sekcija').click();
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
  // redoslijed: lovovođa sekcije prvi
  await expect(rows.first()).toContainText('Goran Lovovođa sekcije');
  await expect(rows.first()).toHaveAttribute('data-stanje', 'aktivan');
  await expect(rows.first()).toContainText('Lovovođa sekcije');
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
  // datum lova je čitljiv (dan u sedmici), ne ISO; traka dijelova označava gdje je lovac
  await expect(page.locator('#sk-lov .lk-datum')).toHaveText(/^[a-zčćšžđ]+, \d{1,2}\.\d{1,2}\.\d{4}\.$/);
  await expect(page.locator('#sk-nav [aria-current="true"]')).toHaveCount(1);
  // pomak do kartice lova označava "Lov" (traka ima drugačiji redoslijed od kartica)
  await page.locator('#sk-k-lov').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(page.locator('#sk-nav [aria-current="true"]')).toHaveAttribute('data-cilj', 'sk-k-lov');
  await expect(page.locator('#sk-lov [data-stat="aktivnih"] b')).toHaveText('1');
  await expect(page.locator('#sk-stat-aktivnih')).toHaveText('1');
  await expect(page.locator('#sk-stat-clanova')).toHaveText('3');
  await expect(page.locator('#sk-uloga')).toHaveText('Član');
  await expect(page.locator('#sk-lov')).toContainText('Moja uloga: Strijelac, stan 1');
  await expect(page.locator('#sk-lov')).toContainText('Divlja svinja: 1 kom., 85,5 kg');
  // svi podaci
  await expect(page.locator('#sk-podaci')).toContainText('Lovovođa sekcije');
  await expect(page.locator('#sk-podaci')).toContainText('Lovova sekcije');
  await expect(page.locator('#sk-podaci li[data-lov]')).toHaveCount(1);
});

test('"Na karti" pomjera mapu na poziciju člana, "Raspored na karti" otvara raspored lova', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openTab(page);
  await page.locator(`#sk-clanovi [data-uid="${GV.id}"] [data-akcija="na-karti"]`).click();
  await expect(page.locator('#sekcija-ekran')).toBeHidden();
  await expect(page.locator('#koord-gk')).toHaveText(/^44\.88\d*, 16\.15\d*$/);
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
  await expect(page.locator('#forma-poruka input[name=tekst]')).toHaveValue('Goran Lovovođa sekcije: ');
  await page.fill('#forma-poruka input[name=tekst]', 'Goran Lovovođa sekcije: kasnim 10 min');
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
  expect(notif.at(-1)).toEqual({ n: 'Krupa 1 — Goran Lovovođa sekcije', t: 'Okupljanje kod kuće' });
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
  await expect(page.locator('#btn-sekcija')).toContainText('Sekcije');
  await expect(page.locator('#sk-lista')).toBeVisible();
  await expect(page.locator('#sk-lista .sk-lista-revir')).toHaveText(['Revir Krupa']);
  await expect(page.locator('#sk-lista [data-sid]')).toHaveText(['Krupa 1', 'Krupa 2']);
  await expect(page.locator('#sk-podnaslov')).toContainText('lovočuvar revira');
  await expect(page.locator(`#sk-clanovi [data-uid="${VAN.id}"]`)).toHaveCount(1);
  await expect(page.locator('#sk-clanovi [data-uid="' + GV.id + '"]')).toContainText('Aktivan u lovu');
  // spisak lovaca je zadano sklopljen; dodir na sekciju ga rasklapa, drugi dodir na istu ga sklapa
  await expect(page.locator('#btn-sk-lovci')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#sk-clanovi')).toBeHidden();
  await page.locator(`#sk-lista [data-sid="${ID(200)}"]`).click();
  await expect(page.locator('#btn-sk-lovci')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator(`#sk-clanovi [data-uid="${GV.id}"]`)).toBeVisible();
  await page.locator(`#sk-lista [data-sid="${ID(200)}"]`).click();
  await expect(page.locator('#sk-clanovi')).toBeHidden();
  await page.locator(`#sk-lista [data-sid="${ID(201)}"]`).click();
  await expect(page.locator(`#sk-lista [data-sid="${ID(201)}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#btn-sk-lovci')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sk-podnaslov')).toContainText('Revir Krupa');
  await expect(page.locator('#sk-lov')).toContainText('Nema lova');

  // Lovac koji nije u sekciji: prazan ekran sa putem do zahtjeva.
  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx2.newPage();
  const noviLovac = { ...VAN, id: ID(9), ime: 'Nov', prezime: 'Lovac' };
  const server2 = makeServer();
  server2.db.korisnici.push(noviLovac);
  await setup(p2, server2, noviLovac);
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

test('pregled sekcije: hero sa ulogom i brojevima, avatari sa inicijalima, navigacija po dijelovima', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await setup(page, makeServer(), GV);
  await openTab(page);
  await expect(page.locator('#sk-uloga')).toHaveText('Lovovođa sekcije');
  await expect(page.locator('#sk-stat-lovova')).toHaveText('1');
  await expect(page.locator(`#sk-clanovi [data-uid="${GV.id}"] .sk-avatar`)).toHaveText('GS');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const b of await page.locator('#sk-nav button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.locator('#sk-nav [data-cilj="sk-k-poruke"]').click();
  await expect.poll(() => page.evaluate(() => document.getElementById('sk-k-poruke').getBoundingClientRect().top)).toBeLessThan(200);
  await page.locator('#sk-nav [data-cilj="sk-k-lov"]').click();
  await expect.poll(() => page.evaluate(() => document.getElementById('sk-k-lov').getBoundingClientRect().top)).toBeLessThan(200);
  await page.locator('#sk-nav [data-cilj="sk-k-clanovi"]').click();
});

test('lovci sekcije su istaknuti: traka lica, brojevi, filter Aktivni/Vodstvo i pretraga', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openTab(page);
  await expect(page.locator('#sk-lica .sk-lice')).toHaveCount(3);
  await expect(page.locator('#sk-brojevi [data-b="aktivni"]')).toContainText('1 aktivnih');
  await expect(page.locator('#sk-brojevi [data-b="bez-signala"]')).toContainText('2 bez signala');
  const rows = page.locator('#sk-clanovi [data-uid]');
  await page.locator('#sk-filter [data-mf="aktivni"]').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Goran Lovovođa sekcije');
  await page.locator('#sk-filter [data-mf="vodstvo"]').click();
  await expect(rows.first()).toHaveAttribute('data-uloga', 'grupovodja');
  await page.locator('#sk-filter [data-mf="svi"]').click();
  await expect(rows).toHaveCount(3);
  await page.locator('#sk-pretraga').fill('lovovoda');
  await expect(rows).toHaveCount(1);
  await page.locator('#sk-pretraga').fill('xyz');
  await expect(rows).toHaveCount(0);
  await expect(page.locator('#sk-clanovi')).toContainText('Nijedan lovac ne odgovara pretrazi.');
  // kartica lovaca je prva, ispred tekućeg lova
  const y = async (id) => (await page.locator(id).boundingBox()).y;
  expect(await y('#sk-k-clanovi')).toBeLessThan(await y('#sk-k-lov'));
});

test('admin: tab se zove "Sekcije", unutra je spisak svih sekcija i izbor; obični član vidi naziv svoje sekcije', async ({ page }) => {
  const server = makeServer();
  const ADMIN = { id: ID(9), ime: 'Predsjednik', prezime: 'LD', odobren: true, is_admin: true };
  server.db.korisnici.push(ADMIN);
  await setup(page, server, ADMIN);
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sekcija-ekran')).toBeVisible();
  await expect(page.locator('#btn-sekcija')).toContainText('Sekcije');
  await expect(page.locator('#btn-sekcija')).not.toContainText('Krupa');
  await expect(page.locator('#sk-naslov')).toHaveText('Sekcije');
  await expect(page.locator('#sk-lista')).toBeVisible();
  expect(await page.locator('#sk-lista [data-sid]').count()).toBeGreaterThan(0);
  await expect(page.locator('#sk-lista [data-sid][aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('#sk-izbor')).toBeHidden();
});

test('grupe: lovovođa sekcije pravi grupu, raspoređuje lovca, vadi ga i uklanja grupu (drugi dodir)', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, GV);
  await openTab(page);
  const grupe = page.locator('#sk-grupe');
  await expect(grupe).toContainText('Još nema grupa');
  await expect(grupe).toContainText('Bez grupe (2)');
  await page.locator('#sk-grupa-gv').selectOption(LOVAC.id);
  await grupe.locator('[data-akcija="grupa-nova"]').click();
  await expect(grupe.locator('.sk-grupa')).toHaveCount(1);
  await expect(grupe.locator('.sk-grupa')).toContainText('grupovođa Lovro Lovac');
  expect(server.db.grupe).toHaveLength(1);
  // lovac 2 u grupu
  await grupe.locator(`.sk-bez-grupe [data-uid="${LOVAC2.id}"] [data-akcija="grupa-dodijeli"]`).click();
  await expect(grupe.locator('.sk-grupa-clanovi')).toContainText('Luka Pogonič');
  expect(server.db.sekcija_clanovi.find((c) => c.korisnik_id === LOVAC2.id).grupa_id).toBe(server.db.grupe[0].id);
  await grupe.locator(`.sk-grupa-clanovi [data-uid="${LOVAC2.id}"] [data-akcija="grupa-izbaci"]`).click();
  await expect(grupe.locator('.sk-grupa-clanovi')).not.toContainText('Luka Pogonič');
  // uklanjanje grupe traži drugi dodir
  await grupe.locator('[data-akcija="grupa-ukloni"]').click();
  expect(server.db.grupe).toHaveLength(1);
});

test('grupe: običan član vidi grupe ali ne može praviti ni uklanjati', async ({ page }) => {
  const server = makeServer();
  server.db.grupe = [{ id: ID(700), sekcija_id: ID(200), grupovodja_id: LOVAC.id }];
  server.db.sekcija_clanovi[0].grupa_id = ID(700);
  await setup(page, server, LOVAC2);
  await openTab(page);
  await expect(page.locator('#sk-grupe .sk-grupa')).toContainText('grupovođa Lovro Lovac');
  await expect(page.locator('#sk-grupe [data-akcija="grupa-nova"]')).toHaveCount(0);
  await expect(page.locator('#sk-grupe [data-akcija="grupa-ukloni"]')).toHaveCount(0);
});

test('lov po grupi: grupovođa pravi lov SVOJE grupe (lovci grupe, bez ostalih), lov nosi grupu; dopuštenje višima', async ({ page }) => {
  const server = makeServer();
  server.db.lovovi = [];
  server.db.grupe = [{ id: ID(700), sekcija_id: ID(200), grupovodja_id: LOVAC.id, dozvola_visih: false }];
  server.db.sekcija_clanovi[0].grupa_id = ID(700); // LOVAC (grupovođa) u svojoj grupi; LOVAC2 bez grupe
  await setup(page, server, LOVAC);
  await openTab(page);
  await page.locator('#sk-lov [data-akcija="lov-novi"]').click();
  const forma = page.locator('#forma-sk-lov');
  await expect(forma).toBeVisible();
  await expect(page.locator('#slf-grupa-blok')).toBeVisible(); // lov je na nivou grupe: grupa se vidi i kad je jedini izbor
  await expect(page.locator('#slf-grupa-izbor')).toBeDisabled();
  await expect(forma.locator('#slf-clanovi .slf-red')).toHaveCount(0); // u grupi nema drugih lovaca
  await page.locator('#slf-sirenje').check();
  await expect(forma.locator(`#slf-clanovi .slf-red[data-uid="${LOVAC2.id}"]`)).toHaveCount(1); // proširenje na sekciju
  await forma.locator('button[type=submit]').click();
  await expect.poll(() => server.db.lovovi.length).toBe(1);
  expect(server.db.lovovi[0].grupa_id).toBe(ID(700));
});

for (const [dozvola, opcija] of [[false, 1], [true, 2]]) {
  test(`lov po grupi: lovovođa sekcije ${dozvola ? 'uz' : 'bez'} dopuštenja grupovođe ima ${opcija} ${opcija === 1 ? 'metu (cijela sekcija)' : 'mete (sekcija i grupa)'}`, async ({ page }) => {
    const server = makeServer();
    server.db.lovovi = [];
    server.db.grupe = [{ id: ID(700), sekcija_id: ID(200), grupovodja_id: LOVAC.id, dozvola_visih: dozvola }];
    await setup(page, server, GV);
    await openTab(page);
    await page.locator('#sk-lov [data-akcija="lov-novi"]').click();
    await expect(page.locator('#forma-sk-lov')).toBeVisible();
    if (opcija === 1) await expect(page.locator('#slf-grupa-blok')).toBeHidden();
    else await expect(page.locator('#slf-grupa-izbor option')).toHaveCount(2);
  });
}

test('izbor grupe poslije registracije: čekalac sa sekcijom dobije dijalog, izbor ide kao želja i ne pita ponovo', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push({ sekcija_id: ID(200), korisnik_id: VAN.id, status: 'ceka' });
  server.db.javneGrupe = [{ id: ID(700), grupovodja: 'Lovro Lovac' }, { id: ID(701), grupovodja: 'Luka Pogonič' }];
  await setup(page, server, VAN);
  await page.goto('/');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.dispatchEvent(new Event('sekcije:promjena')));
  await expect(page.locator('#grupa-dijalog')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#grupa-izbor option')).toHaveCount(2);
  await page.selectOption('#grupa-izbor', ID(701));
  await page.locator('#btn-grupa-potvrdi').click();
  await expect.poll(() => server.db.zelja).toEqual({ p_sekcija: ID(200), p_grupa: ID(701) });
  await expect(page.locator('#grupa-dijalog')).toBeHidden();
  // ne pita ponovo
  await page.evaluate(() => document.dispatchEvent(new Event('sekcije:promjena')));
  await page.waitForTimeout(1500);
  await expect(page.locator('#grupa-dijalog')).toBeHidden();
});

test('izbor grupe: sekcija bez grupa se ne pita; "Kasnije" zatvara bez pamćenja', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push({ sekcija_id: ID(200), korisnik_id: VAN.id, status: 'ceka' });
  server.db.javneGrupe = [];
  await setup(page, server, VAN);
  await page.goto('/');
  await page.waitForTimeout(500);
  await page.evaluate(() => document.dispatchEvent(new Event('sekcije:promjena')));
  await expect.poll(() => server.db.javneZatrazene || 0, { timeout: 15000 }).toBeGreaterThan(0);
  await expect(page.locator('#grupa-dijalog')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('lovac.grupa.pitano.00000000-0000-4000-8000-000000000200'))).toBe('true');
});

// ---------- Moja grupa (v1.7.7) ----------
const G1 = ID(700), G2 = ID(701);
const danas = () => new Date().toISOString().slice(0, 10);

// LOVAC2 vodi grupu G1 (u njoj je i LOVAC), VAN je u drugoj grupi G2; lov grupe G1 je planiran za danas.
function grupaServer() {
  const server = makeServer();
  const d = server.db;
  d.grupe = [{ id: G1, sekcija_id: ID(200), grupovodja_id: LOVAC2.id, dozvola_visih: false }, { id: G2, sekcija_id: ID(200), grupovodja_id: VAN.id, dozvola_visih: false }];
  d.sekcija_clanovi = [
    { sekcija_id: ID(200), korisnik_id: LOVAC.id, status: 'odobren', grupa_id: G1 },
    { sekcija_id: ID(200), korisnik_id: LOVAC2.id, status: 'odobren', grupa_id: G1 },
    { sekcija_id: ID(200), korisnik_id: VAN.id, status: 'odobren', grupa_id: G2 },
  ];
  d.lovovi = [{ id: LOV, revir_id: R.krupa, sekcija_id: ID(200), grupa_id: G1, naziv: 'Pogon grupe', datum: danas(), status: 'planiran', organizator_id: LOVAC2.id }];
  d.lov_ucesnici = [{ lov_id: LOV, korisnik_id: LOVAC2.id, uloga: 'vodja' }];
  d.lov_pozicije = [];
  d.poruke = [];
  return server;
}
async function openGrupa(page) {
  await page.goto('/');
  await expect(page.locator('#nav-sekcija-ime')).toHaveText('Grupa', { timeout: 15000 }); // keš se puni pri prvom osvježavanju (5 s poslije pokretanja)
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#grupa-ekran')).toBeVisible();
  await expect(page.locator('#gr-clanovi [data-uid]').first()).toBeVisible();
}

test('Moja grupa: lovac u grupi dobije tab "Moja grupa" sa grupovođom, lovcima grupe i lovom grupe (tuđa grupa se ne vidi)', async ({ page }) => {
  const server = grupaServer();
  await setup(page, server, LOVAC);
  await openGrupa(page);
  await expect(page.locator('#gr-podnaslov')).toContainText('grupovođa Luka Pogonič');
  await expect(page.locator('#gr-podnaslov')).toContainText('Krupa 1');
  await expect(page.locator('#gr-clanovi [data-uid]')).toHaveCount(2);
  await expect(page.locator('#gr-clanovi')).not.toContainText('Vanja');
  await expect(page.locator(`#gr-clanovi [data-uid="${LOVAC2.id}"]`)).toContainText('Grupovođa');
  await expect(page.locator('#gr-lov')).toContainText('Pogon grupe');
  await expect(page.locator('#gr-lov')).toContainText('lov grupe');
  await expect(page.locator('#gr-lov [data-akcija="gr-novi"]')).toHaveCount(0); // lovac ne organizuje
  if (process.env.SNIMCI_DIR) await page.screenshot({ path: `${process.env.SNIMCI_DIR}/moja-grupa.png`, fullPage: false });
});

test('Moja grupa: "Dolazim" prijavljuje lovca na lov grupe (nisu svi uvijek prisutni; ko dolazi se javlja za svaki lov)', async ({ page }) => {
  const server = grupaServer();
  await setup(page, server, LOVAC);
  await openGrupa(page);
  await expect(page.locator('#gr-lov .gr-moje')).toContainText('Još nisi javio');
  await page.locator('#gr-lov [data-akcija="gr-dolazim"]').click();
  await expect.poll(() => server.db.lov_ucesnici.some((u) => u.korisnik_id === LOVAC.id && u.samoprijava)).toBe(true);
  await expect(page.locator('#gr-lov .gr-moje')).toContainText('Prisutan si');
  await expect(page.locator('#gr-lov [data-stat="prisutnih"] b')).toHaveText('2');
});

test('Moja grupa: poruke grupe idu kanalom grupe, ne u razgovor sekcije; tuđa grupa se ne vidi', async ({ page }) => {
  const server = grupaServer();
  const prije = new Date(Date.now() - 600000).toISOString();
  server.db.poruke = [
    { id: ID(610), kanal: 'grupa', sekcija_id: null, grupa_id: G1, autor_id: LOVAC2.id, tekst: 'Sutra okupljanje u 6', created_at: prije },
    { id: ID(611), kanal: 'grupa', sekcija_id: null, grupa_id: G2, autor_id: VAN.id, tekst: 'Samo druga grupa', created_at: prije },
  ];
  await setup(page, server, LOVAC);
  await openGrupa(page);
  await expect(page.locator('#gr-poruke')).toContainText('Sutra okupljanje u 6');
  await expect(page.locator('#gr-poruke')).not.toContainText('Samo druga grupa');
  await page.locator('#forma-gr-poruka input[name=tekst]').fill('Stižem');
  await page.locator('#forma-gr-poruka button[type=submit]').click();
  await expect.poll(() => server.db.poruke.some((m) => m.tekst === 'Stižem' && m.kanal === 'grupa' && m.grupa_id === G1 && !m.sekcija_id), { timeout: 40000 }).toBe(true);
  await expect(page.locator('#gr-poruke')).toContainText('Stižem');
  // razgovor cijele sekcije ih ne pokazuje
  await page.locator('#btn-gr-sekcija').click();
  await expect(page.locator('#sekcija-ekran')).toBeVisible();
  await expect(page.locator('#sk-poruke')).not.toContainText('Stižem');
  await expect(page.locator('#sk-poruke')).not.toContainText('Sutra okupljanje');
});

test('Moja grupa: grupovođa vidi "Novi lov grupe" i vođenje lova; lovovođa sekcije ostaje na tabu sekcije', async ({ page, browser }) => {
  const server = grupaServer();
  await setup(page, server, LOVAC2);
  await openGrupa(page);
  await expect(page.locator('#gr-lov [data-akcija="gr-pokreni"]')).toHaveCount(1);
  await page.locator('#gr-lov [data-akcija="gr-novi"]').click();
  await expect(page.locator('#sk-lov-forma')).toBeVisible();

  const page2 = await browser.newPage();
  await setup(page2, grupaServer(), GV);
  await page2.goto('/');
  await expect(page2.locator('#nav-sekcija-ime')).toHaveText('Krupa 1', { timeout: 15000 });
  await page2.locator('#btn-sekcija').click();
  await expect(page2.locator('#sekcija-ekran')).toBeVisible();
  await expect(page2.locator('#grupa-ekran')).toBeHidden();
  await page2.close();
});

test('Moja grupa: statistika iz završenih lovova grupe i dugme Nazad', async ({ page }) => {
  const server = grupaServer();
  server.db.lovovi.push({ id: ID(301), revir_id: R.krupa, sekcija_id: ID(200), grupa_id: G1, naziv: 'Stari lov', datum: '2026-10-01', status: 'zavrsen', organizator_id: LOVAC2.id });
  server.db.lov_ucesnici.push({ lov_id: ID(301), korisnik_id: LOVAC2.id, uloga: 'vodja' }, { lov_id: ID(301), korisnik_id: LOVAC.id, uloga: 'strijelac' });
  await setup(page, server, LOVAC);
  await openGrupa(page);
  await expect(page.locator('#gr-stat [data-stat="lovova"] b')).toHaveText('1');
  await expect(page.locator('#gr-stat [data-stat="prosjek"] b')).toHaveText('100 %');
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => globalThis.__nazad?.());
  await expect(page.locator('#grupa-ekran')).toBeHidden();
});

test('traka lova grupe na mapi: pokazuje lov, prisutne i otvara Moju grupu; lovovođa sekcije je nema', async ({ page, browser }) => {
  const server = grupaServer();
  await setup(page, server, LOVAC);
  await page.goto('/');
  const traka = page.locator('#grupa-traka');
  await expect(traka).toBeVisible({ timeout: 20000 });
  await expect(traka).toContainText('Lov grupe danas');
  await expect(traka).toContainText('prisutnih 1/2');
  await expect(traka).toContainText('javi dolaziš li');
  await traka.click();
  await expect(page.locator('#grupa-ekran')).toBeVisible();

  const page2 = await browser.newPage();
  await setup(page2, grupaServer(), GV);
  await page2.goto('/');
  await expect(page2.locator('#nav-sekcija-ime')).toHaveText('Krupa 1', { timeout: 15000 });
  await expect(page2.locator('#grupa-traka')).toBeHidden();
  await page2.close();
});

test('pregled grupa u tabu sekcije: lovovođa vidi koliko lovaca i lovova ima svaka grupa', async ({ page }) => {
  const server = grupaServer();
  server.db.lovovi.push({ id: ID(301), revir_id: R.krupa, sekcija_id: ID(200), grupa_id: G1, naziv: 'Stari lov', datum: '2026-10-01', status: 'zavrsen', organizator_id: LOVAC2.id });
  server.db.lov_ucesnici.push({ lov_id: ID(301), korisnik_id: LOVAC2.id, uloga: 'vodja' });
  await setup(page, server, GV);
  await openTab(page);
  const pregled = page.locator('#sk-grupe .sk-grupa');
  await expect(pregled).toHaveCount(2);
  await expect(pregled.filter({ hasText: 'Luka Pogonič' })).toContainText('2 lovaca');
  await expect(pregled.filter({ hasText: 'Luka Pogonič' })).toContainText('Lovova 1 · zadnji lov');
  await expect(pregled.filter({ hasText: 'Luka Pogonič' })).toContainText('prisutnih 1 od 2');
  await expect(pregled.filter({ hasText: 'Vanja' })).toContainText('još nema održanog lova');
});
