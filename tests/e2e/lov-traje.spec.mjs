// Organizacija lova iz ploče "+": grupovođa doda lov sa spiskom lovaca, lov se pokrene, "+" tada nudi "Lov traje"
// sa lovcima (pozicija, poruke, slike), porukama i slikama lova.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';
import { PNG } from './helpers.mjs';

async function seedSekcije(page, sim) {
  const { db } = sim;
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: [], lovocuvari: [] });
}

test('grupovođa: "+" → Dodaj lov → lov počinje → "Lov traje" sa lovcima, porukama i slikama', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, makeWorld({ uToku: false }), { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim);

  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#btn-lov-dodaj')).toBeVisible();
  await expect(page.locator('#btn-lov-danas')).toBeHidden();
  await page.locator('#btn-lov-dodaj').click();
  await expect(page.locator('#sk-lov-forma')).toBeVisible();
  await expect(page.locator('#forma-sk-lov input[name=pokreni]')).toBeChecked();
  await expect(page.locator('#slf-sekcija')).toHaveText('Sekcija 1');
  const izbor = page.locator('#slf-clanovi input');
  await expect(izbor).toHaveCount(9);
  for (let i = 0; i < 3; i++) await izbor.nth(i).check();
  await page.fill('#forma-sk-lov input[name=naziv]', 'Pogon Grmeč');
  await page.locator('#forma-sk-lov button[type=submit]').click();

  // lov je na serveru, pokrenut, sa mnom kao vođom i 3 strijelca
  await expect.poll(() => sim.db.lovovi.find((l) => l.naziv === 'Pogon Grmeč')?.status, { timeout: 10000 }).toBe('u_toku');
  const lov = sim.db.lovovi.find((l) => l.naziv === 'Pogon Grmeč');
  await expect.poll(() => sim.db.lov_ucesnici.filter((u) => u.lov_id === lov.id).length, { timeout: 10000 }).toBe(4);

  // "+" sada nudi "Lov traje", ne "Dodaj lov"
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#btn-lov-danas')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#btn-lov-danas')).toContainText('Lov traje');
  await expect(page.locator('#lov-danas-opis')).toHaveText('Pogon Grmeč');
  await expect(page.locator('#btn-lov-dodaj')).toBeHidden();
  await page.locator('#btn-lov-danas').click();
  await expect(page.locator('#lov-danas')).toBeVisible();
  await expect(page.locator('#ld-sadrzaj')).toContainText('Pogon Grmeč');

  // Lovci: 4 reda; poruka kolege sa servera ulazi u njegov red
  const kolega = sim.db.lov_ucesnici.find((u) => u.lov_id === lov.id && u.uloga === 'strijelac').korisnik_id;
  sim.db.poruke.push({ id: ID(799001), kanal: 'sekcija', sekcija_id: lov.sekcija_id, autor_id: kolega, lov_id: lov.id,
    tekst: 'Vidim krdo na proplanku', created_at: new Date(sim.now).toISOString(), primljeno: new Date(sim.now).toISOString() });
  await page.locator('#ld-tabovi [data-ldtab="ucesnici"]').click();
  await expect(page.locator('#ld-ucesnici [data-uid]')).toHaveCount(4);
  await sim.run(25000);
  const red = page.locator(`#ld-ucesnici [data-uid="${kolega}"]`);
  await expect(red).toContainText('1 por.', { timeout: 10000 });
  await red.locator('[data-akcija="lovac"]').click();
  await expect(red).toContainText('Vidim krdo na proplanku');

  // Poruke: šaljem poruku lovu → ide na server sa lov_id
  await page.locator('#ld-tabovi [data-ldtab="poruke"]').click();
  await expect(page.locator('#ld-poruke')).toContainText('Vidim krdo na proplanku');
  await page.fill('#forma-ld-poruka input[name=tekst]', 'Krećem prema stanu 3');
  await page.locator('#forma-ld-poruka button[type=submit]').click();
  await expect(page.locator('#ld-poruke')).toContainText('Krećem prema stanu 3');
  await expect.poll(() => sim.db.poruke.find((m) => m.tekst === 'Krećem prema stanu 3')?.lov_id, { timeout: 10000 }).toBe(lov.id);

  // Slike: dodajem sliku → na serveru u lov_slike, vidi se u tabu i u mom redu
  await page.locator('#ld-tabovi [data-ldtab="slike"]').click();
  await page.fill('#ld-slika-opis', 'Stan 3');
  await page.locator('#ld-slika-ulaz').setInputFiles({ name: 'stan.png', mimeType: 'image/png', buffer: PNG });
  await expect.poll(() => sim.db.lov_slike?.filter((x) => x.lov_id === lov.id).length || 0, { timeout: 10000 }).toBe(1);
  await expect(page.locator('#ld-slike [data-slika]')).toHaveCount(1, { timeout: 10000 });
  await page.locator('#ld-slike [data-slika]').click();
  await expect(page.locator('#slika-velika')).toBeVisible();
  await page.locator('#btn-slika-velika-zatvori').click();
  await page.locator('#ld-tabovi [data-ldtab="ucesnici"]').click();
  await expect(page.locator(`#ld-ucesnici [data-uid="${sim.ja.id}"]`)).toContainText('1 sl.');

  // Nazad zatvara ekran
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#lov-danas')).toBeHidden();
});

