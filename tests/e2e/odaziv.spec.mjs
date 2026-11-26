// Novi lov sekcije: član dobije pitanje "Dolaziš?"; "Da" = samoprijava + odaziv, "Ne" = odaziv; bez veze odgovor
// čeka na telefonu i ode kad se veza vrati. Lovovođa sekcije vidi ko dolazi i ko ne.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';

async function seedSekcije(page, db) {
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: [], lovocuvari: [] });
}

const noviLov = (sim, n, naziv, datum = '2026-11-24') => {
  const l = { id: ID(400 + n), revir_id: ID(100), sekcija_id: ID(200), naziv, datum, status: 'planiran', organizator_id: ID(2),
    napomena: 'Okupljanje u 07:00.', promijenjeno: new Date(sim.now + n).toISOString() };
  sim.db.lovovi.push(l);
  sim.db.lov_ucesnici.push({ lov_id: l.id, korisnik_id: ID(2), uloga: 'vodja' });
  return l;
};

function clanWorld() {
  const world = makeWorld({ uToku: false });
  world.sekcije[0].grupovodja_id = ID(2);
  for (const l of world.lovovi) l.organizator_id = ID(2);
  return world;
}

test('član: novi lov → "Dolaziš?" → Da (samoprijava + odaziv), drugi lov → Ne', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, clanWorld(), { rpc: true, recv: true });
  await seedSekcije(page, sim.db);
  const l1 = noviLov(sim, 1, 'Pogon Vučjak');
  await sim.run(20000);
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('lovovi:promjena')));
  // spisak lovova se osvježava u pozadini; pitanje se pojavi kad lov stigne u keš
  await expect.poll(async () => { await sim.run(10000); return page.locator('#odaziv-dijalog').isVisible(); }, { timeout: 60000, intervals: [100] }).toBe(true);
  await expect(page.locator('#odaziv-lov')).toHaveText('Pogon Vučjak');
  await expect(page.locator('#odaziv-napomena')).toHaveText('Okupljanje u 07:00.');
  await page.locator('#btn-odaziv-da').click();
  await expect(page.locator('#odaziv-dijalog')).toBeHidden();
  await expect.poll(() => sim.db.lov_ucesnici.find((u) => u.lov_id === l1.id && u.korisnik_id === sim.ja.id)?.samoprijava, { timeout: 10000 }).toBe(true);
  await expect.poll(() => sim.db.lov_odazivi.find((o) => o.lov_id === l1.id)?.odgovor).toBe('da');

  const l2 = noviLov(sim, 2, 'Pogon Grmeč', '2026-11-26');
  await expect.poll(async () => { await sim.run(10000); return page.locator('#odaziv-dijalog').isVisible(); }, { timeout: 60000, intervals: [100] }).toBe(true);
  await expect(page.locator('#odaziv-lov')).toHaveText('Pogon Grmeč');
  await page.locator('#btn-odaziv-ne').click();
  await expect.poll(() => sim.db.lov_odazivi.find((o) => o.lov_id === l2.id)?.odgovor, { timeout: 10000 }).toBe('ne');
  expect(sim.db.lov_ucesnici.some((u) => u.lov_id === l2.id && u.korisnik_id === sim.ja.id)).toBe(false);
  // ne pita ponovo
  await sim.run(60000);
  await expect(page.locator('#odaziv-dijalog')).toBeHidden();
});

test('bez veze: odgovor čeka na telefonu i ode tačno jednom kad se veza vrati', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, clanWorld(), { rpc: true, recv: true });
  await seedSekcije(page, sim.db);
  const l1 = noviLov(sim, 1, 'Pogon Vučjak');
  await expect.poll(async () => { await sim.run(10000); return page.locator('#odaziv-dijalog').isVisible(); }, { timeout: 60000, intervals: [100] }).toBe(true);
  sim.net = 'hang';
  await page.locator('#btn-odaziv-da').click();
  await sim.run(30000);
  expect(sim.db.lov_odazivi.length).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.odaziv.red')).length)).toBe(1);
  sim.net = 'ok';
  await expect.poll(async () => { await sim.run(10000); return sim.db.lov_odazivi.filter((o) => o.lov_id === l1.id).length; }, { timeout: 60000, intervals: [100] }).toBe(1);
  expect(sim.db.lov_ucesnici.filter((u) => u.lov_id === l1.id && u.korisnik_id === sim.ja.id).length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('lovac.odaziv.red')).length)).toBe(0);
});

test('lovovođa sekcije: u tabu sekcije vidi ko dolazi i ko ne; sebe ne pita', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, makeWorld({ uToku: false }), { rpc: true, recv: true });
  await seedSekcije(page, sim.db);
  const l = { id: ID(450), revir_id: ID(100), sekcija_id: ID(200), naziv: 'Moj lov', datum: '2026-11-24', status: 'planiran',
    organizator_id: sim.ja.id, promijenjeno: new Date(sim.now).toISOString() };
  sim.db.lovovi.push(l);
  sim.db.lov_ucesnici.push({ lov_id: l.id, korisnik_id: sim.ja.id, uloga: 'vodja' });
  sim.db.lov_odazivi.push({ lov_id: l.id, korisnik_id: ID(2), odgovor: 'da' }, { lov_id: l.id, korisnik_id: ID(3), odgovor: 'ne' });
  await page.locator('#btn-sekcija').click();
  await expect.poll(async () => { await sim.run(10000); return page.locator('#sk-odazivi').count(); }, { timeout: 60000, intervals: [100] }).toBe(1);
  await expect(page.locator('#sk-odazivi')).toContainText('Dolazi: 1 · Ne dolazi: 1');
  await expect(page.locator('#sk-odazivi')).toContainText('Ne dolaze: Lovac02 Sekcija0');
  await expect(page.locator('#odaziv-dijalog')).toBeHidden();
});
