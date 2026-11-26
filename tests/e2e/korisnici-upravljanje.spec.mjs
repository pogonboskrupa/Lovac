import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

// Lažni server sa stanjem: GET/POST/PATCH/DELETE nad tabelama i RPC pozivi se bilježe, pa se vidi tačno šta je admin poslao.
function world() {
  return {
    korisnici: [
      { id: 'a1', ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: true, created_at: '2026-11-01T08:00:00Z' },
      { id: 'g1', ime: 'Goran', prezime: 'Lovovođa sekcije', odobren: true, is_admin: false, created_at: '2026-11-02T08:00:00Z' },
      { id: 'l1', ime: 'Lovro', prezime: 'Lovac', odobren: true, is_admin: false, created_at: '2026-11-03T08:00:00Z' },
      { id: 'l2', ime: 'Luka', prezime: 'Zahtjev', odobren: true, is_admin: false, created_at: '2026-11-04T08:00:00Z' },
      { id: 'b1', ime: 'Bruno', prezime: 'Bez', odobren: true, is_admin: false, created_at: '2026-11-05T08:00:00Z' },
      { id: 'n1', ime: 'Nino', prezime: 'Novi', odobren: false, is_admin: false, created_at: '2026-11-06T08:00:00Z' },
    ],
    reviri: [{ id: 'r1', naziv: 'Krupa', aktivno: true }, { id: 'r2', naziv: 'Otoka', aktivno: true }],
    sekcije: [
      { id: 's1', naziv: 'Krupa 1', revir_id: 'r1', grupovodja_id: 'g1', aktivno: true },
      { id: 's2', naziv: 'Krupa 2', revir_id: 'r1', grupovodja_id: null, aktivno: true },
      { id: 's3', naziv: 'Otoka 1', revir_id: 'r2', grupovodja_id: null, aktivno: true },
    ],
    sekcija_clanovi: [
      { sekcija_id: 's1', korisnik_id: 'g1', status: 'odobren' },
      { sekcija_id: 's1', korisnik_id: 'l1', status: 'odobren' },
      { sekcija_id: 's2', korisnik_id: 'l2', status: 'ceka' },
    ],
    grupovodje: [],
    revir_lovocuvari: [],
  };
}

async function setup(page) {
  const db = world();
  const zahtjevi = [];
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  await page.route(/lazni\.supabase\.test\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const rpc = url.pathname.includes('/rpc/');
    const table = url.pathname.split('/').pop();
    const eq = [...url.searchParams].filter(([, v]) => v.startsWith('eq.')).map(([k, v]) => [k, v.slice(3)]);
    const match = (r) => eq.every(([k, v]) => String(r[k]) === v);
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (rpc) {
      zahtjevi.push({ rpc: table, body: req.postDataJSON() });
      const b = req.postDataJSON();
      if (table === 'kreiraj_korisnika') {
        db.korisnici.push({ id: 'novi1', ime: b.p_ime, prezime: b.p_prezime, odobren: true, is_admin: false, created_at: '2026-11-10T08:00:00Z' });
        db.sekcija_clanovi.push({ sekcija_id: b.p_sekcija, korisnik_id: 'novi1', status: 'odobren' });
        return json(200, { id: 'novi1', odobren: true });
      }
      if (table === 'premjesti_zahtjev') {
        const r = db.sekcija_clanovi.find((x) => x.sekcija_id === b.p_iz && x.korisnik_id === b.p_korisnik);
        if (r) r.sekcija_id = b.p_u;
      }
      return json(200, null);
    }
    const rows = db[table] || (db[table] = []);
    if (req.method() === 'GET') return json(200, rows);
    zahtjevi.push({ metoda: req.method(), table, filter: Object.fromEntries(eq), body: req.postData() ? req.postDataJSON() : null });
    if (req.method() === 'POST') {
      const made = [].concat(req.postDataJSON()).map((r) => (table === 'grupe' ? { id: 'gnova', ...r } : r));
      rows.push(...made);
      if (table === 'grupe') return json(201, made);
    }
    if (req.method() === 'PATCH') rows.filter(match).forEach((r) => Object.assign(r, req.postDataJSON()));
    if (req.method() === 'DELETE') db[table] = rows.filter((r) => !match(r));
    return route.fulfill({ status: req.method() === 'POST' ? 201 : 204, body: '' });
  });
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'a1', ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: true }));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'a1', aud: 'authenticated', role: 'authenticated' },
    }));
  });
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-korisnici').click();
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(6);
  return { db, zahtjevi };
}

