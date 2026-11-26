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
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) return true;
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
      // server bez migracije 028: funkcije lov_trag nema, klijent čita tabelu
      if (url.pathname.endsWith('/rpc/lov_trag')) return json(404, { code: 'PGRST202', message: 'Could not find the function public.lov_trag' });
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



test.use({ timezoneId: 'Europe/Sarajevo', geolocation: { latitude: 44.88, longitude: 16.15, accuracy: 5 }, permissions: ['geolocation'] });

const T = (min) => new Date(Date.UTC(2026, 10, 22, 7, 15) + min * 60000).toISOString();

function finished(server) {
  Object.assign(server.db.lovovi[0], { status: 'zavrsen', datum: '2026-11-22', pocetak: T(0), kraj: T(265), rezultat: 'Dvije divlje svinje i lisica' });
  server.db.lov_odstrel.push({ id: ID(501), lov_id: LOV, korisnik_id: LOVAC2.id, vrsta: 'lisica', tezina: 6, vrijeme: T(100) });
  server.db.lov_slike = [{ id: ID(800), lov_id: LOV, autor_id: GV.id, mala: 'data:image/jpeg;base64,AAAA', opis: 'Grupa poslije lova', lat: 44.88, lon: 16.15, created_at: T(270) }];
  server.db.lov_slike_podaci = [{ id: ID(800), slika: 'data:image/png;base64,' + PNG.toString('base64') }];
  server.db.lov_tragovi = [
    { lov_id: LOV, korisnik_id: GV.id, t: T(1), lat: 44.880, lon: 16.150 }, { lov_id: LOV, korisnik_id: GV.id, t: T(30), lat: 44.884, lon: 16.152 },
    { lov_id: LOV, korisnik_id: LOVAC.id, t: T(2), lat: 44.881, lon: 16.151 }, { lov_id: LOV, korisnik_id: LOVAC.id, t: T(40), lat: 44.886, lon: 16.156 },
  ];
}

async function openArhiva(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-arhiva').click();
  await expect(page.locator('#arhiva')).toBeVisible();
  await expect(page.locator('#arhiva-spisak .arhiva-red')).toHaveCount(1);
}

test('arhiva lova: datum, vrijeme početka i kraja, učesnici, ulov, rezultat i slike; pretraga', async ({ page }) => {
  const server = makeServer();
  finished(server);
  await setup(page, server, LOVAC);
  await openArhiva(page);
  const row = page.locator('#arhiva-spisak .arhiva-red');
  await expect(row.locator('.trag-naslov b')).toHaveText('Pogon Grmeč');
  await expect(row.locator('.lk-datum')).toContainText('22.11.2026.');
  await expect(row).toContainText('08:15 – 12:40 (4 h 25 min)');
  await expect(row).toContainText('Krupa 1');
  await expect(row.locator('.arh-cipovi')).toContainText('3 učesnika');
  await page.fill('#arhiva-trazi', 'nema ovakvog');
  await expect(page.locator('#arhiva-spisak .arhiva-red')).toHaveCount(0);
  await page.fill('#arhiva-trazi', 'lisica');
  await expect(page.locator('#arhiva-spisak .arhiva-red')).toHaveCount(1);

  await row.locator('[data-akcija="otvori"]').click();
  await expect(page.locator('#arhiva-detalj')).toBeVisible();
  await expect(page.locator('#ad-podnaslov')).toContainText('08:15 – 12:40');
  await expect(page.locator('#ad-stat-ucesnika')).toHaveText('3');
  await expect(page.locator('#ad-stat-ulov')).toHaveText('2');
  await expect(page.locator('#ad-ulov')).toContainText('Divlja svinja');
  await expect(page.locator('#ad-ulov')).toContainText('Lisica');
  await expect(page.locator('#ad-rezultat-tekst')).toHaveText('Dvije divlje svinje i lisica');
  await expect(page.locator('#ad-rezultat-forma')).toBeHidden(); // učesnik ne uređuje rezultat
  await expect(page.locator('#ad-ucesnici')).toContainText('Goran Lovovođa sekcije');
  await expect(page.locator('#ad-ucesnici')).toContainText('Vođa lova');
  await expect(page.locator('#ad-stat-slika')).toHaveText('1');
  await page.locator('#ad-slike .ad-slika img').click();
  await expect(page.locator('#slika-velika')).toBeVisible();
  await expect(page.locator('#slika-velika-opis')).toContainText('Grupa poslije lova');
  await expect.poll(() => page.locator('#slika-velika-img').getAttribute('src')).toContain('data:image/png');
});

