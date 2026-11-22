import { test, expect } from '@playwright/test';
import { serveTiles, PNG } from './helpers.mjs';

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



const seed = (page, store, rows) => page.evaluate(async ([s, r]) => {
  const bin = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const db = await new Promise((res) => { const q = indexedDB.open('lovac'); q.onsuccess = () => res(q.result); });
  await new Promise((res) => {
    const tx = db.transaction(s, 'readwrite');
    r.forEach((x) => tx.objectStore(s).put(x.__b64 ? { ...x, blob: new Blob([bin(x.__b64)], { type: 'image/png' }), __b64: undefined } : x));
    tx.oncomplete = res;
  });
}, [store, rows]);

test('fotografije objekta idu na server (sličica + smanjena slika); šalju se samo vlastiti sinhronizovani zapisi', async ({ page }) => {
  const server = makeServer();
  server.db.slike_zapisa = [];
  await setup(page, server, LOVAC);
  await page.goto('/');
  const base = { vidljivost: 'drustvo', rev: 1, lat: 44.88, lon: 16.15, naziv: 'Čeka', vrsta: 'cekalo', stanje: 'dobro' };
  await seed(page, 'fotografije', [{ id: 'foto-sinh-0001', mime: 'image/png', created_at: 1, __b64: PNG.toString('base64') }, { id: 'foto-nesinh-0002', mime: 'image/png', created_at: 1, __b64: PNG.toString('base64') }, { id: 'foto-tudja-0003', mime: 'image/png', created_at: 1, __b64: PNG.toString('base64') }]);
  await seed(page, 'objekti', [
    { ...base, id: ID(910), sinhronizovano: true, fotografije: ['foto-sinh-0001'] },
    { ...base, id: ID(911), sinhronizovano: false, fotografije: ['foto-nesinh-0002'] },
    { ...base, id: ID(912), sinhronizovano: true, tudji: true, fotografije: ['foto-tudja-0003'] },
  ]);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('zapisi:promjena', { detail: {} })));
  await expect.poll(() => server.db.slike_zapisa.length, { timeout: 15000 }).toBe(1);
  const row = server.db.slike_zapisa[0];
  expect(row).toMatchObject({ id: 'foto-sinh-0001', zapis_store: 'objekti', zapis_id: ID(910) });
  expect(row.mala).toMatch(/^data:image\/jpeg/);
  expect(row.slika).toMatch(/^data:image\/jpeg/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.foto.poslane')))).toEqual(['foto-sinh-0001']);
  // ponovo: ne šalje isto drugi put
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('zapisi:promjena', { detail: {} })));
  await page.waitForTimeout(1500);
  expect(server.db.slike_zapisa).toHaveLength(1);
});

test('tuđa fotografija se preuzima sa servera kad je nema na telefonu; istekla velika ostaje kao sličica', async ({ page }) => {
  const server = makeServer();
  const dataUrl = 'data:image/png;base64,' + PNG.toString('base64');
  server.db.slike_zapisa = [
    { id: 'foto-udaljena-1', zapis_store: 'objekti', zapis_id: ID(920), vlasnik_id: GV.id, mala: dataUrl, slika: dataUrl },
    { id: 'foto-istekla-2', zapis_store: 'objekti', zapis_id: ID(920), vlasnik_id: GV.id, mala: dataUrl, slika: null },
  ];
  await setup(page, server, LOVAC);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const m = await import('/static/js/foto.js');
    const read = (id) => new Promise((res) => { const q = indexedDB.open('lovac'); q.onsuccess = () => { const g = q.result.transaction('fotografije').objectStore('fotografije').get(id); g.onsuccess = () => res(g.result); }; });
    const a = await m.photoUrl('foto-udaljena-1');
    const b = await m.photoUrl('foto-istekla-2');
    const c = await m.photoUrl('foto-nepostojeca-3');
    return { a: Boolean(a), b: Boolean(b), c, cachedA: Boolean(await read('foto-udaljena-1')), samoMala: (await read('foto-istekla-2'))?.samoMala };
  });
  expect(result).toEqual({ a: true, b: true, c: null, cachedA: true, samoMala: true });
});

test('jednom dnevno poziva čišćenje isteklih velikih slika na serveru', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  const calls = [];
  await page.route(/lazni\.supabase\.test\/rest\/v1\/rpc\/ocisti_istekle_slike/, (r) => { calls.push(1); r.fulfill({ status: 200, contentType: 'application/json', body: '0' }); });
  await page.clock.install();
  await page.goto('/');
  await page.clock.runFor(12000);
  await expect.poll(() => calls.length).toBe(1);
  await page.clock.runFor(120000);
  expect(calls).toHaveLength(1); // nije prošlo 24 h
});