const kartica = (page, id) => page.locator(`#korisnici-spisak [data-id="${id}"]`);
const otvori = async (page, id) => { const k = kartica(page, id); await k.locator('summary').click(); return k; };
const poslano = (z, uslov) => z.filter(uslov);

test('pregled: vodstvo, bez sekcije, filter po sekciji i brojke uloga', async ({ page }) => {
  await setup(page);
  // podaci o sekcijama stižu iz pozadinskog osvježavanja
  await expect(page.locator('#kor-hero-uloge')).toHaveText('1 lovovođa sekcije · 0 lovočuvara · 2 bez sekcije');
  await expect(page.locator('#kor-filter [data-filter="vodstvo"]')).toHaveText('Vodstvo (2)'); // admin + lovovođa sekcije
  await expect(page.locator('#kor-filter [data-filter="bez"]')).toHaveText('Bez sekcije (2)'); // Luka (samo zahtjev) i Bruno
  await page.locator('#kor-filter [data-filter="vodstvo"]').click();
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(2);
  await page.locator('#kor-filter [data-filter="svi"]').click();
  await page.selectOption('#kor-sekcija', 's1');
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(2); // Goran i Lovro
  await page.selectOption('#kor-sekcija', 'bez');
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(3); // Ado, Bruno, Nino
  await page.selectOption('#kor-sekcija', '');
  await expect(kartica(page, 'g1')).toContainText('Vodi sekciju Krupa 1');
  // pretraga i po nazivu sekcije
  await page.fill('#kor-trazi', 'krupa 2');
  await expect(page.locator('#korisnici-spisak [data-id]')).toHaveCount(1);
  await expect(kartica(page, 'l2')).toBeVisible();
});

test('premjesti člana: upis u novu sekciju, brisanje iz stare i skidanje sa vođenja stare sekcije', async ({ page }) => {
  const { zahtjevi, db } = await setup(page);
  const g = await otvori(page, 'g1'); // vodi Krupa 1
  await expect(g.locator('.kor-sek[data-sid="s1"]')).toContainText('lovovođa sekcije');
  // bez izbora se ništa ne šalje
  await g.locator('.kor-sek[data-sid="s1"] [data-akcija="premjesti"]').click();
  await expect(page.locator('#korisnici-status')).toHaveText('Izaberi sekciju u koju se premješta');
  expect(zahtjevi).toHaveLength(0);
  await g.locator('.kor-sek[data-sid="s1"] select').selectOption('s3');
  await g.locator('.kor-sek[data-sid="s1"] [data-akcija="premjesti"]').click();
  await expect.poll(() => zahtjevi.length).toBe(3);
  expect(zahtjevi[0]).toMatchObject({ metoda: 'POST', table: 'sekcija_clanovi', body: { sekcija_id: 's3', korisnik_id: 'g1', status: 'odobren' } });
  expect(zahtjevi[1]).toMatchObject({ metoda: 'DELETE', table: 'sekcija_clanovi', filter: { sekcija_id: 's1', korisnik_id: 'g1' } });
  expect(zahtjevi[2]).toMatchObject({ metoda: 'PATCH', table: 'sekcije', filter: { id: 's1' }, body: { grupovodja_id: null } });
  await expect(kartica(page, 'g1')).toContainText('Član: Otoka 1 (Otoka)');
  expect(db.sekcije.find((s) => s.id === 's1').grupovodja_id).toBeNull();
});

test('premjesti zahtjev za ulaz: server prebacuje i bilježi odluku (RPC), ne briše se ručno', async ({ page }) => {
  const { zahtjevi } = await setup(page);
  const l = await otvori(page, 'l2');
  await l.locator('.kor-sek[data-sid="s2"] select').selectOption('s3');
  await l.locator('.kor-sek[data-sid="s2"] [data-akcija="premjesti"]').click();
  await expect.poll(() => zahtjevi.length).toBe(1);
  expect(zahtjevi[0]).toEqual({ rpc: 'premjesti_zahtjev', body: { p_iz: 's2', p_u: 's3', p_korisnik: 'l2' } });
  await expect(kartica(page, 'l2')).toContainText('Traži ulaz: Otoka 1 (Otoka)');
});

