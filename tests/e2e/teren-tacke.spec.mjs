import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG, pogledBlizu } from './helpers.mjs';
import { startSim, makeWorld } from './sim-svijet.mjs';

const TEREN = { id: 'teren.mbtiles', naziv: 'Teren društva', format: 'mbtiles', minzoom: 12, maxzoom: 16, velicina: 1000, bounds: '15.5,44.4,16.9,45.2' };
const ADMIN = { id: '00000000-0000-4000-8000-000000000001', ime: 'Ado', prezime: 'Admin', odobren: true, is_admin: true };
const LOVAC = { ...ADMIN, ime: 'Lovro', prezime: 'Lovac', is_admin: false };

// Podloga Teren (lažni native most + pločice) i sačuvan izbor Terena; opcionalno profil u localStorage (bez servera).
async function setup(page, { profil = null, podloga = 'teren' } = {}) {
  await page.addInitScript(([t, p, base]) => {
    window.AndroidKarte = { spisak: () => JSON.stringify([t]), uvezi: () => {}, ukloni: () => true, preuzmi: () => {} };
    localStorage.setItem('lovac.podloga', JSON.stringify(base));
    if (p) localStorage.setItem('lovac.profil', JSON.stringify(p));
  }, [TEREN, profil, podloga]);
  await page.route(/appassets\.androidplatform\.net\/mbtiles\//, (r) => r.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png' } }));
}

async function pomjeriNa(page, lat, lon, z = 14) {
  await page.evaluate(([a, b, zoom]) => globalThis.__karta.setView([a, b], zoom, { animate: false }), [lat, lon, z]);
}

async function dodajMjesto(page, naziv, vrstaTekst = null) {
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-mjesto').click();
  await expect(page.locator('#mjesto-traka')).toBeVisible();
  await page.locator('#btn-mjesto-dalje').click();
  await expect(page.locator('#mjesto-forma')).toBeVisible();
  await page.locator('#forma-mjesto input[name=naziv]').fill(naziv);
  if (vrstaTekst) await page.locator('#mjesto-vrste button', { hasText: vrstaTekst }).click();
  await page.locator('#btn-mjesto-sacuvaj').click();
}

test.describe('bez servera (offline)', () => {
  test.beforeEach(async ({ page }) => {
    await fakeServerConfigUnset(page);
    await serveTiles(page);
    await pogledBlizu(page, 14);
  });

  test('običan lovac nema dugme za dodavanje imena mjesta', async ({ page }) => {
    await setup(page, { profil: LOVAC });
    await page.goto('/');
    await page.locator('#btn-dodaj').click();
    await expect(page.locator('#meni-dodaj')).toBeVisible();
    await expect(page.locator('#btn-dodaj-mjesto')).toBeHidden();
  });

  test('admin dodaje ime: križ + Dalje + forma; ime se vidi samo na Terenu, po zoomu, i ostaje poslije ponovnog pokretanja', async ({ page }) => {
    await setup(page, { profil: ADMIN });
    await page.goto('/');
    await expect(page.locator('#karta')).toBeVisible();
    await pomjeriNa(page, 44.9, 16.2);
    await page.locator('#btn-dodaj').click();
    await expect(page.locator('#btn-dodaj-mjesto')).toBeVisible();
    await page.locator('#btn-dodaj-mjesto').click();
    // traka sa koordinatama sredine karte i križ; dugmad kontrola mape su sakrivena dok se bira mjesto
    await expect(page.locator('#mjesto-traka')).toBeVisible();
    await expect(page.locator('#mjesto-nisan')).toBeVisible();
    await expect(page.locator('#mjesto-traka-koord')).not.toHaveText('');
    await expect(page.locator('.mapa-dno')).toBeHidden();
    await pomjeriNa(page, 44.91, 16.21);
    await page.locator('#btn-mjesto-dalje').click();
    await expect(page.locator('#mjesto-forma')).toBeVisible();
    await expect(page.locator('#mjesto-traka')).toBeHidden();
    // prazan naziv se odbija
    await page.locator('#btn-mjesto-sacuvaj').click();
    await expect(page.locator('#mjesto-status')).toContainText('naziv');
    await page.locator('#forma-mjesto input[name=naziv]').fill('Veliki vrh');
    await page.locator('#mjesto-vrste button', { hasText: 'Vrh' }).click();
    await page.locator('#btn-mjesto-sacuvaj').click();
    await expect(page.locator('#mjesto-forma')).toBeHidden();

    const oznaka = page.locator('.tt-naziv', { hasText: 'Veliki vrh' });
    await expect(oznaka).toBeVisible();
    const rows = await page.evaluate(() => globalThis.__terenTacke.rows());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ naziv: 'Veliki vrh', vrsta: 'vrh', aktivno: true, sinhronizovano: false });
    expect(rows[0].lat).toBeCloseTo(44.91, 3);

    // vrh se vidi od zooma 13: na 12 nestaje, na 13 se vraća
    await page.evaluate(() => globalThis.__karta.setZoom(12, { animate: false }));
    await expect(oznaka).toHaveCount(0);
    await page.evaluate(() => globalThis.__karta.setZoom(13, { animate: false }));
    await expect(page.locator('.tt-naziv', { hasText: 'Veliki vrh' })).toBeVisible();

    // na drugoj podlozi se ne vidi (ime je samo za Teren)
    await page.locator('#btn-podloga').click();
    await page.locator('#meni-podloga [data-podloga="topo"]').click();
    await expect(page.locator('.tt-naziv')).toHaveCount(0);
    await page.locator('#btn-podloga').click();
    await page.locator('#meni-podloga [data-podloga="teren"]').click();
    await expect(page.locator('.tt-naziv', { hasText: 'Veliki vrh' })).toBeVisible();

    // ostaje na telefonu poslije ponovnog pokretanja (bez servera)
    await page.reload();
    await expect(page.locator('.tt-naziv', { hasText: 'Veliki vrh' })).toBeVisible();
  });

  test('admin uređuje i skida ime (drugi dodir); Nazad zatvara biranje mjesta', async ({ page }) => {
    await setup(page, { profil: ADMIN });
    await page.goto('/');
    await pomjeriNa(page, 44.9, 16.2);
    await dodajMjesto(page, 'Pjanić', 'Naselje');
    const oznaka = page.locator('.tt-naziv', { hasText: 'Pjanić' });
    await expect(oznaka).toBeVisible();
    // dodir na ime otvara uređivanje sa upisanim imenom i dugmetom Skini
    await page.locator('.tt', { hasText: 'Pjanić' }).click();
    await expect(page.locator('#mjesto-forma')).toBeVisible();
    await expect(page.locator('#forma-mjesto input[name=naziv]')).toHaveValue('Pjanić');
    await expect(page.locator('#btn-mjesto-skini')).toBeVisible();
    await page.locator('#forma-mjesto input[name=naziv]').fill('Pjanić gaj');
    await page.locator('#btn-mjesto-sacuvaj').click();
    await expect(page.locator('.tt-naziv', { hasText: 'Pjanić gaj' })).toBeVisible();
    await page.locator('.tt', { hasText: 'Pjanić gaj' }).click();
    await page.locator('#btn-mjesto-skini').click(); // prvi dodir samo traži potvrdu
    await expect(page.locator('#mjesto-forma')).toBeVisible();
    await page.locator('#btn-mjesto-skini').click();
    await expect(page.locator('.tt-naziv')).toHaveCount(0);
    expect((await page.evaluate(() => globalThis.__terenTacke.rows()))[0].aktivno).toBe(false);

    // Nazad prekida biranje mjesta
    await page.locator('#btn-dodaj').click();
    await page.locator('#btn-dodaj-mjesto').click();
    await expect(page.locator('#mjesto-traka')).toBeVisible();
    await page.evaluate(() => window.__nazad());
    await expect(page.locator('#mjesto-traka')).toBeHidden();
    await expect(page.locator('#mjesto-nisan')).toBeHidden();
  });

  test('običan lovac vidi ime (iz keša), ali ga ne može uređivati', async ({ page }) => {
    await setup(page, { profil: LOVAC });
    await page.goto('/');
    await pomjeriNa(page, 44.9, 16.2);
    await page.evaluate(async () => {
      const { idbPut } = await import('/static/js/db.js');
      await idbPut('spiskovi', { id: 'teren_tacke', kursor: null, rows: [{ id: 'x1', naziv: 'Izvor Bunar', vrsta: 'voda', lat: 44.9, lon: 16.2, aktivno: true, updated_at: new Date().toISOString(), sinhronizovano: true }] });
    });
    await page.reload();
    const oznaka = page.locator('.tt-naziv', { hasText: 'Izvor Bunar' });
    await expect(oznaka).toBeVisible();
    await page.locator('.tt', { hasText: 'Izvor Bunar' }).click({ force: true });
    await expect(page.locator('#mjesto-forma')).toBeHidden();
  });
});

