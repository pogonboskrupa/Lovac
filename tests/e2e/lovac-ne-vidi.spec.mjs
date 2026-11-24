// Obični lovac (odobren član jedne sekcije, nije grupovođa/lovočuvar/admin) ne vidi ništa što je rezervisano za
// administratora, lovočuvara i grupovođu: administraciju, upravljanje lovom i sekcijama, kameru, Rukovodstvo,
// zvanične objekte, "Društvo u brojkama". Server to provodi (RLS, tests/sql/036), klijent ne smije ni nuditi.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';
import { lok } from './helpers.mjs';

async function seedSekcije(page, db) {
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: [], lovocuvari: [] });
}

test('obični lovac: nema administracije, kamere, upravljanja lovom, Rukovodstva ni zvaničnih objekata', async ({ page }) => {
  test.setTimeout(120000);
  const world = makeWorld({ uToku: false });
  for (const s of world.sekcije) s.grupovodja_id = ID(900); // niko iz sekcije 1 nije grupovođa
  for (const l of world.lovovi) l.organizator_id = ID(900);
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim.db);

  // Postavke → Nalog: administracija je sakrivena
  await page.locator('#btn-postavke').click();
  await page.locator('#p-tabovi [data-ptab="nalog"]').click();
  await expect(page.locator('#postavke-admin')).toBeHidden();
  await expect(page.locator('#btn-korisnici')).toBeHidden();
  await expect(page.locator('#btn-propisi')).toBeHidden();
  await page.locator('#btn-postavke').click().catch(() => {});

  // ploča "+": nema kamere ni "Dodaj lov"
  await page.goto('/');
  await page.evaluate(() => document.querySelector('.list-preko:not([hidden])')?.setAttribute('hidden', ''));
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#btn-dodaj-kameru')).toBeHidden();
  await expect(page.locator('#btn-lov-dodaj')).toBeHidden();

  // forma objekta: nema "Zvanični objekat društva"
  await page.locator('#btn-dodaj-objekat').click();
  await expect(page.locator('#objekt-forma')).toBeVisible();
  await expect(page.locator('#objekt-zvanicni-blok')).toBeHidden();
  await page.locator('#btn-objekt-odustani').click();

  // tab sekcije: bez spiska svih sekcija, bez kartice Rukovodstvo, bez "Novi lov"
  await page.locator('#btn-sekcija').click();
  await expect(page.locator('#sekcija-ekran')).toBeVisible();
  await expect(page.locator('#sk-nav-ruk')).toBeHidden();
  await expect(page.locator('#sk-k-ruk')).toBeHidden();
  await expect(page.locator('#sk-lista')).toBeHidden();
  await expect(page.locator('[data-akcija="lov-novi"]')).toHaveCount(0);
});

test('obični lovac: Pregled ne pokazuje "Društvo u brojkama", Zajednički lov nema organizaciju ni revire', async ({ page }) => {
  test.setTimeout(120000);
  const world = makeWorld({ uToku: false });
  for (const s of world.sekcije) s.grupovodja_id = ID(900);
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim.db);
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pregled').click();
  await expect(page.locator('#pregled')).toBeVisible();
  await expect(page.locator('#pr-drustvo-blok')).toBeHidden();
  await page.locator('#btn-pregled-zatvori').click().catch(() => {});
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-lovovi').click();
  await expect(page.locator('#lovovi')).toBeVisible();
  await expect(page.locator('#btn-lov-novi')).toBeHidden();
  await expect(page.locator('#btn-lov-reviri')).toBeHidden();
});
