import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SEKCIJA = 7, CLANOVA = 10, MAX_ROWS = 1000;
const START = Date.parse('2026-11-23T07:00:00Z');

function makeWorld() {
  const korisnici = [], sekcije = [], sekcija_clanovi = [], lovovi = [], lov_ucesnici = [], lov_pozicije = [], lov_tragovi = [];
  const pos = new Map();
  let n = 1;
  for (let s = 0; s < SEKCIJA; s++) {
    const sid = ID(200 + s), lid = ID(300 + s);
    const clanovi = [];
    for (let c = 0; c < CLANOVA; c++) {
      const u = { id: ID(n++), ime: `Lovac${s}${c}`, prezime: `Sekcija${s}`, odobren: true, is_admin: false };
      korisnici.push(u); clanovi.push(u);
      sekcija_clanovi.push({ sekcija_id: sid, korisnik_id: u.id, status: 'odobren' });
      lov_ucesnici.push({ lov_id: lid, korisnik_id: u.id, uloga: c === 0 ? 'vodja' : 'strijelac' });
      // 4 h traga, tačka svakih 60 s, šetnja oko stana
      const lat0 = 44.85 + s * 0.02, lon0 = 16.1 + c * 0.004;
      for (let k = 0; k < 240; k++) {
        lov_tragovi.push({ id: ID(100000 + lov_tragovi.length), lov_id: lid, korisnik_id: u.id,
          lat: lat0 + k * 0.00005, lon: lon0 + Math.sin(k / 10) * 0.0005, t: new Date(START - (240 - k) * 60000).toISOString(), primljeno: new Date(START - (240 - k) * 60000).toISOString() });
      }
      pos.set(u.id, { lat: lat0 + 0.012, lon: lon0 });
    }
    sekcije.push({ id: sid, revir_id: ID(100), naziv: `Sekcija ${s + 1}`, grupovodja_id: clanovi[0].id, aktivno: true });
    lovovi.push({ id: lid, revir_id: ID(100), sekcija_id: sid, naziv: `Lov ${s + 1}`, datum: '2026-11-23', status: 'u_toku', organizator_id: clanovi[0].id });
  }
  return { korisnici, reviri: [{ id: ID(100), naziv: 'Krupa', aktivno: true }], grupovodje: [], revir_lovocuvari: [], sekcije, sekcija_clanovi,
    lovovi, lov_ucesnici, lov_pozicije, lov_tragovi, stanovi: [], sektori: [], sos: [], poruke: [], lov_dogadjaji: [], pos };
}