test.describe('sa serverom', () => {
  test.beforeEach(async ({ page }) => { await pogledBlizu(page, 14); await setup(page); });

  test('admin: ime se sa telefona šalje serveru TAČNO jednom; lovac: ime sa servera stiže u keš', async ({ page }) => {
    const world = makeWorld({ uToku: false });
    world.korisnici[0].is_admin = true;
    world.teren_tacke = [{ id: 'srv-1', naziv: 'Sa servera', vrsta: 'naselje', lat: 44.9, lon: 16.2, aktivno: true, updated_at: '2026-11-20T10:00:00.000Z' }];
    const sim = await startSim(page, world, { rpc: true, recv: true });
    await sim.run(30000);
    // prvo preuzimanje (6 s poslije pokretanja) donosi ime sa servera
    await expect.poll(() => page.evaluate(() => globalThis.__terenTacke.rows().map((t) => t.naziv))).toContain('Sa servera');
    await page.evaluate(() => globalThis.__karta.setView([44.9, 16.2], 14, { animate: false }));
    await dodajMjesto(page, 'Novo ime');
    await sim.run(20000);
    await expect.poll(() => world.teren_tacke.filter((t) => t.naziv === 'Novo ime').length).toBe(1);
    await sim.run(120000); // ponovno slanje se ne događa
    expect(world.teren_tacke.filter((t) => t.naziv === 'Novo ime')).toHaveLength(1);
    expect((await page.evaluate(() => globalThis.__terenTacke.rows())).every((t) => t.sinhronizovano)).toBe(true);
  });

  test('slab signal: ime čeka na telefonu, pa stigne kad veza proradi (bez duplikata)', async ({ page }) => {
    const world = makeWorld({ uToku: false });
    world.korisnici[0].is_admin = true;
    const sim = await startSim(page, world, { rpc: true, recv: true });
    await sim.run(20000);
    await page.evaluate(() => globalThis.__karta.setView([44.9, 16.2], 14, { animate: false }));
    sim.net = 'hang';
    await dodajMjesto(page, 'Bez veze');
    await expect(page.locator('.tt-naziv', { hasText: 'Bez veze' })).toBeVisible();
    await sim.run(90000);
    expect(world.teren_tacke ?? []).toHaveLength(0);
    sim.net = 'ok';
    await sim.run(180000); // lokalna provjera svake minute šalje čim veza proradi
    await expect.poll(() => (world.teren_tacke ?? []).filter((t) => t.naziv === 'Bez veze').length).toBe(1);
  });
});