test('učesnik dodaje sliku u arhivu lova (mala + smanjena), lovovođa sekcije upisuje rezultat; neučesnik ne može dodati', async ({ page, browser }) => {
  const server = makeServer();
  finished(server);
  server.db.lov_ucesnici = server.db.lov_ucesnici.filter((u) => u.korisnik_id !== LOVAC2.id);
  await setup(page, server, LOVAC);
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await expect(page.locator('#ad-slika-dodaj')).toBeVisible();
  await page.fill('#ad-slika-opis', 'Trofej');
  await page.locator('#ad-slika-ulaz').setInputFiles({ name: 'lov.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => server.db.lov_slike.length).toBe(2);
  const added = server.db.lov_slike.find((x) => x.opis === 'Trofej');
  expect(added).toMatchObject({ lov_id: LOV, autor_id: LOVAC.id });
  expect(added.mala).toMatch(/^data:image\/jpeg/);
  expect(server.db.lov_slike_podaci.find((x) => x.id === added.id).slika).toMatch(/^data:image\/jpeg/);
  await expect(page.locator('#ad-stat-slika')).toHaveText('2');

  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const gv = await ctx2.newPage();
  await setup(gv, server, GV);
  await gv.goto('http://localhost:8123/');
  await gv.locator('#btn-spiskovi').click();
  await gv.locator('#btn-arhiva').click();
  await gv.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await expect(gv.locator('#ad-rezultat-forma')).toBeVisible();
  await gv.fill('#ad-rezultat', 'Tri divlje svinje');
  await gv.locator('#btn-ad-rezultat').click();
  await expect.poll(() => server.db.lovovi[0].rezultat).toBe('Tri divlje svinje');
  await expect(gv.locator('#ad-rezultat-tekst')).toHaveText('Tri divlje svinje');
  await ctx2.close();

  // član koji nije učesnik lova ne dodaje slike
  const ctx3 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const l2 = await ctx3.newPage();
  await setup(l2, server, LOVAC2);
  await l2.goto('http://localhost:8123/');
  await l2.locator('#btn-spiskovi').click();
  await l2.locator('#btn-arhiva').click();
  await l2.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await expect(l2.locator('#ad-podnaslov')).toContainText('22.11.2026.');
  await expect(l2.locator('#ad-slika-dodaj')).toBeHidden();
  await ctx3.close();
});

test('trag kretanja lovaca: iz arhive na karti sa imenima i bojama; checkbox u kartici lova i panelu lova', async ({ page }) => {
  const server = makeServer();
  finished(server);
  await setup(page, server, LOVAC);
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await page.locator('#btn-ad-trag').click();
  await expect(page.locator('#arhiva-detalj')).toBeHidden();
  await expect(page.locator('#lov-trag-legenda .clan-chip')).toHaveCount(2);
  await expect(page.locator('#lov-trag-legenda')).toContainText('Goran');
  await expect(page.locator('#lov-trag-legenda')).toContainText('Lovro');
  await expect(page.locator('#karta path.leaflet-interactive, #karta svg path').first()).toBeAttached();

  // bočna kontrola: tragovi i slike tog lova se prikazuju i sakrivaju posebno
  await expect(page.locator('#arh-karta')).toBeVisible();
  await expect(page.locator('#arh-karta-naziv')).toHaveText('Pogon Grmeč');
  await expect(page.locator('.arh-slika-marker')).toHaveCount(1);
  await expect(page.locator('#arh-karta-slike')).toHaveText('Slike 1');
  await page.locator('#btn-arh-tragovi').click();
  await expect(page.locator('#btn-arh-tragovi')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#lov-trag-legenda')).toBeHidden();
  await expect(page.locator('.arh-slika-marker')).toHaveCount(1); // slike ostaju
  await page.locator('#btn-arh-slike').click();
  await expect(page.locator('.arh-slika-marker')).toHaveCount(0);
  await page.locator('#btn-arh-tragovi').click();
  await expect(page.locator('#lov-trag-legenda .clan-chip')).toHaveCount(2);
  await page.locator('#btn-arh-slike').click();
  await page.locator('.arh-slika-marker').click();
  await expect(page.locator('#slika-velika')).toBeVisible();
  await page.locator('#btn-slika-velika-zatvori').click();
  // Sakrij: lov nestaje sa karte
  await page.locator('#btn-arh-karta-zatvori').click();
  await expect(page.locator('#arh-karta')).toBeHidden();
  await expect(page.locator('#lov-trag-legenda')).toBeHidden();
  await expect(page.locator('.arh-slika-marker')).toHaveCount(0);
});

test('arhiva: kalendar pokazuje mjesec zadnjeg lova, dan sa lovom je označen i otvara lov', async ({ page }) => {
  const server = makeServer();
  finished(server);
  await setup(page, server, LOVAC);
  await openArhiva(page);
  await page.locator('#arh-tabovi [data-arhtab="kalendar"]').click();
  await expect(page.locator('#arh-kalendar-panel')).toBeVisible();
  await expect(page.locator('#arhiva-spisak')).toBeHidden();
  await expect(page.locator('#arh-mjesec')).toHaveText('Novembar 2026.');
  await expect(page.locator('#arh-mjesec-info')).toHaveText('1 lov u 1 dan');
  const dan = page.locator('#arh-kalendar [data-datum="2026-11-22"]');
  await expect(dan).toHaveAttribute('data-lov', 'da');
  await expect(page.locator('#arh-kalendar [data-lov]')).toHaveCount(1);
  // mjesec naprijed: prazno; nazad: opet lov
  await page.locator('#btn-arh-mj-naprijed').click();
  await expect(page.locator('#arh-mjesec')).toHaveText('Decembar 2026.');
  await expect(page.locator('#arh-kalendar [data-lov]')).toHaveCount(0);
  await page.locator('#btn-arh-mj-nazad').click();
  await page.locator('#arh-kalendar [data-datum="2026-11-22"]').click();
  await expect(page.locator('#arhiva-detalj')).toBeVisible();
  await expect(page.locator('#ad-naslov')).toHaveText('Pogon Grmeč');
  await page.locator('#btn-ad-zatvori').click();
  await expect(page.locator('#arh-dan-lovovi [data-id]')).toHaveCount(1);
  // dan bez lova
  await page.locator('#arh-kalendar [data-datum="2026-11-10"]').click();
  await expect(page.locator('#arh-dan-naslov')).toContainText('nema lova');
});

test('lov u toku: checkbox "Prikaži trag kretanja lovaca sekcije" u kartici lova pamti izbor i crta tragove', async ({ page }) => {
  const server = makeServer();
  finished(server);
  server.db.lovovi[0].status = 'u_toku';
  await setup(page, server, LOVAC);
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  const cb = page.locator('#sk-lov input[data-trag]');
  await expect(cb).toBeVisible();
  await expect(cb).not.toBeChecked();
  await cb.check();
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`lovac.lovtrag.prikaz.${id}`), LOV)).toBe('true');
  await page.locator('#nav-mapa').click();
  await expect(page.locator('#lov-trag-legenda .clan-chip')).toHaveCount(2);
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-lov input[data-trag]')).toBeChecked();
  await page.locator('#sk-lov input[data-trag]').uncheck();
  await page.locator('#nav-mapa').click();
  await expect(page.locator('#lov-trag-legenda')).toBeHidden();
});

