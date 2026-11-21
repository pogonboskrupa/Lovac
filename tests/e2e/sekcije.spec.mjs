import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = { id: ID(1), ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: true };
const GV = { id: ID(2), ime: 'Goran', prezime: 'Grupovođa', odobren: true, is_admin: false };
const LOVAC = { id: ID(3), ime: 'Lovro', prezime: 'Lovac', odobren: true, is_admin: false };
const LOVAC2 = { id: ID(4), ime: 'Luka', prezime: 'Lovac', odobren: true, is_admin: false };
const R = { krupa: ID(100), otoka: ID(101), jezerski: ID(102) };

// Mali PostgREST sa stanjem (eq / in filteri, insert / patch / delete).
function makeServer() {
  const db = {
    korisnici: [ADMIN, GV, LOVAC, LOVAC2],
    reviri: [{ id: R.krupa, naziv: 'Krupa', aktivno: true }, { id: R.otoka, naziv: 'Otoka', aktivno: true }, { id: R.jezerski, naziv: 'Jezerski', aktivno: true }],
    grupovodje: [{ korisnik_id: GV.id, revir_id: R.krupa }],
    sekcije: [{ id: ID(200), revir_id: R.krupa, naziv: 'Krupa 1', grupovodja_id: GV.id, lovocuvar_id: null, aktivno: true }],
    sekcija_clanovi: [],
    revir_lovocuvari: [],
    lovovi: [], lov_ucesnici: [], stanovi: [], sektori: [], revir_vodje: [],
  };
  let n = 1000;
  const match = (row, params) => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').includes(String(row[k]));
    return true;
  });
  return {
    db,
    async handle(route) {
      const req = route.request();
      const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const rows = db[table] || (db[table] = []);
      if (req.method() === 'GET') return json(200, rows.filter((r) => match(r, url.searchParams)));
      if (req.method() === 'POST') {
        const body = [].concat(req.postDataJSON()).map((r) => ({ id: ID(++n), status: 'planiran', aktivno: true, ...r }));
        rows.push(...body);
        return json(201, body);
      }
      if (req.method() === 'PATCH') {
        const patch = req.postDataJSON();
        rows.filter((r) => match(r, url.searchParams)).forEach((r) => Object.assign(r, patch));
        return route.fulfill({ status: 204, body: '' });
      }
      if (req.method() === 'DELETE') {
        db[table] = rows.filter((r) => !match(r, url.searchParams));
        return route.fulfill({ status: 204, body: '' });
      }
      return json(200, []);
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
    localStorage.setItem('lovac.profil', JSON.stringify(u));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, aud: 'authenticated', role: 'authenticated' } }));
  }, user);
}

// Radnja je gotova kad nestane "Šaljem…" (lista je nacrtana sa svježim podacima).
const settled = (page) => expect(page.locator('#sekcije-status')).toHaveText('');

async function openSekcije(page) {
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-sekcije').click();
  await expect(page.locator('#sekcije')).toBeVisible();
  await expect(page.locator('#sekcije-spisak')).toContainText('Revir Krupa');
}

test('tri revira, a u svakom sekcije; lovac bez odobrenja vidi samo naziv i može tražiti pristup', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, LOVAC);
  await openSekcije(page);
  await expect(page.locator('#sekcije-spisak h3')).toHaveText(['Revir Krupa', 'Revir Otoka', 'Revir Jezerski']);
  const card = page.locator('.sekcija-kartica[data-id="' + ID(200) + '"]');
  await expect(card).toHaveAttribute('data-pristup', 'nema');
  await expect(card).toContainText('Nema pristupa');
  await expect(card).toContainText('Grupovođa: Goran Grupovođa');
  await expect(card.locator('details.uprava')).toHaveCount(0);
  await expect(page.locator('#btn-sekcija-nova')).toBeHidden();
  await card.locator('[data-akcija="zatrazi"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.length).toBe(1);
  expect(server.db.sekcija_clanovi[0]).toMatchObject({ sekcija_id: ID(200), korisnik_id: LOVAC.id });
  expect(server.db.sekcija_clanovi[0].status ?? 'ceka').not.toBe('odobren');
  await expect(card).toHaveAttribute('data-pristup', 'ceka');
  await expect(card).toContainText('čeka odobrenje');
  await card.locator('[data-akcija="povuci"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.length).toBe(0);
});

