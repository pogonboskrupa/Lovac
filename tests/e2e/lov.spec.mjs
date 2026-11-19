import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const VODJA = { id: '00000000-0000-4000-8000-0000000000v1', ime: 'Vojo', prezime: 'Vođa', odobren: true, is_admin: false };
const LOVAC = { id: '00000000-0000-4000-8000-0000000000l1', ime: 'Lovro', prezime: 'Lovac', odobren: true, is_admin: false };
const REVIR = { id: '66666666-0000-4000-8000-0000000000a1', naziv: 'Revir Bara', aktivno: true };

// Mali PostgREST sa stanjem (eq / in filteri), dovoljan za ekrane lova.
function makeServer() {
  const db = {
    korisnici: [VODJA, LOVAC], reviri: [REVIR], revir_vodje: [{ revir_id: REVIR.id, korisnik_id: VODJA.id }],
    lovovi: [], lov_ucesnici: [], stanovi: [], sektori: [],
  };
  let n = 0;
  const match = (row, params) => [...params].every(([k, v]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) return true;
    if (v.startsWith('eq.')) return String(row[k]) === v.slice(3);
    if (v.startsWith('in.(')) return v.slice(4, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(row[k]));
    return true;
  });
  return {
    db,
    async handle(route) {
      const req = route.request();
      const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const rows = db[table] || (db[table] = []);
      const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (req.method() === 'GET') return json(200, rows.filter((r) => match(r, url.searchParams)));
      if (req.method() === 'POST') {
        const body = [].concat(req.postDataJSON()).map((r) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, status: 'planiran', ...r }));
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

async function openHunts(page) {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  await expect(page.locator('#lovovi')).toBeVisible();
  await expect(page.locator('#lovovi-status')).toContainText('Preuzeto lovova');
}

test('vođa revira organizuje lov: učesnik, dva stana na nišanu, ručni zabranjen pravac, pokretanje', async ({ page }) => {
  const server = makeServer();
  await setup(page, server, VODJA);
  await page.goto('/');
  await openHunts(page);
  await page.locator('#btn-lovovi-osvjezi').click();
  await expect(page.locator('#btn-lov-novi')).toBeVisible();
  await page.locator('#btn-lov-novi').click();
  await page.fill('#forma-lov-novi input[name=naziv]', 'Pogon Bara');
  await page.fill('#forma-lov-novi input[name=datum]', '2026-12-05');
  await page.locator('#forma-lov-novi button[type=submit]').click();
  await expect(page.locator('#lov-uredi')).toBeVisible();
  expect(server.db.lovovi[0]).toMatchObject({ naziv: 'Pogon Bara', revir_id: REVIR.id, organizator_id: VODJA.id });

  await page.locator('#lov-dodaj-clan').selectOption(LOVAC.id);
  await page.locator('#btn-lov-dodaj-clan').click();
  await expect(page.locator('#lov-ucesnici')).toContainText('Lovro Lovac');

  await page.locator('#btn-lov-dodaj-stan').click();
  await expect(page.locator('#lov-postavi')).toBeVisible();
  await page.locator('#btn-lov-postavi').click();
  await expect(page.locator('#lov-stanovi [data-id]')).toHaveCount(1);
  await page.locator('#btn-lov-dodaj-stan').click();
  await page.mouse.move(206, 450); await page.mouse.down(); await page.mouse.move(306, 450, { steps: 5 }); await page.mouse.up();
  await page.locator('#btn-lov-postavi').click();
  await expect(page.locator('#lov-stanovi [data-id]')).toHaveCount(2);
  expect(server.db.stanovi.map((s) => s.broj).sort()).toEqual([1, 2]);

  const stan1 = page.locator('#lov-stanovi [data-id]').first();
  await stan1.locator('select[data-akcija="dodijeli"]').selectOption(LOVAC.id);
  await expect.poll(() => server.db.stanovi.find((s) => s.broj === 1).korisnik_id).toBe(LOVAC.id);
  await page.locator('#lov-stanovi [data-id]').first().locator('[name=od]').fill('400');
  await page.locator('#lov-stanovi [data-id]').first().locator('[name=razlog]').fill('Put');
  await page.locator('#lov-stanovi [data-id]').first().locator('[data-akcija="sektor"]').click();
  await expect(page.locator('#lov-uredi-status')).toContainText('0–360');
  await page.locator('#lov-stanovi [data-id]').first().locator('[name=od]').fill('170');
  await page.locator('#lov-stanovi [data-id]').first().locator('[name=do]').fill('190');
  await page.locator('#lov-stanovi [data-id]').first().locator('[data-akcija="sektor"]').click();
  await expect.poll(() => server.db.sektori.length).toBe(1);
  expect(server.db.sektori[0]).toMatchObject({ od_azimut: 170, do_azimut: 190, razlog: 'Put' });

  await page.locator('#btn-lov-pokreni').click();
  await expect.poll(() => server.db.lovovi[0].status).toBe('u_toku');
});

test('učesnik: raspored radi offline, moj stan, crveni sektori i kompas uz napomenu o sigurnosti', async ({ page }) => {
  const server = makeServer();
  const lovId = '77777777-0000-4000-8000-000000000001';
  server.db.lovovi.push({ id: lovId, revir_id: REVIR.id, naziv: 'Pogon Bara', datum: '2026-12-05', status: 'u_toku', organizator_id: VODJA.id });
  server.db.lov_ucesnici.push({ lov_id: lovId, korisnik_id: LOVAC.id, uloga: 'strijelac' }, { lov_id: lovId, korisnik_id: VODJA.id, uloga: 'vodja' });
  server.db.stanovi.push(
    { id: 's1', lov_id: lovId, broj: 1, lat: 44.88, lon: 16.15, korisnik_id: LOVAC.id },
    { id: 's2', lov_id: lovId, broj: 2, lat: 44.88, lon: 16.154, korisnik_id: VODJA.id },
  );
  server.db.sektori.push({ id: 'k1', stan_id: 's1', od_azimut: 170, do_azimut: 190, razlog: 'Put' });
  await setup(page, server, LOVAC);
  await page.goto('/');
  await openHunts(page);
  await expect(page.locator('#btn-lov-novi')).toBeHidden();
  await expect(page.locator('#lovovi-spisak')).toContainText('Strijelac, stan 1');

  // Bez interneta poslije preuzimanja.
  await page.route(/lazni\.supabase\.test\/rest\/v1\//, (r) => r.abort('internetdisconnected'));
  await page.reload();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  await page.locator('#lovovi-spisak [data-akcija="prikazi"]').click();
  await expect(page.locator('#lov-panel')).toBeVisible();
  await expect(page.locator('#lov-panel-uloga')).toHaveText(/Strijelac · stan 1/);
  await expect(page.locator('.stan-ikona')).toHaveCount(2);
  await expect(page.locator('.stan-ikona.moj')).toHaveText('1');
  // Zabranjeno: prema stanu 2 (istok) i ručni put (jug) — dva crvena klina.
  await expect(page.locator('path.sektor-zabranjen')).toHaveCount(2);
  await expect(page.locator('#lov-panel')).toContainText('Ne zamjenjuje pravila lova ni vođu lova');
  await expect(page.locator('#lov-kompas')).toHaveAttribute('data-stanje', 'nepoznato');

  // Kompas pokazuje prema stanu 2 (istok, 90°) -> zabranjeno.
  await page.evaluate(() => {
    const ev = new Event('deviceorientationabsolute');
    Object.assign(ev, { alpha: 270, absolute: true });
    window.dispatchEvent(ev);
  });
  await expect(page.locator('#lov-kompas')).toHaveAttribute('data-stanje', 'zabranjeno');
  await expect(page.locator('#lov-kompas')).toContainText('NE PUCAJ');
  // Zapad (270°) -> nije u zabranjenom sektoru.
  await page.evaluate(() => {
    const ev = new Event('deviceorientationabsolute');
    Object.assign(ev, { alpha: 90, absolute: true });
    window.dispatchEvent(ev);
  });
  await expect(page.locator('#lov-kompas')).toHaveAttribute('data-stanje', 'dozvoljeno');

  // Dodir na stan 2 prikazuje njegove sektore.
  await page.locator('.stan-ikona[data-broj="2"]').click();
  await expect(page.locator('#lov-panel-uloga')).toContainText('prikazan stan 2');
});
