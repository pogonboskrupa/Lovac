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




const ADMIN = { id: ID(1), ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: true };
const LC = { id: ID(6), ime: 'Lana', prezime: 'Lovočuvar', odobren: true, is_admin: false };

const putRec = (page, store, rec) => page.evaluate(([s, r]) => new Promise((res, rej) => {
  const q = indexedDB.open('lovac');
  q.onsuccess = () => { const tx = q.result.transaction(s, 'readwrite'); tx.objectStore(s).put(r); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
}), [store, rec]);

const odstrel = (id, extra = {}) => ({ id, vlasnik_id: LOVAC.id, vidljivost: 'privatno', rev: 1, sinhronizovano: true, vrsta: 'zec', kategorija: 'nepoznato', tezina: 3.5,
  vrijeme: Date.now() - 3600000, lat: 44.88, lon: 16.15, lovac: 'Lovro Lovac', napomena: 'tajna napomena', ...extra });

const prijava = (id, lovac, revir, sek, vrsta, tezina, mjesec, extra = {}) => ({ id, lovac_id: lovac, revir_id: revir, sekcija_id: sek, lov_id: null, vrsta, kategorija: null, tezina,
  vrijeme: new Date(2026, mjesec - 1, 10, 9).toISOString(), prijavljeno: new Date(2026, mjesec - 1, 11, 9).toISOString(), povucena: false, ...extra });

async function openOdstrel(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-odstrel-spisak').click();
  await expect(page.locator('#odstrel')).toBeVisible();
}

test('Prijava ulova: lovac prijavi odstrel društvu — na server idu samo osnovni podaci, kartica pokazuje stanje', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await page.goto('/');
  await putRec(page, 'odstrel', odstrel(ID(900)));
  await openOdstrel(page);
  await page.locator('#odstrel-spisak [data-id="' + ID(900) + '"] [data-akcija="prijavi"]').click();
  await expect(page.locator('#prijava-dijalog')).toBeVisible();
  await expect(page.locator('#prijava-cilj-red')).toBeHidden(); // jedna sekcija: nema izbora
  await page.locator('#btn-prijava-potvrdi').click();
  await expect.poll(() => server.db.ulov_prijave?.length).toBe(1);
  const row = server.db.ulov_prijave[0];
  expect(row).toMatchObject({ id: ID(900), lovac_id: LOVAC.id, revir_id: R.krupa, sekcija_id: ID(200), vrsta: 'zec', tezina: 3.5 });
  expect(JSON.stringify(row)).not.toMatch(/tajna napomena|44\.88|lat|lon/);
  await expect(page.locator('#odstrel-spisak [data-prijava="poslana"]')).toHaveText('Prijavljeno društvu');
  await expect(page.locator('#odstrel-spisak [data-akcija="prijavi"]')).toHaveCount(0);
});

test('Prijava ulova: bez veze ostaje u izlaznoj kutiji ("čeka slanje") i šalje se kad server opet radi', async ({ page }) => {
  const server = makeServer();
  server.failPost = true;
  await setup(page, server, LOVAC);
  await page.goto('/');
  await putRec(page, 'odstrel', odstrel(ID(901)));
  await openOdstrel(page);
  await page.locator('#odstrel-spisak [data-akcija="prijavi"]').click();
  await page.locator('#btn-prijava-potvrdi').click();
  await expect(page.locator('#odstrel-spisak [data-prijava="ceka"]')).toBeVisible();
  expect(server.db.ulov_prijave?.length || 0).toBe(0);
  server.failPost = false;
  await page.evaluate(async () => { const m = await import('/static/js/prijave-ui.js'); await m.flushReports(); });
  await expect.poll(() => server.db.ulov_prijave?.length).toBe(1);
  await expect(page.locator('#odstrel-spisak [data-prijava="poslana"]')).toBeVisible();
});

test('Prijava ulova: neprimljen član sekcije ne može prijaviti (nema odredišta)', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, VAN);
  await page.goto('/');
  await putRec(page, 'odstrel', odstrel(ID(902), { vlasnik_id: VAN.id }));
  await openOdstrel(page);
  await page.locator('#odstrel-spisak [data-akcija="prijavi"]').click();
  await expect(page.locator('#prijava-dijalog')).toBeHidden();
  await expect(page.locator('#poruka')).toContainText('članu sekcije');
  expect(server.db.ulov_prijave?.length || 0).toBe(0);
});