test('grupovođa odobrava i odbija zahtjeve, dodaje lovce sa spiska i preimenuje sekciju', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push({ sekcija_id: ID(200), korisnik_id: LOVAC.id, status: 'ceka' }, { sekcija_id: ID(200), korisnik_id: LOVAC2.id, status: 'ceka' });
  await setup(page, server, GV);
  await openSekcije(page);
  const card = page.locator('.sekcija-kartica').first();
  await expect(card).toHaveAttribute('data-pristup', 'grupovodja');
  await expect(card.locator('summary')).toContainText('zahtjeva: 2');
  await card.locator('summary').click();
  await card.locator('[data-uid="' + LOVAC.id + '"] [data-akcija="odobri"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.find((c) => c.korisnik_id === LOVAC.id).status).toBe('odobren');
  await settled(page);
  // Panel ostaje otvoren poslije radnje.
  await expect(card.locator('details.uprava')).toHaveAttribute('open', '');
  await card.locator('[data-uid="' + LOVAC2.id + '"] [data-akcija="odbij"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.some((c) => c.korisnik_id === LOVAC2.id)).toBe(false);
  await settled(page);

  await card.locator('[data-spisak] input[value="' + LOVAC2.id + '"]').check();
  await card.locator('[data-akcija="dodaj"]').click();
  await expect.poll(() => server.db.sekcija_clanovi.find((c) => c.korisnik_id === LOVAC2.id)?.status).toBe('odobren');
  await settled(page);
  await card.locator('[data-naziv]').fill('Krupa 1 — Gornja');
  await card.locator('[data-akcija="naziv"]').click();
  await expect.poll(() => server.db.sekcije[0].naziv).toBe('Krupa 1 — Gornja');
  // Grupovođa ne vidi admin polja (grupovođa/lovočuvar).
  await expect(card.locator('[data-gv]')).toHaveCount(0);
});

test('grupovođa pravi sekciju u SVOM reviru sa spiskom lovaca (odmah odobreni)', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, GV);
  await openSekcije(page);
  await expect(page.locator('#btn-sekcija-nova')).toBeVisible();
  await page.locator('#btn-sekcija-nova').click();
  await expect(page.locator('#sekcija-revir option')).toHaveCount(1);
  await expect(page.locator('#sekcija-revir')).toContainText('Krupa');
  await expect(page.locator('#sekcija-admin-polja')).toBeHidden();
  await page.fill('#forma-sekcija input[name=naziv]', 'K');
  await page.locator('#forma-sekcija button[type=submit]').click();
  await expect(page.locator('#sekcija-forma-status')).toContainText('naziv');
  await page.fill('#forma-sekcija input[name=naziv]', 'Krupa 2');
  await page.locator('#sekcija-lovci input[value="' + LOVAC.id + '"]').check();
  await page.locator('#sekcija-lovci input[value="' + LOVAC2.id + '"]').check();
  await page.locator('#forma-sekcija button[type=submit]').click();
  await expect.poll(() => server.db.sekcije.length).toBe(2);
  expect(server.db.sekcije[1]).toMatchObject({ naziv: 'Krupa 2', revir_id: R.krupa, grupovodja_id: GV.id });
  await expect.poll(() => server.db.sekcija_clanovi.filter((c) => c.sekcija_id === server.db.sekcije[1].id).length).toBe(2);
  const members = server.db.sekcija_clanovi.filter((c) => c.sekcija_id === server.db.sekcije[1].id);
  expect(members.map((c) => c.korisnik_id).sort()).toEqual([LOVAC.id, LOVAC2.id].sort());
  expect(members.every((c) => c.status === 'odobren')).toBe(true);
  await expect(page.locator('#sekcije')).toBeVisible();
  await expect(page.locator('.sekcija-kartica')).toHaveCount(2);
});