test('tokom lova: tačke kretanja se bilježe lokalno i šalju na server (samo dok je dijeljenje uključeno)', async ({ page, context }) => {
  const server = makeServer();
  server.db.lov_tragovi = [];
  server.db.lov_pozicije = [];
  await setup(page, server, LOVAC);
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  for (let i = 1; i <= 3; i++) {
    await context.setGeolocation({ latitude: 44.88 + i * 0.001, longitude: 16.15, accuracy: 5 });
    await page.clock.runFor(21000);
  }
  await expect.poll(() => server.db.lov_tragovi.length, { timeout: 10000 }).toBeGreaterThanOrEqual(2);
  expect(server.db.lov_tragovi[0]).toMatchObject({ lov_id: LOV, korisnik_id: LOVAC.id });
  expect(typeof server.db.lov_tragovi[0].lat).toBe('number');

  // isključeno dijeljenje = bez traga
  await page.evaluate(() => localStorage.setItem('lovac.lokacija', JSON.stringify({ on: false, interval: 'normalno' })));
  await page.reload();
  const before = server.db.lov_tragovi.length;
  await page.clock.install();
  await page.clock.runFor(7000);
  await page.clock.runFor(61000);
  await context.setGeolocation({ latitude: 44.9, longitude: 16.2, accuracy: 5 });
  await page.clock.runFor(30000);
  expect(server.db.lov_tragovi.length).toBe(before);
});