test('običan član sekcije nema "Dodaj lov" u ploči "+"', async ({ page }) => {
  const world = makeWorld({ uToku: false });
  // ja (prvi lovac) više nije grupovođa nijedne sekcije
  for (const s of world.sekcije) s.grupovodja_id = ID(999);
  const sim = await startSim(page, world, { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim);
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#meni-dodaj')).toBeVisible();
  await expect(page.locator('#btn-lov-dodaj')).toBeHidden();
  await expect(page.locator('#btn-lov-danas')).toBeHidden();
});

test('planiran lov: uloge i okupljanje → "+" nudi "Lov danas" → Pokreni → dodaj lovca → značka poruka → Završi (drugi dodir)', async ({ page }) => {
  test.setTimeout(150000);
  const sim = await startSim(page, makeWorld({ uToku: false, historija: 2 }), { rpc: true, recv: true });
  await sim.run(20000);
  await seedSekcije(page, sim);
  // lovovi iz historije u keš (za "Kao zadnji lov")
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('lovovi:promjena')));
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-lov-dodaj').click();
  await expect(page.locator('#sk-lov-forma')).toBeVisible();

  // "Kao zadnji lov" bira lovce zadnjeg lova sekcije
  await expect(page.locator('#btn-slf-zadnji')).toBeVisible({ timeout: 10000 });
  await page.locator('#btn-slf-zadnji').click();
  await expect(page.locator('#slf-clanovi input:checked')).toHaveCount(9);
  await page.locator('#btn-slf-svi').click(); // sve označeno → poništi sve
  await expect(page.locator('#slf-clanovi input:checked')).toHaveCount(0);

  // dva lovca, drugi je pogonič; okupljanje u 07:30; bez pokretanja
  const redovi = page.locator('#slf-clanovi .slf-red');
  await redovi.nth(0).locator('input').check();
  await redovi.nth(1).locator('input').check();
  await redovi.nth(1).locator('.slf-uloga').click();
  await expect(redovi.nth(1).locator('.slf-uloga')).toHaveText('Pogonič');
  await expect(page.locator('#slf-broj')).toContainText('3 sa tobom · 1 pogonič');
  await page.fill('#forma-sk-lov input[name=okupljanje]', '07:30');
  await page.fill('#forma-sk-lov input[name=naziv]', 'Planirani pogon');
  await page.locator('#forma-sk-lov input[name=pokreni]').uncheck();
  await page.locator('#forma-sk-lov button[type=submit]').click();
  await expect.poll(() => sim.db.lovovi.find((l) => l.naziv === 'Planirani pogon')?.status, { timeout: 10000 }).toBe('planiran');
  const lov = sim.db.lovovi.find((l) => l.naziv === 'Planirani pogon');
  expect(lov.napomena).toBe('Okupljanje u 07:30.');
  await expect.poll(() => sim.db.lov_ucesnici.filter((u) => u.lov_id === lov.id).map((u) => u.uloga).sort(), { timeout: 10000 }).toEqual(['pogonic', 'strijelac', 'vodja']);

  // "+" → "Lov danas" (planiran) → Pokreni lov
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#lov-danas-naslov')).toHaveText('Lov danas', { timeout: 10000 });
  await expect(page.locator('#lov-danas-opis')).toContainText('planiran');
  await expect(page.locator('#btn-lov-dodaj')).toBeHidden();
  await page.locator('#btn-lov-danas').click();
  await expect(page.locator('#ld-sadrzaj')).toContainText('PLANIRAN ZA DANAS');
  await page.locator('#ld-sadrzaj [data-akcija="pokreni"]').click();
  await expect.poll(() => lov.status, { timeout: 10000 }).toBe('u_toku');
  await expect(page.locator('#ld-naslov')).toHaveText('Lov traje', { timeout: 10000 });
  await expect(page.locator('#ld-sadrzaj')).toContainText('Vođenje lova');

  // Dodaj lovce: jedan novi lovac kao pogonič
  await page.locator('#ld-sadrzaj [data-akcija="dodaj-lovce"]').click();
  await expect(page.locator('#ld-dodaj-lovce')).toBeVisible();
  const novi = page.locator('#ld-dodaj-lovce .slf-red').first();
  const noviId = await novi.getAttribute('data-uid');
  await novi.locator('input').check();
  await novi.locator('[data-akcija="uloga"]').click();
  // izbor ostaje i poslije ponovnog crtanja (uloga, nove pozicije kolega)
  await sim.run(30000);
  await expect(page.locator('#ld-dodaj-lovce input[value="' + noviId + '"]')).toBeChecked();
  await page.locator('#ld-dodaj-lovce [data-akcija="dodaj-potvrdi"]').click();
  await expect.poll(() => sim.db.lov_ucesnici.find((u) => u.lov_id === lov.id && u.korisnik_id === noviId)?.uloga, { timeout: 10000 }).toBe('pogonic');
  await expect(page.locator('#ld-ucesnici [data-uid]')).toHaveCount(4, { timeout: 10000 });

  // poruka kolege → značka nepročitanih na dugmetu u "+", čita se otvaranjem Poruka
  await page.locator('#btn-ld-zatvori').click();
  sim.db.poruke.push({ id: ID(799101), kanal: 'sekcija', sekcija_id: lov.sekcija_id, autor_id: noviId, lov_id: lov.id,
    tekst: 'Pogon kreće sa juga', created_at: new Date(sim.now).toISOString(), primljeno: new Date(sim.now).toISOString() });
  await sim.run(70000);
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#lov-danas-znacka')).toHaveText('1', { timeout: 10000 });
  await page.locator('#btn-lov-danas').click();
  await page.locator('#ld-tabovi [data-ldtab="poruke"]').click();
  await expect(page.locator('#ld-poruke')).toContainText('Pogon kreće sa juga');
  await page.locator('#ld-brze [data-brza]').first().click();
  await expect(page.locator('#forma-ld-poruka input[name=tekst]')).not.toHaveValue('');
  await expect(page.locator('#lov-danas-znacka')).toBeHidden();

  // Završi lov: prvi dodir samo pita, drugi završava; "+" ponovo nudi "Dodaj lov"
  await page.locator('#ld-tabovi [data-ldtab="pregled"]').click();
  await page.locator('#ld-sadrzaj [data-akcija="zavrsi"]').click();
  await expect(page.locator('#ld-sadrzaj [data-akcija="zavrsi"]')).toHaveText('Dodirni ponovo — završi');
  expect(lov.status).toBe('u_toku');
  await page.locator('#ld-sadrzaj [data-akcija="zavrsi"]').click();
  await expect.poll(() => lov.status, { timeout: 10000 }).toBe('zavrsen');
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#btn-lov-dodaj')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#btn-lov-danas')).toBeHidden();
});
