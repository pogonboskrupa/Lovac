// "Prijavi lovočuvaru": lovac šalje dojavu (lokacija, opis, slika), lovočuvar revira je obrađuje, lovac vidi odgovor.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';
import { PNG } from './helpers.mjs';

async function seedSekcije(page, db) {
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: db.grupovodje, lovocuvari: db.revir_lovocuvari });
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('sekcije:promjena')));
}
const notifCapture = (page) => page.addInitScript(() => {
  window.__notif = [];
  window.AndroidNotif = { prikazi: (n, t) => window.__notif.push({ n, t }), poruka: (n, t) => window.__notif.push({ n, t }), vibriraj: () => {} };
});

test('lovac: "+" → Prijavi lovočuvaru (krivolov, opis, slika) → dojava na serveru → odgovor lovočuvara stiže', async ({ page }) => {
  test.setTimeout(120000);
  await notifCapture(page);
  const world = makeWorld({ uToku: false });
  world.dojave = [];
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim.db);

  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-dojavu').click();
  await expect(page.locator('#dojava-forma')).toBeVisible();
  await expect(page.locator('#dojava-revir')).toHaveValue(ID(100)); // revir moje sekcije
  await expect(page.locator('#dojava-pozicija')).toContainText('GPS');
  // bez vrste ne ide
  await page.locator('#forma-dojava button[type=submit]').click();
  await expect(page.locator('#dojava-status')).toContainText('Izaberi šta prijavljuješ');
  await page.locator('#dojava-vrste [data-vrsta="krivolov"]').click();
  await page.fill('#forma-dojava textarea[name=opis]', 'Dva pucnja kod potoka');
  await page.locator('#dojava-slika-ulaz').setInputFiles({ name: 'k.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#dojava-slika-pregled img')).toHaveCount(1);
  await page.locator('#forma-dojava button[type=submit]').click();
  await expect(page.locator('#dojava-forma')).toBeHidden();

  await expect.poll(() => sim.db.dojave.length, { timeout: 10000 }).toBe(1);
  const d = sim.db.dojave[0];
  expect(d).toMatchObject({ vrsta: 'krivolov', opis: 'Dva pucnja kod potoka', revir_id: ID(100), autor_id: sim.ja.id });
  expect(d.slika).toMatch(/^data:image\/jpeg/);
  expect(Math.abs(d.lat - 44.862)).toBeLessThan(0.001);

  // Meni → Prijave lovočuvaru: moja dojava je "Nova"
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-dojave').click();
  await expect(page.locator('#dojave-naslov')).toHaveText('Moje prijave lovočuvaru');
  const kartica = page.locator(`#dojave-spisak [data-id="${d.id}"]`);
  await expect(kartica).toContainText('Krivolov');
  await expect(kartica.locator('.dojava-status')).toHaveText('Nova');
  await expect(kartica.locator('[data-akcija="preuzmi"]')).toHaveCount(0); // lovac ne obrađuje

  // lovočuvar preuzme na serveru → lovac dobija obavijest i odgovor
  Object.assign(d, { status: 'preuzeta', odgovor: 'Izlazim na teren', rijesio: ID(15), primljeno: new Date(sim.now + 1000).toISOString() });
  await sim.run(70000);
  await expect(kartica.locator('.dojava-status')).toHaveText('Preuzeta', { timeout: 10000 });
  await expect(kartica).toContainText('Izlazim na teren');
  expect(await page.evaluate(() => window.__notif.map((x) => x.n))).toContain('Tvoja dojava: Preuzeta');
});

test('lovočuvar revira: nova dojava stiže uz obavijest i marker na karti; Preuzimam / Riješeno sa odgovorom', async ({ page }) => {
  test.setTimeout(120000);
  await notifCapture(page);
  const world = makeWorld({ uToku: false });
  world.revir_lovocuvari = [{ korisnik_id: world.korisnici[0].id, revir_id: ID(100) }];
  for (const s of world.sekcije) s.grupovodja_id = ID(999); // ja sam samo lovočuvar
  world.dojave = [];
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim.db);
  const t = new Date(sim.now).toISOString();
  sim.db.dojave.push({ id: ID(880001), autor_id: world.korisnici[12].id, revir_id: ID(100), vrsta: 'ranjena', opis: 'Srna šepa uz cestu',
    lat: 44.87, lon: 16.14, slika: null, created_at: t, primljeno: t, status: 'nova', odgovor: null, rijesio: null });
  await sim.run(70000);
  await expect.poll(() => page.evaluate(() => window.__notif.map((x) => x.n)), { timeout: 10000 }).toContain('Nova dojava: Ranjena divljač');
  await expect(page.locator('.dojava-marker')).toHaveCount(1);

  await page.locator('#btn-spiskovi').click();
  await expect(page.locator('#btn-dojave-opis')).toHaveText('1 nova dojava u reviru');
  await page.locator('#btn-dojave').click();
  await expect(page.locator('#dojave-naslov')).toHaveText('Dojave lovočuvaru');
  const kartica = page.locator(`#dojave-spisak [data-id="${ID(880001)}"]`);
  await expect(kartica).toContainText('Srna šepa uz cestu');
  await kartica.locator('[data-odgovor]').fill('Dolazim sa psom krvarom');
  // server prvi put ne primi izmjenu: upisani odgovor ostaje i poslije ponovnog crtanja spiska
  let pada = true;
  await page.route(/lazni\.supabase\.test\/rest\/v1\/dojave/, (r) => (pada && r.request().method() === 'PATCH'
    ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"code":"XX000","message":"privremena greska"}' }) : r.fallback()));
  await kartica.locator('[data-akcija="preuzmi"]').click();
  await expect(page.locator('#poruka')).toContainText('Nije sačuvano');
  await page.locator('#dojave-filter [data-filter="sve"]').click();
  await page.locator('#dojave-filter [data-filter="otvorene"]').click();
  await expect(kartica.locator('[data-odgovor]')).toHaveValue('Dolazim sa psom krvarom');
  pada = false;
  await kartica.locator('[data-akcija="preuzmi"]').click();
  await expect.poll(() => sim.db.dojave[0].status, { timeout: 10000 }).toBe('preuzeta');
  expect(sim.db.dojave[0].odgovor).toBe('Dolazim sa psom krvarom');
  await page.locator(`#dojave-spisak [data-id="${ID(880001)}"] [data-akcija="rijesi"]`).click();
  await expect.poll(() => sim.db.dojave[0].status, { timeout: 10000 }).toBe('rijesena');
  // "Otvorene" više ne prikazuje riješenu; "Sve u reviru" da
  await expect(page.locator(`#dojave-spisak [data-id="${ID(880001)}"]`)).toHaveCount(0);
  await page.locator('#dojave-filter [data-filter="sve"]').click();
  await expect(page.locator(`#dojave-spisak [data-id="${ID(880001)}"] .dojava-status`)).toHaveText('Riješena');
  await expect(page.locator('.dojava-marker')).toHaveCount(0);
});
