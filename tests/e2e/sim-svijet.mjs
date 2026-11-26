// Simulacija društva za testove opterećenja: 7 sekcija × 10 lovaca, historija lovova, poruke, tok lova.
// Lažni server se ponaša kao pravi PostgREST u bitnom: najviše 1000 redova po odgovoru, select kolona, gt/in/desc,
// greška 42703 kad kolona `primljeno` ne postoji (migracije 028/029 nisu pokrenute) i RPC lov_trag (028).
import { expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

export const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const SEKCIJA = 7, CLANOVA = 10, MAX_ROWS = 1000;
export const START = Date.parse('2026-11-23T07:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

export function makeWorld({ uToku = true, historija = 0, poruka = 0, dogadjaja = 0 } = {}) {
  const korisnici = [], sekcije = [], sekcija_clanovi = [], lovovi = [], lov_ucesnici = [], lov_tragovi = [], poruke = [], lov_dogadjaji = [];
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
      const lat0 = 44.85 + s * 0.02, lon0 = 16.1 + c * 0.004;
      if (uToku) {
        for (let k = 0; k < 240; k++) {
          const t = iso(START - (240 - k) * 60000);
          lov_tragovi.push({ id: ID(100000 + lov_tragovi.length), lov_id: lid, korisnik_id: u.id, lat: lat0 + k * 0.00005, lon: lon0 + Math.sin(k / 10) * 0.0005, t, primljeno: t });
        }
      }
      pos.set(u.id, { lat: lat0 + 0.012, lon: lon0 });
    }
    sekcije.push({ id: sid, revir_id: ID(100), naziv: `Sekcija ${s + 1}`, grupovodja_id: clanovi[0].id, aktivno: true });
    lovovi.push({ id: lid, revir_id: ID(100), sekcija_id: sid, naziv: `Lov ${s + 1}`, datum: '2026-11-23', status: uToku ? 'u_toku' : 'zavrsen',
      organizator_id: clanovi[0].id, promijenjeno: iso(START - 3600000) });
    for (let h = 0; h < historija; h++) {
      const hid = ID(10000 + s * 1000 + h);
      lovovi.push({ id: hid, revir_id: ID(100), sekcija_id: sid, naziv: `Raniji lov ${h}`, datum: iso(START - (h + 1) * 7 * 86400000).slice(0, 10),
        status: 'zavrsen', organizator_id: clanovi[0].id, promijenjeno: iso(START - (h + 1) * 7 * 86400000) });
      for (const u of clanovi) lov_ucesnici.push({ lov_id: hid, korisnik_id: u.id, uloga: 'strijelac' });
    }
    for (let p = 0; p < poruka; p++) {
      const t = iso(START - (poruka - p) * 600000);
      poruke.push({ id: ID(700000 + s * 10000 + p), kanal: 'sekcija', sekcija_id: sid, autor_id: clanovi[p % CLANOVA].id, lov_id: null,
        tekst: `Poruka ${p}: dogovor za sutrašnji lov, okupljanje kod lovačke kuće`, created_at: t, primljeno: t });
    }
    for (let d = 0; d < dogadjaja; d++) {
      const t = iso(START - (dogadjaja - d) * 120000);
      lov_dogadjaji.push({ id: ID(800000 + s * 1000 + d), lov_id: lid, autor_id: clanovi[d % CLANOVA].id, vrsta: 'na_stanu', tekst: null, lat: null, lon: null, created_at: t, primljeno: t });
    }
  }
  return { korisnici, reviri: [{ id: ID(100), naziv: 'Krupa', aktivno: true }], grupovodje: [], revir_lovocuvari: [], sekcije, sekcija_clanovi,
    lovovi, lov_ucesnici, lov_pozicije: [], lov_tragovi, stanovi: [], sektori: [], sos: [], poruke, lov_dogadjaji, lov_odazivi: [], pos };
}

const RECV_TABLES = new Set(['lov_tragovi', 'poruke', 'lov_dogadjaji', 'dojave']);

