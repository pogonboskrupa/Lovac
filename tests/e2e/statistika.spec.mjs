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


function rpcData() {
  const rejting = (uid, sek, o) => ({ korisnik_id: uid, sekcija_id: sek, revir_id: R.krupa, lovova_odrzano: 4, lovova_ucesce: 4, mjeseci_lovova: 3, mjeseci_ucesce: 3,
    komada: 0, kg: 0, vrsta: 0, prijava_ukupno: 0, prijava_u_roku: 0, ...o });
  return {
    statistika_ulov: [
      { revir_id: R.krupa, sekcija_id: ID(200), vrsta: 'zec', mjesec: '2026-01-01', komada: 2, kg: 7 },
      { revir_id: R.krupa, sekcija_id: ID(200), vrsta: 'srna', mjesec: '2026-03-01', komada: 1, kg: 22 },
      { revir_id: R.otoka, sekcija_id: ID(202), vrsta: 'srna', mjesec: '2026-03-01', komada: 1, kg: 21 },
    ],
    statistika_lovovi: [
      { revir_id: R.krupa, sekcija_id: ID(200), lovova: 4, ucesca: 6, clanova: 2 },
      { revir_id: R.otoka, sekcija_id: ID(202), lovova: 2, ucesca: 1, clanova: 1 },
    ],
    rejting_podaci: [
      rejting(LOVAC.id, ID(200), { lovova_ucesce: 2, komada: 1, vrsta: 1, prijava_ukupno: 1, prijava_u_roku: 1 }),
      rejting(LOVAC2.id, ID(200), { komada: 2, vrsta: 2, prijava_ukupno: 2, prijava_u_roku: 2 }),
      rejting(GV.id, ID(200), { lovova_odrzano: 0, lovova_ucesce: 0, mjeseci_lovova: 0, mjeseci_ucesce: 0 }),
    ],
  };
}

async function withRpc(page, { fail = false } = {}) {
  const calls = [];
  const data = rpcData();
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\//, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    calls.push({ name, args: route.request().postDataJSON() });
    if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'nema' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data[name] || []) });
  });
  return calls;
}

async function openStat(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-statistika').click();
  await expect(page.locator('#statistika')).toBeVisible();
}

test('Statistika (administrator): društvo, po revirima i sekcijama, godina i izbor opsega idu na server', async ({ page }) => {
  const server = makeServer();
  server.db.korisnici.push(ADMIN);
  await setup(page, server, ADMIN);
  const calls = await withRpc(page);
  await openStat(page);
  await expect(page.locator('#st-opseg')).toContainText('Cijelo društvo');
  await expect(page.locator('#st-opseg')).toContainText('Revir Krupa');
  await expect(page.locator('#st-opseg')).toContainText('Sekcija Krupa · Krupa 1');
  await expect(page.locator('#st-lovova')).toHaveText('6');
  await expect(page.locator('#st-ucesca')).toHaveText('7');
  await expect(page.locator('#st-komada')).toHaveText('4');
  await expect(page.locator('#st-kg')).toHaveText('50');
  await expect(page.locator('#st-vrsta')).toHaveText('2');
  await expect(page.locator('#st-reviri .tr-kartica')).toHaveCount(2);
  await expect(page.locator('#st-sekcije .tr-kartica')).toHaveCount(2);
  await expect(page.locator('#st-mjeseci .pr-mj[data-mjesec="3"]')).toHaveAttribute('data-n', '2');
  const first = calls.find((c) => c.name === 'statistika_ulov');
  expect(first.args).toMatchObject({ p_sek: null, p_revir: null, p_od: `${new Date().getFullYear()}-01-01` });
  // sekcija
  calls.length = 0;
  await page.locator('#st-opseg').selectOption({ label: 'Sekcija Krupa · Krupa 1' });
  await expect.poll(() => calls.some((c) => c.name === 'rejting_podaci')).toBe(true);
  expect(calls.find((c) => c.name === 'rejting_podaci').args).toMatchObject({ p_sek: ID(200), p_revir: null });
  await expect(page.locator('#st-reviri-blok')).toBeHidden();
  await expect(page.locator('#st-sekcije-blok')).toBeHidden();
  // sve godine
  calls.length = 0;
  await page.locator('#st-godine [data-godina="sve"]').click();
  await expect.poll(() => calls.length).toBeGreaterThan(0);
  expect(calls[0].args).toMatchObject({ p_od: null, p_do: null });
});