test('admin: grupovođe po revirima, nova sekcija sa grupovođom i lovočuvarom, uređivanje uloga', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, ADMIN);
  await openSekcije(page);
  await expect(page.locator('#grupovodje-blok')).toBeVisible();
  await settled(page);
  await expect(page.locator('#grupovodje-spisak')).toContainText('Goran Grupovođa');
  await page.locator('#grupovodja-korisnik').selectOption(LOVAC.id);
  await page.locator('#grupovodja-revir').selectOption(R.otoka);
  await page.locator('#btn-grupovodja-dodaj').click();
  await expect.poll(() => server.db.grupovodje.length).toBe(2);
  await settled(page);

  // Lovočuvar se postavlja po REVIRU i prati sve sekcije tog revira.
  await page.locator('#lovocuvar-korisnik').selectOption(LOVAC2.id);
  await page.locator('#lovocuvar-revir').selectOption(R.krupa);
  await page.locator('#btn-lovocuvar-dodaj').click();
  await expect.poll(() => server.db.revir_lovocuvari.length).toBe(1);
  expect(server.db.revir_lovocuvari[0]).toMatchObject({ korisnik_id: LOVAC2.id, revir_id: R.krupa });
  await expect(page.locator('#lovocuvari-spisak')).toContainText('Luka Lovac');
  await expect(page.locator('.sekcija-kartica', { hasText: 'Krupa 1' })).toContainText('Lovočuvar revira: Luka Lovac');

  await page.locator('#btn-sekcija-nova').click();
  await expect(page.locator('#sekcija-revir option')).toHaveCount(3);
  await expect(page.locator('#sekcija-admin-polja')).toBeVisible();
  await page.locator('#sekcija-revir').selectOption(R.otoka);
  await page.fill('#forma-sekcija input[name=naziv]', 'Otoka 1');
  await page.locator('#sekcija-grupovodja').selectOption(LOVAC.id);
  await page.locator('#forma-sekcija button[type=submit]').click();
  await expect.poll(() => server.db.sekcije.length).toBe(2);
  expect(server.db.sekcije[1]).toMatchObject({ naziv: 'Otoka 1', revir_id: R.otoka, grupovodja_id: LOVAC.id });

  const card = page.locator('.sekcija-kartica', { hasText: 'Krupa 1' });
  await card.locator('summary').click();
  await card.locator('[data-gv]').selectOption(LOVAC2.id);
  await card.locator('[data-akcija="uloge"]').click();
  await expect.poll(() => server.db.sekcije[0].grupovodja_id).toBe(LOVAC2.id);
  await card.locator('[data-akcija="sakrij"]').click();
  await expect.poll(() => server.db.sekcije[0].aktivno).toBe(false);
  await expect(page.locator('.sekcija-kartica', { hasText: 'Krupa 1' })).toHaveCount(0);
});

test('odobren član vidi članove sekcije; lov sekcije: grupovođa ga pravi za svoju sekciju', async ({ page }) => {
  const server = makeServer();
  server.db.sekcija_clanovi.push({ sekcija_id: ID(200), korisnik_id: LOVAC.id, status: 'odobren' });
  await setup(page, server, LOVAC);
  await openSekcije(page);
  const card = page.locator('.sekcija-kartica').first();
  await expect(card).toHaveAttribute('data-pristup', 'clan');
  await expect(card).toContainText('Članovi: Lovro Lovac');
  await expect(card.locator('[data-akcija="napusti"]')).toBeVisible();
  await expect(card.locator('details.uprava')).toHaveCount(0);
});

test('grupovođa organizuje lov svoje sekcije (sekcija je obavezna), lov nosi sekciju', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, GV);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-sekcije').click();
  await expect(page.locator('#sekcije-spisak')).toContainText('Krupa 1');
  await page.locator('#btn-sekcije-zatvori').click();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  await expect(page.locator('#btn-lov-novi')).toBeVisible();
  await page.locator('#btn-lov-novi').click();
  await expect(page.locator('#lov-novi-sekcija')).toContainText('Krupa 1');
  await page.fill('#forma-lov-novi input[name=naziv]', 'Pogon sekcije');
  await page.fill('#forma-lov-novi input[name=datum]', '2026-12-05');
  await page.locator('#forma-lov-novi button[type=submit]').click();
  await expect.poll(() => server.db.lovovi.length).toBe(1);
  expect(server.db.lovovi[0]).toMatchObject({ naziv: 'Pogon sekcije', revir_id: R.krupa, sekcija_id: ID(200), organizator_id: GV.id });
});