test('brisanje lova u arhivi: lovovođa sekcije briše (drugi dodir) — lov nestaje sa servera i iz arhive; član nema dugme', async ({ page, browser }) => {
  const server = makeServer();
  finished(server);
  await setup(page, server, GV);
  let pozvano = 0;
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\/obrisi_lov/, async (route) => {
    pozvano++;
    const { p_lov } = route.request().postDataJSON();
    server.db.lovovi = server.db.lovovi.filter((l) => l.id !== p_lov);
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await expect(page.locator('#ad-brisanje')).toBeVisible();
  await page.locator('#btn-ad-obrisi').click();
  expect(pozvano).toBe(0); // prvi dodir samo pita
  await page.locator('#btn-ad-obrisi').click();
  await expect.poll(() => pozvano).toBe(1);
  await expect(page.locator('#arhiva-detalj')).toBeHidden();
  await expect(page.locator('#arhiva-spisak .arhiva-red')).toHaveCount(0);
  expect(server.db.lovovi).toHaveLength(0);

  // član sekcije ne vidi brisanje
  const server2 = makeServer();
  finished(server2);
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx.newPage();
  await setup(p2, server2, LOVAC);
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-spiskovi').click();
  await p2.locator('#btn-arhiva').click();
  await p2.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await expect(p2.locator('#ad-naslov')).toHaveText('Pogon Grmeč');
  await expect(p2.locator('#ad-brisanje')).toBeHidden();
  await ctx.close();
});

test('brisanje lova koji je neko drugi već obrisao sa servera (vraća false): lov se ipak skloni sa telefona', async ({ page }) => {
  const server = makeServer();
  finished(server);
  await setup(page, server, GV);
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\/obrisi_lov/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'false' }));
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await page.locator('#btn-ad-obrisi').click();
  await page.locator('#btn-ad-obrisi').click();
  await expect(page.locator('#arhiva-detalj')).toBeHidden();
  await expect(page.locator('#arhiva-spisak .arhiva-red')).toHaveCount(0);
});

