// Lov napravljen iz taba sekcije nema stanova: raspored na karti mora reći da nije postavljen i vođi dati put
// do postavljanja stanova (prije je panel bio prazan i lovac "nije mogao ništa").
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';

async function seedSekcije(page, db) {
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: [], lovocuvari: [] });
}

const openSchedule = (page, id) => page.evaluate((lid) => document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: lid } })), id);

test('lovovođa sekcije: lov bez stanova → "Postavi stanove" iz panela → stan na serveru', async ({ page }) => {
  test.setTimeout(90000);
  const sim = await startSim(page, makeWorld({ uToku: true }), { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim.db);
  await openSchedule(page, ID(300));
  await expect(page.locator('#lov-panel')).toBeVisible();
  await expect(page.locator('#lov-panel-prazno')).toBeVisible();
  const uredi = page.locator('#btn-lov-panel-uredi');
  await expect(uredi).toHaveText('Postavi stanove');
  await uredi.click();
  await expect(page.locator('#lov-uredi')).toBeVisible();
  await page.locator('#btn-lov-dodaj-stan').click();
  await page.locator('#btn-lov-postavi').click();
  await expect.poll(() => sim.db.stanovi.filter((s) => s.lov_id === ID(300)).length, { timeout: 10000 }).toBe(1);
});

test('lovac (nije vođa): lov bez stanova kaže da raspored nije postavljen, bez dugmeta za uređivanje', async ({ page }) => {
  test.setTimeout(90000);
  const world = makeWorld({ uToku: true });
  world.lovovi[0].organizator_id = ID(2);
  world.sekcije[0].grupovodja_id = ID(2);
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim.db);
  await openSchedule(page, ID(300));
  await expect(page.locator('#lov-panel-prazno')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#btn-lov-panel-uredi')).toBeHidden();
});