test('Rejting: ljestvica po kriterijima, mjesta, "ti" označen, objašnjenje i nerangirani na kraju', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await withRpc(page);
  await openStat(page);
  await page.locator('#st-tabovi [data-tab="rejting"]').click();
  await expect(page.locator('#st-tab-statistika')).toBeHidden();
  const rows = page.locator('#st-rejting .st-red');
  await expect(rows).toHaveCount(3);
  // LOVAC2: odaziv 100, tačnost 100, redovnost 100, raznovrsnost 2/4=50, ulov 2/10=20 → (40+25+15+5+2)/100 = 87; LOVAC: odaziv 50 → 50*40+100*25+100*15+25*10+10*10 = 6350/100... normalizirano
  await expect(rows.nth(0)).toHaveAttribute('data-id', LOVAC2.id);
  await expect(rows.nth(0)).toHaveAttribute('data-mjesto', '1');
  await expect(rows.nth(1)).toHaveAttribute('data-id', LOVAC.id);
  await expect(rows.nth(1)).toHaveClass(/moj/);
  await expect(rows.nth(1)).toContainText('(ti)');
  await expect(rows.nth(2)).toHaveAttribute('data-id', GV.id);
  await expect(rows.nth(2)).toContainText('nema održanih lovova');
  await expect(rows.nth(2)).toHaveAttribute('data-mjesto', '');
  await rows.nth(0).locator('summary').click();
  await expect(rows.nth(0).locator('.st-dijelovi')).toContainText('Odaziv na lovove');
  await expect(page.locator('#st-kriteriji .tr-kartica')).toHaveCount(5);
  await expect(page.locator('#st-kriteriji-izvor')).toContainText('zadane težine');
  await expect(page.locator('#st-kriteriji-admin')).toBeHidden();
  await expect(page.locator('#st-rejting-opis')).toContainText('Ljestvica sekcije');
});

test('Statistika: lovac vidi samo svoju sekciju (jedan opseg), bez izbora revira i društva', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  const calls = await withRpc(page);
  await openStat(page);
  await expect(page.locator('#st-opseg')).toBeHidden(); // jedan opseg: nema izbora
  await expect(page.locator('#st-reviri-blok')).toBeHidden();
  await expect(page.locator('#st-sekcije-blok')).toBeHidden();
  expect(calls.find((c) => c.name === 'statistika_lovovi').args).toMatchObject({ p_sek: ID(200), p_revir: null });
});

test('Rejting: administrator podešava težine (zapis ide na server), neispravna vrijednost se odbija', async ({ page }) => {
  const server = makeServer();
  server.db.korisnici.push(ADMIN);
  await setup(page, server, ADMIN);
  await withRpc(page);
  await openStat(page);
  await page.locator('#st-tabovi [data-tab="rejting"]').click();
  await expect(page.locator('#st-kriteriji-admin')).toBeVisible();
  await page.fill('input[name="t-odaziv"]', '150');
  await page.locator('#st-kriteriji-forma button[type=submit]').click();
  await expect(page.locator('#st-kriteriji-status')).toContainText('od 0 do 100');
  expect(server.db.rejting_kriteriji?.length || 0).toBe(0);
  await page.fill('input[name="t-odaziv"]', '50');
  await page.locator('#st-kriteriji-forma button[type=submit]').click();
  await expect(page.locator('#st-kriteriji-status')).toContainText('sačuvane');
  expect(server.db.rejting_kriteriji.find((k) => k.kod === 'odaziv').tezina).toBe(50);
  expect(server.db.rejting_kriteriji).toHaveLength(5);
});

test('Statistika bez veze sa serverom prikazuje zadnje sačuvano stanje', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  let calls = await withRpc(page);
  await openStat(page);
  await expect(page.locator('#st-komada')).toHaveText('4');
  await expect(page.locator('#st-stanje')).toContainText('upravo osvježeni');
  // ponovo otvori sa serverom koji ne odgovara
  await page.unroute(/lazni\.supabase\.test\/rest\/v1\/rpc\//);
  calls = await withRpc(page, { fail: true });
  await page.locator('#btn-statistika-zatvori').click();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-statistika').click();
  await expect(page.locator('#st-stanje')).toContainText('prikazano stanje od');
  await expect(page.locator('#st-komada')).toHaveText('4');
});
