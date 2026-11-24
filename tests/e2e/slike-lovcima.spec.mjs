// Slike lovcima: slanje drugom lovcu (i bez interneta — čeka pa ode tačno jednom), prijem (sačuva se na telefonu
// i briše se sa servera), "Pošalji lovcu" iz velike slike.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim } from './sim-svijet.mjs';
import { PNG } from './helpers.mjs';

const otvori = async (page) => {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slike-lovcima').click();
  await expect(page.locator('#slike-lovcima')).toBeVisible();
};

test('slika se šalje izabranom lovcu; bez interneta čeka i ode jednom kad se veza vrati', async ({ page }) => {
  const sim = await startSim(page, makeWorld());
  await sim.run(20000);
  await otvori(page);
  await page.locator('#sl-ulaz').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#slika-lovcu')).toBeVisible();
  await expect(page.locator('#sl-pregled img')).toBeVisible();
  await page.locator('#btn-sl-posalji').click();
  await expect(page.locator('#sl-status')).toContainText('Izaberi');
  await page.fill('#sl-trazi', 'lovac01');
  await expect(page.locator('#sl-primaoci [data-uid]')).toHaveCount(1);
  await page.locator('#sl-primaoci [data-uid] input').check();
  await expect(page.locator('#sl-izabrani')).toContainText('Lovac01 Sekcija0');
  await page.fill('#sl-opis', 'Trag vepra');
  sim.net = 'hang';
  await page.locator('#btn-sl-posalji').click();
  await expect(page.locator('#slika-lovcu')).toBeHidden({ timeout: 20000 });
  await page.locator('#sl-tabovi [data-sltab="poslane"]').click();
  await expect(page.locator('#sl-spisak [data-id]')).toHaveCount(1);
  await expect(page.locator('#sl-spisak .sl-stanje')).toHaveText('Čeka internet');
  expect(sim.posts.filter((p) => p.table === 'slike_lovcima')).toHaveLength(0);

  sim.net = 'ok';
  await sim.run(240000);
  await expect.poll(() => sim.db.slike_lovcima?.length || 0).toBe(1);
  const r = sim.db.slike_lovcima[0];
  expect(r.primalac_id).toBe(sim.db.korisnici[1].id);
  expect(r.opis).toBe('Trag vepra');
  expect(r.slika).toMatch(/^data:image\/jpeg;base64,/);
  await sim.run(240000);
  expect(sim.posts.filter((p) => p.table === 'slike_lovcima')).toHaveLength(1);
  await expect(page.locator('#sl-spisak .sl-stanje')).toContainText('Poslana');
});

test('primljena slika ostaje na telefonu, briše se sa servera, a iz velike slike se može proslijediti', async ({ page }) => {
  const sim = await startSim(page, makeWorld());
  const od = sim.db.korisnici[2];
  const slika = `data:image/png;base64,${PNG.toString('base64')}`;
  sim.db.slike_lovcima = [{ id: '11111111-0000-4000-8000-000000000001', posiljalac_id: od.id, primalac_id: sim.ja.id, slika, opis: 'Srndać na livadi',
    lat: 44.86, lon: 16.1, created_at: new Date(sim.now).toISOString(), istice: new Date(sim.now + 12 * 3600000).toISOString() }];
  await sim.run(150000);
  await expect.poll(() => sim.db.slike_lovcima.length).toBe(0);
  await expect(page.locator('#btn-slike-lovcima-opis')).toHaveText('1 nova slika');
  sim.net = 'hang'; // prikaz ne treba server
  await otvori(page);
  const kartica = page.locator('#sl-spisak [data-id]');
  await expect(kartica).toHaveCount(1);
  await expect(kartica).toContainText(`Od: ${od.ime} ${od.prezime}`);
  await expect(kartica).toContainText('Srndać na livadi');
  await kartica.locator('[data-akcija="otvori"]').click();
  await expect(page.locator('#slika-velika')).toBeVisible();
  await page.locator('#btn-slika-posalji').click();
  await expect(page.locator('#slika-lovcu')).toBeVisible();
  await expect(page.locator('#sl-opis')).toHaveValue('Srndać na livadi');
  await page.locator('#btn-sl-odustani').click();
  await page.reload();
  await otvori(page);
  await expect(page.locator('#sl-spisak [data-id]')).toHaveCount(1);
  await expect(page.locator('#btn-slike-lovcima-opis')).toHaveText('Primljeno: 1');
});
