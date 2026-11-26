// Lovočuvar revira pravi sekciju u svom reviru, postavlja lovovođu sekcije i grupovođe revira (migracija 030).
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';

test('lovočuvar: nova sekcija sa lovovođom sekcije, lovovođa sekcije postojeće sekcije i grupovođe revira; revir mijenja samo admin', async ({ page }) => {
  test.setTimeout(120000);
  const world = makeWorld({ uToku: false });
  const ja = world.korisnici[0];
  world.revir_lovocuvari = [{ korisnik_id: ja.id, revir_id: ID(100) }];
  world.reviri.push({ id: ID(101), naziv: 'Otoka', aktivno: true });
  for (const s of world.sekcije) s.grupovodja_id = ID(999);
  world.sekcija_clanovi = world.sekcija_clanovi.filter((c) => c.korisnik_id !== ja.id);
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await page.evaluate((u) => localStorage.setItem('lovac.clanovi', JSON.stringify(u.map((k) => ({ id: k.id, ime: k.ime, prezime: k.prezime })))), world.korisnici);
  await sim.run(10000);

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-sekcije').click();
  await expect(page.locator('#sekcije')).toBeVisible();
  await page.locator('#sekcije-filter [data-filter="sve"]').click();

  // Nova sekcija: samo moj revir, biram lovovođu sekcije, bez spiska članova (njih dodaje lovovođa sekcije)
  await expect(page.locator('#btn-sekcija-nova')).toBeVisible({ timeout: 10000 });
  await page.locator('#btn-sekcija-nova').click();
  await expect(page.locator('#sekcija-revir option')).toHaveCount(1);
  await expect(page.locator('#sekcija-admin-polja')).toBeVisible();
  await expect(page.locator('#sekcija-lovci')).toBeHidden();
  const gv = world.korisnici[5].id;
  await page.fill('#forma-sekcija input[name=naziv]', 'Nova sekcija lovočuvara');
  await page.locator('#sekcija-grupovodja').selectOption(gv);
  await page.locator('#forma-sekcija button[type=submit]').click();
  await expect.poll(() => sim.db.sekcije.find((s) => s.naziv === 'Nova sekcija lovočuvara')?.grupovodja_id, { timeout: 10000 }).toBe(gv);
  expect(sim.db.sekcije.find((s) => s.naziv === 'Nova sekcija lovočuvara').revir_id).toBe(ID(100));

  // Postojeća sekcija revira: lovočuvar postavlja lovovođu sekcije, nema izbor revira
  const kartica = page.locator(`#sekcije-spisak [data-id="${world.sekcije[0].id}"]`);
  await kartica.locator('.sk-revir-uprava summary').click();
  await expect(kartica.locator('[data-revir]')).toHaveCount(0);
  await kartica.locator('[data-gv]').selectOption(world.korisnici[3].id);
  // spisak se ponovo nacrta (osvježavanje sa servera) dok lovočuvar bira: izbor ostaje
  await page.locator('#btn-sekcije-osvjezi').click();
  await expect(page.locator('#sekcije-status')).toHaveText('');
  await expect(kartica.locator('[data-gv]')).toHaveValue(world.korisnici[3].id);
  await kartica.locator('[data-akcija="uloge"]').click();
  await expect.poll(() => sim.db.sekcije[0].grupovodja_id, { timeout: 10000 }).toBe(world.korisnici[3].id);

  // Grupovođe revira: samo moj revir u izboru
  await page.locator('#uloge-detalji summary').click();
  await expect(page.locator('#grupovodje-blok')).toBeVisible();
  await expect(page.locator('#lovocuvari-blok')).toBeHidden();
  await expect(page.locator('#grupovodja-revir option')).toHaveCount(1);
  await page.locator('#grupovodja-korisnik').selectOption(world.korisnici[7].id);
  await page.locator('#btn-sekcije-osvjezi').click();
  await expect(page.locator('#grupovodja-korisnik')).toHaveValue(world.korisnici[7].id);
  await page.locator('#btn-grupovodja-dodaj').click();
  await expect.poll(() => sim.db.grupovodje.some((g) => g.korisnik_id === world.korisnici[7].id && g.revir_id === ID(100)), { timeout: 10000 }).toBe(true);
});