test('ukloni iz sekcije drugim dodirom; dodaj u sekciju; odbij zahtjev', async ({ page }) => {
  const { zahtjevi, db } = await setup(page);
  const l = await otvori(page, 'l1');
  await l.locator('.kor-sek[data-sid="s1"] [data-akcija="ukloni-sek"]').click();
  await page.waitForTimeout(200);
  expect(zahtjevi).toHaveLength(0);
  await l.locator('.kor-sek[data-sid="s1"] [data-akcija="ukloni-sek"]').click();
  await expect.poll(() => zahtjevi.length).toBe(1);
  expect(zahtjevi[0]).toMatchObject({ metoda: 'DELETE', filter: { sekcija_id: 's1', korisnik_id: 'l1' } });
  expect(zahtjevi.some((z) => z.table === 'sekcije')).toBe(false); // nije bio lovovođa sekcije
  await expect(kartica(page, 'l1')).not.toContainText('Član:');
  const b = await otvori(page, 'b1');
  await b.locator('select[data-izbor="dodaj"]').selectOption('s2');
  await b.locator('[data-akcija="dodaj-sek"]').click();
  await expect.poll(() => db.sekcija_clanovi.some((c) => c.korisnik_id === 'b1' && c.sekcija_id === 's2' && c.status === 'odobren')).toBe(true);
});

test('imenuj lovovođu sekcije (pokazuje koga zamjenjuje) i skini ga', async ({ page }) => {
  const { zahtjevi, db } = await setup(page);
  const l = await otvori(page, 'l1');
  const opcije = await l.locator('select[data-izbor="gv"] option').allTextContents();
  expect(opcije).toContain('Krupa 1 (Krupa) — zamjenjuje: Goran Lovovođa sekcije');
  expect(opcije).toContain('Krupa 2 (Krupa)');
  await l.locator('[data-akcija="gv-postavi"]').click();
  await expect(page.locator('#korisnici-status')).toHaveText('Izaberi sekciju');
  await l.locator('select[data-izbor="gv"]').selectOption('s2');
  await l.locator('[data-akcija="gv-postavi"]').click();
  await expect.poll(() => zahtjevi.length).toBe(1);
  expect(zahtjevi[0]).toMatchObject({ metoda: 'PATCH', table: 'sekcije', filter: { id: 's2' }, body: { grupovodja_id: 'l1' } });
  await expect(kartica(page, 'l1')).toContainText('Vodi sekciju Krupa 2');
  // skidanje traži drugi dodir i skida SAMO tog korisnika (filter grupovodja_id)
  const l2 = await kartica(page, 'l1');
  await l2.locator('[data-grupa="gv"] [data-akcija="gv-skini"]').click();
  await page.waitForTimeout(200);
  expect(zahtjevi).toHaveLength(1);
  await l2.locator('[data-grupa="gv"] [data-akcija="gv-skini"]').click();
  await expect.poll(() => zahtjevi.length).toBe(2);
  expect(zahtjevi[1]).toMatchObject({ metoda: 'PATCH', table: 'sekcije', filter: { id: 's2', grupovodja_id: 'l1' }, body: { grupovodja_id: null } });
  expect(db.sekcije.find((s) => s.id === 's2').grupovodja_id).toBeNull();
});