async function simulate(page, { rpc }) {
  const db = makeWorld();
  const ja = db.korisnici[0]; // grupovođa sekcije 1, učesnik lova 1
  const stat = new Map(); let bytes = 0; let tragBytes = 0;
  const bump = (k) => stat.set(k, (stat.get(k) || 0) + 1);
  const match = (row, params) => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict', 'offset'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('gt.')) return String(row[k]) > v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(row[k]));
    return true;
  });
  // ostali lovci se pomjeraju i šalju svoje pozicije/tragove (kao njihovi telefoni)
  const moveOthers = (now) => {
    db.lov_pozicije = [];
    for (const u of db.korisnici) {
      if (u.id === ja.id) continue;
      const p = db.pos.get(u.id); p.lat += 0.0002; p.lon += (Math.random() - 0.5) * 0.0003;
      const lid = db.lov_ucesnici.find((x) => x.korisnik_id === u.id).lov_id;
      db.lov_pozicije.push({ lov_id: lid, korisnik_id: u.id, lat: p.lat, lon: p.lon, t: new Date(now).toISOString() });
      db.lov_tragovi.push({ id: ID(500000 + db.lov_tragovi.length), lov_id: lid, korisnik_id: u.id, lat: p.lat, lon: p.lon, t: new Date(now).toISOString(), primljeno: new Date(now).toISOString() });
    }
  };
  let fakeNow = START;
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(/lazni\.supabase\.test\/rest\/v1\//, async (route) => {
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split('/').pop();
    bump(`${req.method()} ${table}`);
    if (url.pathname.includes('/rpc/')) {
      if (table !== 'lov_trag' || !rpc) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) });
      const a = req.postDataJSON();
      let rows = db.lov_tragovi.filter((r) => r.lov_id === a.p_lov && (!a.p_od || String(r[a.p_kolona]) > a.p_od));
      const col = (url.searchParams.get('order') || 't').split('.')[0];
      rows = [...rows].sort((x, y) => String(x[col]).localeCompare(String(y[col])) || x.korisnik_id.localeCompare(y.korisnik_id));
      const off = Number(url.searchParams.get('offset') || 0);
      const lim = Math.min(Number(url.searchParams.get('limit') || MAX_ROWS), MAX_ROWS);
      const body = JSON.stringify(rows.slice(off, off + lim)); bytes += body.length; tragBytes += body.length;
      return route.fulfill({ status: 200, contentType: 'application/json', body });
    }
    let rows = db[table] || (db[table] = []);
    if (req.method() === 'GET') {
      if (table === 'lov_pozicije') moveOthers(fakeNow);
      rows = (db[table]).filter((r) => match(r, url.searchParams));
      const ord = url.searchParams.get('order') || '';
      const col = ord.split('.')[0];
      if (col) rows = [...rows].sort((a, b) => (String(a[col]).localeCompare(String(b[col])) || String(a.korisnik_id).localeCompare(String(b.korisnik_id))) * (ord.includes('.desc') ? -1 : 1));
      const off = Number(url.searchParams.get('offset') || 0);
      const lim = Math.min(Number(url.searchParams.get('limit') || MAX_ROWS), MAX_ROWS);
      rows = rows.slice(off, off + lim);
      const body = JSON.stringify(rows); bytes += body.length;
      if (table === 'lov_tragovi') tragBytes += body.length;
      return route.fulfill({ status: 200, contentType: 'application/json', body });
    }
    if (req.method() === 'POST') {
      for (const r of [].concat(req.postDataJSON())) rows.push({ id: ID(900000 + rows.length), ...r, primljeno: new Date(fakeNow).toISOString() });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 204, body: '' });
  });
  await page.addInitScript((u) => {
    localStorage.setItem('lovac.profil', JSON.stringify(u));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 360000, user: { id: u.id, aud: 'authenticated', role: 'authenticated' } }));
  }, ja);
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 44.862, longitude: 16.1, accuracy: 5 });
  await page.clock.install({ time: START });
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.clock.runFor(70000);
  await page.evaluate((lid) => document.dispatchEvent(new CustomEvent('lovtrag:trazi', { detail: { lovId: lid, on: true, live: true } })), db.lovovi[0].id);
  stat.clear(); bytes = 0; tragBytes = 0;
  const MIN = 10;
  for (let i = 0; i < MIN * 6; i++) { fakeNow += 10000; await page.clock.runFor(10000); }
  await page.waitForTimeout(500);
  const markers = await page.locator('.uc-marker').count();
  const lines = await page.evaluate(() => [...document.querySelectorAll('path.leaflet-interactive, path')].length);
  const cache = await page.evaluate((lid) => new Promise((res) => { const r = indexedDB.open('lovac'); r.onsuccess = () => { const q = r.result.transaction('arhiva').objectStore('arhiva').get('trag:' + lid); q.onsuccess = () => res(q.result?.rows || []); }; }), db.lovovi[0].id);
  const tragRows = cache.map((x) => ({ ...x, t: new Date(x.t).toISOString() }));
  const perUser = [...tragRows.reduce((m, r) => m.set(r.korisnik_id, (m.get(r.korisnik_id) || 0) + 1), new Map()).values()];
  const total = [...stat.values()].reduce((a, b) => a + b, 0);
  console.log('ZAHTJEVI za', MIN, 'min (jedan telefon):', JSON.stringify(Object.fromEntries([...stat].sort((a, b) => b[1] - a[1]))));
  console.log('ukupno zahtjeva/min/telefon:', (total / MIN).toFixed(1), '· primljeno KB/min:', (bytes / 1024 / MIN).toFixed(0), '· od toga trag KB/min:', (tragBytes / 1024 / MIN).toFixed(0));
  console.log('markera kolega:', markers, '· putanja:', lines);
  console.log('zadnje preuzimanje traga: redova', tragRows.length, 'po lovcu', JSON.stringify(perUser), 'najnovija tačka', tragRows.at(-1)?.t);
  const svjezih = db.lov_tragovi.filter((r) => r.lov_id === db.lovovi[0].id).length;
  console.log('na serveru za lov 1:', svjezih, 'tačaka');
  return { tragRows, perUser, svjezih, total, bytes, tragBytes, MIN, markers, lastFix: fakeNow };
}

for (const rpc of [true, false]) {
  test(`simulacija 7 sekcija × 10 lovaca: trag kretanja je potpun i preuzima se samo novo (${rpc ? 'funkcija lov_trag' : 'bez migracije 028'})`, async ({ page }) => {
    test.setTimeout(120000);
    const r = await simulate(page, { rpc });
    // svih 10 lovaca, cijeli trag (ne samo prvih 1000 redova) i najnovija tačka iz zadnje minute
    expect(r.perUser.length).toBe(CLANOVA);
    expect(r.tragRows.length).toBeGreaterThanOrEqual(r.svjezih - 40);
    expect(Date.parse(r.tragRows.at(-1).t)).toBeGreaterThan(r.lastFix - 60000);
    // trag se ne preuzima ponovo cijeli svakih 30 s (staro: ~1 MB/min)
    expect(r.tragBytes / 1024 / r.MIN).toBeLessThan(rpc ? 250 : 400);
    expect(r.markers).toBeGreaterThanOrEqual(CLANOVA - 1);
  });
}