test('preuzimanje lova na telefon: jedan HTML fajl sa ulovom, učesnicima, velikom slikom i tragovima (Preuzimanja/Lovac)', async ({ page }) => {
  const server = makeServer();
  finished(server);
  await setup(page, server, LOVAC);
  await page.addInitScript(() => {
    window.__sacuvano = [];
    window.AndroidShare = { sacuvaj: (name, mime, content) => { window.__sacuvano.push({ name, mime, content }); return 'preuzimanja'; } };
  });
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  // trag je na telefonu kad je lov jednom prikazan na karti
  await page.locator('#btn-ad-trag').click();
  await expect(page.locator('#arh-karta')).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const q = r.result.transaction('arhiva').objectStore('arhiva').getAll(); q.onsuccess = () => res(q.result.some((x) => String(x.id).startsWith('trag:') && x.rows?.length)); };
  }))).toBe(true);
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-arhiva').click();
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await page.locator('#btn-ad-preuzmi').click();
  await expect(page.locator('#ad-status')).toContainText('Sačuvano u Preuzimanja/Lovac: lov-2026-11-22-pogon-grmec.html');
  const f = (await page.evaluate(() => window.__sacuvano))[0];
  expect(f.name).toBe('lov-2026-11-22-pogon-grmec.html');
  expect(f.mime).toBe('text/html');
  expect(f.content).toContain('<h1>Pogon Grmeč</h1>');
  expect(f.content).toContain('Dvije divlje svinje i lisica');
  expect(f.content).toContain('Lisica</b>: 1 kom., 6 kg');
  expect(f.content).toContain('Goran Lovovođa sekcije');
  expect(f.content).toContain('data:image/png;base64,'); // velika slika sa servera, ne samo sličica
  expect((f.content.match(/<polyline/g) || []).length).toBe(2);
  expect(f.content).toContain('Ne zamjenjuje službeni lovački dnevnik');
});

test('završen lov: "Kretanje i pogoci" — pređeno po lovcu, popis pogodaka (sa i bez lokacije) i pogoci na karti sa kontrolom', async ({ page }) => {
  const server = makeServer();
  finished(server);
  server.db.lov_odstrel[0] = { ...server.db.lov_odstrel[0], vrijeme: T(60), lat: 44.8851, lon: 16.1543, stan_broj: 2 };
  await setup(page, server, LOVAC);
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await expect(page.locator('#ad-kretanje-kartica')).toBeVisible();
  // pogoci: jedan sa lokacijom (Na karti), jedan bez (samo napomena)
  await expect(page.locator('#ad-pogoci li[data-id]')).toHaveCount(1);
  await expect(page.locator('#ad-pogoci li[data-id]')).toContainText('Divlja svinja');
  await expect(page.locator('#ad-pogoci li[data-id]')).toContainText('stan 2');
  await expect(page.locator('#ad-pogoci')).toContainText('Za 1 komad lokacija nije zabilježena');
  // kretanje: trag se preuzme i pokaže pređeni put i trajanje po lovcu
  await expect(page.locator('#ad-kretanje li')).toHaveCount(2);
  await expect(page.locator('#ad-kretanje')).toContainText('Goran');
  await expect(page.locator('#ad-kretanje')).toContainText('Lovro');
  await expect(page.locator('#ad-kretanje li').first()).toContainText(/\d+ m|\d,\d\d km/);
  await expect(page.locator('#ad-kretanje li').first()).toContainText('min');
  // Na karti: detalj se zatvara, pogodak je na karti sa otvorenom karticom, kontrola ga prikazuje i sakriva
  await page.locator('#ad-pogoci [data-akcija="pogodak"]').click();
  await expect(page.locator('#arhiva-detalj')).toBeHidden();
  await expect(page.locator('.arh-pogodak')).toHaveCount(1);
  await expect(page.locator('#arh-karta-pogoci')).toHaveText('Pogoci 1');
  await expect(page.locator('.leaflet-popup')).toContainText('Divlja svinja');
  await expect(page.locator('.leaflet-popup')).toContainText('Lovro Lovac');
  expect(await page.evaluate(() => window.__karta.getZoom())).toBeGreaterThanOrEqual(17);
  await page.locator('#btn-arh-pogoci').click();
  await expect(page.locator('.arh-pogodak')).toHaveCount(0);
  await page.locator('#btn-arh-pogoci').click();
  await expect(page.locator('.arh-pogodak')).toHaveCount(1);
  await page.locator('#btn-arh-karta-zatvori').click();
  await expect(page.locator('.arh-pogodak')).toHaveCount(0);
});