test('hijerarhija: lovočuvar društva (najviše 2), lovovođa društva i lovovođa revira se imenuju i skidaju; admin se mijenja iz istog mjesta', async ({ page }) => {
  const { zahtjevi, db } = await setup(page);
  const b = await otvori(page, 'b1');
  await b.locator('[data-akcija="lcd-postavi"]').click();
  await expect.poll(() => zahtjevi.length).toBe(1);
  expect(zahtjevi[0]).toMatchObject({ metoda: 'POST', table: 'drustvo_uloge', body: { korisnik_id: 'b1', uloga: 'lovocuvar' } });
  await expect(kartica(page, 'b1')).toContainText('Lovočuvar društva');
  await kartica(page, 'b1').locator('[data-grupa="lcd"] [data-akcija="lcd-skini"]').click();
  await kartica(page, 'b1').locator('[data-grupa="lcd"] [data-akcija="lcd-skini"]').click();
  await expect.poll(() => db.drustvo_uloge.length).toBe(0);
  expect(zahtjevi.at(-1)).toMatchObject({ metoda: 'DELETE', table: 'drustvo_uloge', filter: { korisnik_id: 'b1', uloga: 'lovocuvar' } });

  // lovovođa društva: jedan; kad je mjesto zauzeto, drugi korisnik vidi ko ga drži
  await kartica(page, 'b1').locator('[data-akcija="ldd-postavi"]').click();
  await expect.poll(() => db.drustvo_uloge.length).toBe(1);
  expect(db.drustvo_uloge[0]).toMatchObject({ korisnik_id: 'b1', uloga: 'lovovodja_drustva' });
  const l = await otvori(page, 'l1');
  await expect(l.locator('[data-grupa="ldd"]')).toContainText('Mjesto je popunjeno (Bruno Bez)');
  await expect(l.locator('[data-akcija="ldd-postavi"]')).toHaveCount(0);

  // lovovođa revira: sadašnji se skida prije imenovanja novog (jedan po reviru)
  await kartica(page, 'b1').locator('select[data-izbor="lvr"]').selectOption('r2');
  await kartica(page, 'b1').locator('[data-akcija="lvr-postavi"]').click();
  await expect.poll(() => db.revir_vodje.length).toBe(1);
  expect(db.revir_vodje[0]).toMatchObject({ revir_id: 'r2', korisnik_id: 'b1' });
  const z = zahtjevi.filter((x) => x.table === 'revir_vodje');
  expect(z[0]).toMatchObject({ metoda: 'DELETE', filter: { revir_id: 'r2' } });
  expect(z[1]).toMatchObject({ metoda: 'POST', body: { revir_id: 'r2', korisnik_id: 'b1' } });
  await expect(kartica(page, 'b1')).toContainText('Lovovođa revira · Otoka');
  await expect(kartica(page, 'b1').locator('[data-grupa="admin"] [data-akcija="admin"]')).toHaveText('Postavi za admina');
});

test('neodobren nalog nema uloga; admin sebi ne mijenja uloge; izbor u listi ne nestaje kad stignu podaci', async ({ page }) => {
  await setup(page);
  const n = await otvori(page, 'n1');
  await expect(n).toContainText('Uloge se dodjeljuju tek kad je nalog odobren');
  await expect(n.locator('[data-akcija="gv-postavi"]')).toHaveCount(0);
  await expect(kartica(page, 'a1').locator('[data-grupa]')).toHaveCount(0);
  // izbor u padajućoj listi preživi ponovno crtanje (pretraga ponovo crta listu)
  const l = await otvori(page, 'l1');
  await l.locator('select[data-izbor="gv"]').selectOption('s3');
  await page.fill('#kor-trazi', 'lovro');
  await expect(kartica(page, 'l1').locator('select[data-izbor="gv"]')).toHaveValue('s3');
});

test('Novi korisnik iz ekrana Korisnici: nalog u sekciju + odmah uloga lovovođe sekcije; uloga Grupovođa grupe u Uloge', async ({ page }) => {
  const { zahtjevi, db } = await setup(page);
  await page.locator('#btn-korisnici-novi').click();
  await expect(page.locator('#lovac-novi')).toBeVisible();
  await expect(page.locator('#ln-uloga-blok')).toBeVisible();
  await page.selectOption('#ln-sekcija', 's2');
  await page.selectOption('#ln-uloga', 'lovovodja_sekcije');
  await page.fill('#forma-lovac-novi [name=ime]', 'Nedim');
  await page.fill('#forma-lovac-novi [name=prezime]', 'Novak');
  await page.fill('#forma-lovac-novi [name=pin]', '123456');
  await page.locator('#btn-ln-posalji').click();
  await expect(page.locator('#ln-gotovo')).toBeVisible();
  expect(poslano(zahtjevi, (z) => z.rpc === 'kreiraj_korisnika')).toHaveLength(1);
  expect(poslano(zahtjevi, (z) => z.metoda === 'PATCH' && z.table === 'sekcije')[0].body).toEqual({ grupovodja_id: 'novi1' });
  expect(db.sekcije.find((x) => x.id === 's2').grupovodja_id).toBe('novi1');
  // grupovođa grupe iz Uloga: Lovro (član Krupa 1)
  await page.locator('#btn-ln-zatvori').click();
  const l = await otvori(page, 'l1');
  await l.locator('select[data-izbor="gg"]').selectOption('s1');
  await l.locator('[data-akcija="gg-postavi"]').click();
  await expect.poll(() => poslano(zahtjevi, (z) => z.table === 'grupe' && z.metoda === 'POST').length).toBe(1);
  await expect.poll(() => poslano(zahtjevi, (z) => z.rpc === 'dodijeli_grupu').length).toBe(1);
});
