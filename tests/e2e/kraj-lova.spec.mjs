// Kraj lova: traka uživo (SOS / Lokacija / Tok / Kraj) ne smije ostati na karti zauvijek.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';

async function seedSekcije(page, db) {
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: [], lovocuvari: [] });
}

test('nezavršen lov od prije 10 dana ne drži traku uživo', async ({ page }) => {
  const world = makeWorld({ uToku: true });
  world.lovovi[0].datum = '2026-11-13';
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(90000);
  await expect(page.locator('#uzivo')).toBeHidden();
  expect(sim.stat.get('POST lov_pozicije') || 0).toBe(0); // ni pozicija se ne šalje
});

test('član (nije vođa): Kraj → Izađi iz lova na ovom telefonu (drugi dodir) — traka nestaje i ostaje sklonjena', async ({ page }) => {
  test.setTimeout(120000);
  const world = makeWorld({ uToku: true });
  for (const s of world.sekcije) s.grupovodja_id = ID(999);
  world.lovovi[0].organizator_id = ID(999);
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(90000);
  await seedSekcije(page, sim.db);
  await expect(page.locator('#uzivo')).toBeVisible();
  await expect(page.locator('#btn-moja-lokacija')).toHaveClass(/dijeli-lokaciju/); // dijelim poziciju u lovu
  await page.locator('#btn-uzivo-kraj').click();
  await expect(page.locator('#uzivo-kraj')).toBeVisible();
  await expect(page.locator('#btn-uzivo-zavrsi')).toBeHidden(); // član ne završava lov za sve
  await page.locator('#btn-uzivo-izadji').click();
  await expect(page.locator('#uzivo')).toBeVisible(); // prvi dodir samo pita
  await page.locator('#btn-uzivo-izadji').click();
  await expect(page.locator('#uzivo')).toBeHidden();
  await expect(page.locator('#btn-moja-lokacija')).not.toHaveClass(/dijeli-lokaciju/);
  await expect.poll(() => sim.stat.get('DELETE lov_pozicije') || 0, { timeout: 10000 }).toBeGreaterThan(0);
  expect(sim.db.lovovi[0].status).toBe('u_toku'); // za ostale lov traje
  const poslano = sim.stat.get('POST lov_pozicije') || 0;
  await sim.run(120000);
  await expect(page.locator('#uzivo')).toBeHidden();
  expect(sim.stat.get('POST lov_pozicije') || 0).toBe(poslano);
});

test('grupovođa: Kraj → Završi lov za sve (drugi dodir) — lov završen na serveru, traka nestaje', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, makeWorld({ uToku: true }), { rpc: true, recv: true });
  await sim.run(90000);
  await seedSekcije(page, sim.db);
  await expect(page.locator('#uzivo')).toBeVisible();
  await page.locator('#btn-uzivo-kraj').click();
  await expect(page.locator('#btn-uzivo-zavrsi')).toBeVisible();
  await page.locator('#btn-uzivo-zavrsi').click();
  expect(sim.db.lovovi[0].status).toBe('u_toku');
  await page.locator('#btn-uzivo-zavrsi').click();
  await expect.poll(() => sim.db.lovovi[0].status, { timeout: 10000 }).toBe('zavrsen');
  await expect(page.locator('#uzivo')).toBeHidden({ timeout: 10000 });
});

test('lov koji server više ne daje (obrisan / izbačen iz sekcije) nestaje iz keša i sa trake', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, makeWorld({ uToku: true }), { rpc: true, recv: true });
  await sim.run(90000);
  await expect(page.locator('#uzivo')).toBeVisible();
  const lov = sim.db.lovovi[0].id;
  sim.db.lovovi = sim.db.lovovi.filter((l) => l.id !== lov);
  await sim.run(13 * 60000); // puni spisak lovova jednom u 10 min, pa provjera aktivnog lova (60 s)
  await expect(page.locator('#uzivo')).toBeHidden({ timeout: 10000 });
});