test('lov na karti iz arhive (dugme): pogoci i tragovi zajedno; lov bez lokacija pogodaka ima dugme Pogoci onemogućeno', async ({ page }) => {
  const server = makeServer();
  finished(server);
  server.db.lov_odstrel[0] = { ...server.db.lov_odstrel[0], vrijeme: T(60), lat: 44.8851, lon: 16.1543 };
  await setup(page, server, LOVAC);
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await page.locator('#btn-ad-trag').click();
  await expect(page.locator('.arh-pogodak')).toHaveCount(1);
  await expect(page.locator('#lov-trag-legenda .clan-chip')).toHaveCount(2);
  await page.locator('#btn-arh-karta-zatvori').click();
  // bez lokacija: dugme je onemogućeno
  server.db.lov_odstrel.forEach((o) => { delete o.lat; delete o.lon; });
  await page.reload();
  await openArhiva(page);
  await page.locator('#arhiva-spisak [data-akcija="otvori"]').click();
  await page.locator('#btn-ad-trag').click();
  await expect(page.locator('#btn-arh-pogoci')).toBeDisabled();
});

test('Zajednički lov: lovovođa sekcije briše lov (i planirani) drugim dodirom; član nema dugme', async ({ page, browser }) => {
  const server = makeServer();
  Object.assign(server.db.lovovi[0], { status: 'planiran', datum: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
  await setup(page, server, GV);
  const rpc = [];
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\/obrisi_lov/, async (route) => {
    const { p_lov } = route.request().postDataJSON();
    rpc.push(p_lov);
    server.db.lovovi = server.db.lovovi.filter((l) => l.id !== p_lov);
    await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
  });
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  const kartica = page.locator('#lovovi-spisak [data-id]');
  await expect(kartica).toHaveCount(1);
  await expect(kartica).toHaveAttribute('data-status', 'planiran');
  const dugme = kartica.locator('[data-akcija="obrisi"]');
  await expect(dugme).toBeVisible();
  await dugme.click();
  await expect(dugme).toContainText('Dodirni ponovo');
  expect(rpc).toHaveLength(0);
  await dugme.click();
  await expect.poll(() => rpc.length).toBe(1);
  expect(rpc[0]).toBe(LOV);
  await expect(page.locator('#lovovi-spisak [data-id]')).toHaveCount(0);
  expect(server.db.lovovi).toHaveLength(0);

  // član sekcije nema dugme
  const server2 = makeServer();
  Object.assign(server2.db.lovovi[0], { status: 'planiran', datum: new Date(Date.now() + 86400000).toISOString().slice(0, 10) });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx.newPage();
  await setup(p2, server2, LOVAC);
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-spiskovi').click();
  await p2.locator('#btn-lovovi').click();
  await expect(p2.locator('#lovovi-spisak [data-id]')).toHaveCount(1);
  await expect(p2.locator('#lovovi-spisak [data-akcija="obrisi"]')).toHaveCount(0);
  await ctx.close();
});

test('Zajednički lov: administrator vidi "Obriši lov" na svakom lovu; greška servera (nema prava) se prikazuje, lov ostaje', async ({ page }) => {
  const server = makeServer();
  Object.assign(server.db.lovovi[0], { status: 'zavrsen', datum: '2026-11-22', pocetak: T(0), kraj: T(60) });
  server.db.korisnici = server.db.korisnici.map((k) => (k.id === LOVAC.id ? { ...k, is_admin: true } : k));
  await setup(page, server, { ...LOVAC, is_admin: true });
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\/obrisi_lov/, (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Lov briše administrator ili lovovođa sekcije tog lova' }) }));
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  const dugme = page.locator('#lovovi-spisak [data-akcija="obrisi"]');
  await expect(dugme).toBeVisible();
  await dugme.click();
  await dugme.click();
  await expect(page.locator('#lovovi-status')).toContainText('Lov nije obrisan');
  await expect(page.locator('#lovovi-spisak [data-id]')).toHaveCount(1);
});
