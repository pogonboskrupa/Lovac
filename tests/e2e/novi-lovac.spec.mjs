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


const rpcCalls = [];

async function withRpc(page, { odobren = true, error = null } = {}) {
  rpcCalls.length = 0;
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\//, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    rpcCalls.push({ name, body: route.request().postDataJSON() });
    if (error) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: error }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(name === 'kreiraj_korisnika' ? { id: ID(777), odobren } : null) });
  });
}

async function openTab(page) {
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sk-clanovi [data-uid]').first()).toBeVisible();
}

async function fillAndSend(page) {
  await page.fill('#forma-lovac-novi [name=ime]', 'Mujo');
  await page.fill('#forma-lovac-novi [name=prezime]', 'Mujić');
  await page.fill('#forma-lovac-novi [name=nadimak]', '127');
  await page.fill('#forma-lovac-novi [name=pin]', '123456');
  await page.locator('#btn-ln-posalji').click();
}

test('grupovođa pravi nalog: server dobija interni email i PIN, nalog je odmah u sekciji', async ({ page }) => {
  await setup(page, makeServer(), GV);
  await withRpc(page, { odobren: true });
  await openTab(page);
  await expect(page.locator('#btn-sk-novi')).toHaveText('Dodaj lovca (novi nalog)');
  await page.locator('#btn-sk-novi').click();
  await expect(page.locator('#lovac-novi')).toBeVisible();
  await expect(page.locator('#ln-sekcija')).toHaveValue(ID(200));
  await expect(page.locator('#ln-uputa')).toContainText('odmah odobren');
  await fillAndSend(page);
  await expect(page.locator('#ln-gotovo')).toBeVisible();
  await expect(page.locator('#ln-gotovo-tekst')).toContainText('Mujo Mujić je dodan u sekciju');
  expect(rpcCalls).toHaveLength(1);
  expect(rpcCalls[0]).toEqual({ name: 'kreiraj_korisnika', body: {
    p_ime: 'Mujo', p_prezime: 'Mujić', p_nadimak: '127', p_pin: '123456', p_email: 'mujo.mujic.127@lovci.grmec.app', p_sekcija: ID(200),
  } });
  await page.locator('#btn-ln-jos').click();
  await expect(page.locator('#forma-lovac-novi')).toBeVisible();
  await expect(page.locator('#forma-lovac-novi [name=pin]')).toHaveValue('');
});

test('obični član samo predlaže: poruka kaže da grupovođa mora odobriti', async ({ page }) => {
  await setup(page, makeServer(), LOVAC);
  await withRpc(page, { odobren: false });
  await openTab(page);
  await expect(page.locator('#btn-sk-novi')).toContainText('Predloži lovca');
  await page.locator('#btn-sk-novi').click();
  await expect(page.locator('#ln-uputa')).toContainText('grupovođa sekcije odobri');
  await fillAndSend(page);
  await expect(page.locator('#ln-gotovo-tekst')).toContainText('tek kad grupovođa odobri');
});

test('lovočuvar revira pravi nalog direktno; lovac van sekcije nema dugme', async ({ page, browser }) => {
  const server = makeServer();
  server.db.revir_lovocuvari.push({ revir_id: R.krupa, korisnik_id: VAN.id });
  await setup(page, server, VAN);
  await withRpc(page, { odobren: true });
  await page.goto('/');
  await page.locator('#btn-sekcija').click();
  // lovočuvar: spisak lovaca je zadano sklopljen (v1.1.5), dodir na naslov ga rasklapa
  await expect(page.locator('#btn-sk-lovci')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#btn-sk-lovci').click();
  await expect(page.locator('#btn-sk-novi')).toHaveText('Dodaj lovca (novi nalog)');
  await page.locator('#btn-sk-novi').click();
  await expect(page.locator('#ln-sekcija option')).toHaveCount(2);

  const ctx2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const p2 = await ctx2.newPage();
  await setup(p2, makeServer(), { ...VAN, id: ID(9), ime: 'Nov', prezime: 'Lovac' });
  await p2.goto('http://localhost:8123/');
  await p2.locator('#btn-sekcija').click();
  await expect(p2.locator('#sk-prazno')).toBeVisible();
  await expect(p2.locator('#btn-sk-novi')).toBeHidden();
  await ctx2.close();
});

test('greška servera (duplikat) se prikazuje, a ne gubi se', async ({ page }) => {
  await setup(page, makeServer(), GV);
  await withRpc(page, { error: 'Korisnik s tim imenom i prezimenom već postoji. Upiši nadimak ili broj člana.' });
  await openTab(page);
  await page.locator('#btn-sk-novi').click();
  await fillAndSend(page);
  await expect(page.locator('#ln-status')).toContainText('već postoji');
  await expect(page.locator('#ln-gotovo')).toBeHidden();
});

test('neispravan PIN se odbija prije slanja na server', async ({ page }) => {
  await setup(page, makeServer(), GV);
  await withRpc(page);
  await openTab(page);
  await page.locator('#btn-sk-novi').click();
  await page.fill('#forma-lovac-novi [name=ime]', 'Mujo');
  await page.fill('#forma-lovac-novi [name=prezime]', 'Mujić');
  await page.fill('#forma-lovac-novi [name=pin]', '123');
  await page.locator('#btn-ln-posalji').click();
  await expect(page.locator('#ln-status')).toHaveText('PIN mora imati 6 do 8 cifara');
  expect(rpcCalls).toHaveLength(0);
});

test('grupovođa odobrava predloženog lovca preko funkcije, a običan zahtjev preko tabele', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push(
    { sekcija_id: ID(200), korisnik_id: VAN.id, status: 'ceka', pozvao_id: LOVAC.id },
  );
  await setup(page, server, GV);
  await withRpc(page);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-sekcije').click();
  const card = page.locator(`.sekcija-kartica[data-id="${ID(200)}"]`);
  await card.locator('details.uprava summary').click();
  await expect(card.locator(`[data-uid="${VAN.id}"]`)).toContainText('predložio');
  await card.locator(`[data-uid="${VAN.id}"] [data-akcija="odobri"]`).click();
  await expect.poll(() => rpcCalls.map((c) => c.name)).toContain('odobri_pozvanog');
  expect(rpcCalls.find((c) => c.name === 'odobri_pozvanog').body).toEqual({ p_sekcija: ID(200), p_korisnik: VAN.id });
});

test('promjena vlastitog PIN-a iz Postavki', async ({ page }) => {
  await setup(page, makeServer(), LOVAC);
  let sent = null;
  await page.route(/lazni\.supabase\.test\/auth\/v1\/user/, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: LOVAC.id, aud: 'authenticated', role: 'authenticated' }) });
  });
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await page.fill('#novi-pin', '12');
  await page.locator('#btn-pin-promijeni').click();
  await expect(page.locator('#pin-status')).toHaveText('PIN mora imati 6 do 8 cifara');
  await page.fill('#novi-pin', '87654321');
  await page.locator('#btn-pin-promijeni').click();
  await expect(page.locator('#pin-status')).toContainText('PIN je promijenjen');
  expect(sent).toMatchObject({ password: '87654321' });
});