// Pokreće aplikaciju kao prvi lovac sekcije 1 (lovovođa sekcije, učesnik lova 1) i vraća stanje za mjerenje.
export async function startSim(page, world, { rpc = true, recv = true } = {}) {
  const db = world;
  const ja = db.korisnici[0];
  // net: 'ok' | 'hang' (mrtva veza: zahtjev visi) | 'flaky' (slab signal: ~40 % pada, ~30 % visi, ostalo prolazi)
  const sim = { db, ja, now: START, stat: new Map(), bytes: new Map(), net: 'ok', posts: [] };
  let flakySeed = 7;
  const flakyRoll = () => { flakySeed = (flakySeed * 16807) % 2147483647; return flakySeed / 2147483647; };
  // vraća true ako je zahtjev "progutala" loša mreža
  const badNet = (route) => {
    if (sim.net === 'hang') return new Promise(() => {});
    if (sim.net === 'flaky') {
      const r = flakyRoll();
      if (r < 0.4) return route.abort('failed');
      if (r < 0.7) return new Promise(() => {});
    }
    return null;
  };
  const bump = (k, b = 0) => { sim.stat.set(k, (sim.stat.get(k) || 0) + 1); sim.bytes.set(k, (sim.bytes.get(k) || 0) + b); };
  const match = (row, params) => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict', 'offset', 'columns'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('neq.')) return String(row[k]) !== v.slice(4);
    if (v.startsWith('gt.')) return String(row[k]) > v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(row[k]));
    return true;
  });
  const sortBy = (rows, ord) => {
    const keys = (ord || '').split(',').filter(Boolean).map((o) => { const [c, dir] = o.split('.'); return [c, dir === 'desc' ? -1 : 1]; });
    return keys.length ? [...rows].sort((a, b) => { for (const [c, d] of keys) { const x = String(a[c] ?? '').localeCompare(String(b[c] ?? '')); if (x) return x * d; } return 0; }) : rows;
  };
  const project = (rows, sel) => (!sel || sel === '*' ? rows : rows.map((r) => Object.fromEntries(sel.split(',').map((c) => [c, r[c]]))));
  const page1000 = (rows, url) => {
    const off = Number(url.searchParams.get('offset') || 0);
    const lim = Math.min(Number(url.searchParams.get('limit') || MAX_ROWS), MAX_ROWS);
    return rows.slice(off, off + lim);
  };
  let korak = 0;
  sim.moveOthers = () => {
    const now = sim.now + (++korak);
    db.lov_pozicije = [];
    for (const u of db.korisnici) {
      if (u.id === ja.id) continue;
      const p = db.pos.get(u.id); p.lat += 0.0002; p.lon += (Math.random() - 0.5) * 0.0003;
      const lid = db.lov_ucesnici.find((x) => x.korisnik_id === u.id).lov_id;
      if (db.lovovi.find((l) => l.id === lid)?.status !== 'u_toku') continue;
      db.lov_pozicije.push({ lov_id: lid, korisnik_id: u.id, lat: p.lat, lon: p.lon, t: iso(now) });
      db.lov_tragovi.push({ id: ID(500000 + db.lov_tragovi.length), lov_id: lid, korisnik_id: u.id, lat: p.lat, lon: p.lon, t: iso(now), primljeno: iso(now) });
    }
  };
  const json = (route, status, body, key) => { const s = JSON.stringify(body); bump(key, s.length); return route.fulfill({ status, contentType: 'application/json', body: s }); };

  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, (r) => badNet(r) || r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(/lazni\.supabase\.test\/rest\/v1\//, async (route) => {
    const bad = badNet(route);
    if (bad) return bad;
    const req = route.request(); const url = new URL(req.url()); const table = url.pathname.split('/').pop();
    const key = `${req.method()} ${url.pathname.includes('/rpc/') ? 'rpc/' : ''}${table}`;
    if (url.pathname.includes('/rpc/')) {
      if (table !== 'lov_trag' || !rpc) return json(route, 404, { code: 'PGRST202', message: 'Could not find the function' }, key);
      const a = req.postDataJSON();
      const rows = db.lov_tragovi.filter((r) => r.lov_id === a.p_lov && (!a.p_od || String(r[a.p_kolona]) > a.p_od));
      return json(route, 200, project(page1000(sortBy(rows, url.searchParams.get('order')), url), url.searchParams.get('select')), key);
    }
    const sel = url.searchParams.get('select') || '*';
    if (!recv && RECV_TABLES.has(table) && (sel.includes('primljeno') || [...url.searchParams].some(([k, v]) => k === 'primljeno' || v.startsWith('primljeno')))) {
      return json(route, 400, { code: '42703', message: 'column primljeno does not exist' }, key);
    }
    const rows = db[table] || (db[table] = []);
    if (req.method() === 'GET' || req.method() === 'HEAD') {
      if (table === 'lov_pozicije') sim.moveOthers();
      const out = project(page1000(sortBy(rows.filter((r) => match(r, url.searchParams)), url.searchParams.get('order')), url), sel);
      return json(route, 200, recv || !RECV_TABLES.has(table) ? out : out.map(({ primljeno, ...r }) => r), key);
    }
    if (req.method() === 'POST') {
      for (const r of [].concat(req.postDataJSON())) sim.posts.push({ table, id: r.id });
      const conflict = (url.searchParams.get('on_conflict') || '').split(',').filter(Boolean);
      for (const r of [].concat(req.postDataJSON())) {
        if (r.id && rows.some((x) => x.id === r.id)) continue;
        if (conflict.length && rows.some((x) => conflict.every((c) => String(x[c]) === String(r[c])))) continue;
        rows.push({ id: ID(900000 + rows.length), ...r, ...(RECV_TABLES.has(table) && recv ? { primljeno: iso(sim.now + (++korak)) } : {}),
          ...(table === 'lovovi' ? { promijenjeno: iso(sim.now + (++korak)) } : {}) });
      }
      return json(route, 201, [], key);
    }
    if (req.method() === 'PATCH') {
      const patch = req.postDataJSON();
      for (const r of rows.filter((x) => match(x, url.searchParams))) Object.assign(r, patch, table === 'lovovi' ? { promijenjeno: iso(sim.now + (++korak)) } : {});
      return json(route, 200, [], key);
    }
    if (req.method() === 'DELETE') {
      sim.deletes = [...(sim.deletes || []), ...rows.filter((x) => match(x, url.searchParams)).map((x) => ({ table, id: x.id }))];
      db[table] = rows.filter((x) => !match(x, url.searchParams));
    }
    bump(key);
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
  sim.run = async (ms) => { for (let t = 0; t < ms; t += 10000) { sim.now += 10000; await page.clock.runFor(10000); } };
  sim.reset = () => { sim.stat.clear(); sim.bytes.clear(); };
  sim.report = (min) => {
    const total = [...sim.stat.values()].reduce((a, b) => a + b, 0);
    const kb = [...sim.bytes.values()].reduce((a, b) => a + b, 0) / 1024;
    const by = [...sim.stat].map(([k, c]) => [k, c, Math.round((sim.bytes.get(k) || 0) / 1024)]).sort((a, b) => b[2] - a[2] || b[1] - a[1]);
    return { zahtjevaMin: total / min, kbMin: kb / min, po: by };
  };
  return sim;
}