function withReports(server) {
  server.db.ulov_prijave = [
    prijava(ID(950), LOVAC.id, R.krupa, ID(200), 'zec', 3.5, 1),
    prijava(ID(951), LOVAC2.id, R.krupa, ID(200), 'divlja_svinja', 90, 3),
    prijava(ID(952), VAN.id, R.otoka, ID(202), 'srna', 22, 3),
    prijava(ID(953), VAN.id, R.otoka, ID(202), 'srna', 99, 4, { povucena: true }),
  ];
  return server;
}

test('Pregled (administrator): cijelo društvo — brojke, po revirima, sekcijama, lovcima, vrstama; povučene se ne računaju', async ({ page }) => {
  const server = withReports(makeServer());
  server.db.korisnici.push(ADMIN);
  await setup(page, server, ADMIN);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pregled').click();
  await expect(page.locator('#pregled')).toBeVisible();
  await expect(page.locator('#pr-uloga')).toHaveText('Administrator');
  await expect(page.locator('#pr-stat-komada')).toHaveText('3');
  await expect(page.locator('#pr-stat-lovaca')).toHaveText('3');
  await expect(page.locator('#pr-stat-kg')).toHaveText('115,5');
  await expect(page.locator('#pr-drustvo-blok')).toBeVisible();
  await expect(page.locator('#pr-reviri .tr-kartica')).toHaveCount(2);
  await expect(page.locator('#pr-reviri')).toContainText('Krupa');
  await expect(page.locator('#pr-reviri')).toContainText('Otoka');
  await expect(page.locator('#pr-sekcije .tr-kartica')).toHaveCount(2);
  await expect(page.locator('#pr-lovci .tr-kartica')).toHaveCount(3);
  await expect(page.locator('#pr-vrste li')).toHaveCount(3);
  await expect(page.locator('#pr-mjeseci .pr-mj[data-mjesec="3"]')).toHaveAttribute('data-n', '2');
  await expect(page.locator('#pr-zadnje [data-id]')).toHaveCount(3);
  // godina
  await page.locator('#pr-godine [data-godina="2026"]').click();
  await expect(page.locator('#pr-stat-komada')).toHaveText('3');
  await expect(page.locator('#pr-stanje')).toContainText('upravo osvježeni');
});

test('Pregled (grupovođa): vidi sekciju, nema bloka po revirima ni društva; naslov Pregled', async ({ page }) => {
  const server = withReports(makeServer());
  await setup(page, server, GV);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pregled').click();
  await expect(page.locator('#pr-uloga')).toHaveText('Grupovođa');
  await expect(page.locator('#pr-reviri-blok')).toBeHidden();
  await expect(page.locator('#pr-drustvo-blok')).toBeHidden();
  await expect(page.locator('#pr-sekcije-blok')).toBeVisible();
  await expect(page.locator('#pr-lovci-blok')).toBeVisible();
});

test('Pregled (lovočuvar): uloga i revir; (lovac): "Moje prijave" sa povlačenjem drugim dodirom', async ({ page, browser }) => {
  const s1 = withReports(makeServer());
  s1.db.korisnici.push(LC);
  s1.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: LC.id });
  await setup(page, s1, LC);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pregled').click();
  await expect(page.locator('#pr-uloga')).toHaveText('Lovočuvar');
  await expect(page.locator('#pr-opseg')).toHaveText('Moj revir');
  await expect(page.locator('#pr-reviri-blok')).toBeVisible();

  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx2.newPage();
  const s2 = withReports(makeServer());
  await setup(p2, s2, LOVAC);
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-spiskovi').click();
  await p2.locator('#btn-pregled').click();
  await expect(p2.locator('#pr-uloga')).toHaveText('Lovac');
  await expect(p2.locator('#pregled-naslov')).toHaveText('Moje prijave');
  await expect(p2.locator('#pr-reviri-blok')).toBeHidden();
  await expect(p2.locator('#pr-sekcije-blok')).toBeHidden();
  const mine = p2.locator(`#pr-zadnje [data-id="${ID(950)}"] [data-akcija="povuci"]`);
  await expect(mine).toBeVisible();
  await mine.click();
  await mine.click();
  await expect.poll(() => s2.db.ulov_prijave.find((r) => r.id === ID(950)).povucena).toBe(true);
  await ctx2.close();
});
