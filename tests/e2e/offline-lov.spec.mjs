// Rad bez interneta i na slabom signalu za lov u toku: Lov traje (poruke, slike), Tok lova, Prijavi lovočuvaru,
// Moja lokacija. Sve se otvara odmah iz keša, upisi čekaju na telefonu i odu kad se veza vrati — tačno jednom.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim } from './sim-svijet.mjs';
import { PNG } from './helpers.mjs';

async function seedSekcije(page, db) {
  await page.evaluate((rows) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const tx = r.result.transaction('spiskovi', 'readwrite'); tx.objectStore('spiskovi').put({ id: 'sekcije', rows }); tx.oncomplete = res; };
  }), { reviri: db.reviri, sekcije: db.sekcije, clanovi: db.sekcija_clanovi, grupovodje: [], lovocuvari: [] });
}

// Sve radnje lovca na terenu; vraća šta je upisano (tekst poruke, opis dojave).
async function fieldWork(page, sim, oznaka) {
  const brzo = { timeout: 3000 }; // ekran se otvara iz keša, ne čeka server
  // Lov traje → poruka i slika
  await page.locator('#btn-dodaj').click();
  await expect(page.locator('#btn-lov-danas')).toBeVisible(brzo);
  await page.locator('#btn-lov-danas').click();
  await expect(page.locator('#ld-sadrzaj')).toContainText('U TOKU', brzo);
  await page.locator('#ld-tabovi [data-ldtab="ucesnici"]').click();
  await expect(page.locator('#ld-ucesnici [data-uid]')).toHaveCount(10, brzo);
  await page.locator('#ld-tabovi [data-ldtab="poruke"]').click();
  await page.fill('#forma-ld-poruka input[name=tekst]', `Poruka ${oznaka}`);
  await page.locator('#forma-ld-poruka button[type=submit]').click();
  await expect(page.locator('#ld-poruke')).toContainText(`Poruka ${oznaka}`, brzo);
  await page.locator('#ld-tabovi [data-ldtab="slike"]').click();
  await page.locator('#ld-slika-ulaz').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#ld-slike [data-slika]').first()).toBeVisible(brzo);
  // Tok lova → moj status
  await page.locator('#ld-tabovi [data-ldtab="pregled"]').click();
  await page.locator('#ld-sadrzaj [data-akcija="tok"]').click();
  await expect(page.locator('#tok-ekran')).toBeVisible(brzo);
  await page.locator('#tok-moje [data-vrsta="na_stanu"]').click();
  await page.locator('#btn-tok-zatvori-dno').click();
  // Prijavi lovočuvaru
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-dojavu').click();
  await expect(page.locator('#dojava-forma')).toBeVisible(brzo);
  await page.locator('#dojava-vrste [data-vrsta="zamka"]').click();
  await page.fill('#forma-dojava textarea[name=opis]', `Sajla ${oznaka}`);
  await page.locator('#forma-dojava button[type=submit]').click();
  await expect(page.locator('#dojava-forma')).toBeHidden(brzo);
  // Moja lokacija: ploča i "Pošalji lokaciju" rade bez mreže
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible(brzo);
  await expect(page.locator('#lok-koord')).toContainText('44.862');
  await page.locator('#btn-lok-posalji').click();
  await expect.poll(() => page.evaluate(() => window.__podijeljeno.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__podijeljeno.at(-1))).toContain('https://www.google.com/maps?q=44.862000,16.100000');
  await page.locator('#btn-lok-zatvori').click();
}

const sentOnce = (sim, table, pred) => {
  const rows = (sim.db[table] || []).filter(pred);
  return rows.length;
};

for (const mreza of ['hang', 'flaky']) {
  test(`lov u toku, ${mreza === 'hang' ? 'bez interneta (veza visi)' : 'slab signal (zahtjevi padaju i vise)'}: sve radi iz keša, a poslije stigne na server tačno jednom`, async ({ page }) => {
    test.setTimeout(240000);
    await page.addInitScript(() => {
      window.__podijeljeno = [];
      window.AndroidShare = { shareText: (t) => window.__podijeljeno.push(t), shareFile: () => {} };
    });
    const world = makeWorld({ uToku: true });
    world.dojave = [];
    world.lov_slike = [];
    const sim = await startSim(page, world, { rpc: true, recv: true });
    await sim.run(80000); // keš: lov, sekcije, poruke
    await seedSekcije(page, sim.db);

    sim.net = mreza;
    await sim.run(120000); // aplikacija primijeti lošu vezu
    await fieldWork(page, sim, mreza);
    const lov = sim.db.lovovi[0].id;
    if (mreza === 'hang') {
      // bez veze ništa ne stiže na server, a ništa se ne gubi
      expect(sentOnce(sim, 'poruke', (m) => m.tekst === `Poruka ${mreza}`)).toBe(0);
      expect(sentOnce(sim, 'dojave', (d) => d.opis === `Sajla ${mreza}`)).toBe(0);
    }
    await sim.run(5 * 60000); // radi dalje na lošoj vezi

    sim.net = 'ok';
    await sim.run(4 * 60000); // provjera veze vrati kvalitet, redovi se pošalju
    await expect.poll(() => sentOnce(sim, 'poruke', (m) => m.tekst === `Poruka ${mreza}` && m.lov_id === lov), { timeout: 15000 }).toBe(1);
    await expect.poll(() => sentOnce(sim, 'dojave', (d) => d.opis === `Sajla ${mreza}` && d.vrsta === 'zamka'), { timeout: 15000 }).toBe(1);
    await expect.poll(() => sentOnce(sim, 'lov_dogadjaji', (e) => e.lov_id === lov && e.vrsta === 'na_stanu' && e.autor_id === sim.ja.id), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    // slika lova: ako je "+" za sliku izgubio rok, pokreće je otvaranje Lov traje / arhive; dovoljno je da ne nestane
    await page.locator('#btn-dodaj').click();
    await page.locator('#btn-lov-danas').click();
    await sim.run(30000);
    await expect.poll(() => sentOnce(sim, 'lov_slike', (x) => x.lov_id === lov), { timeout: 15000 }).toBe(1);
    // tok lova: isti događaj (isti id) se ne smije dva puta upisati
    const ids = sim.db.lov_dogadjaji.filter((e) => e.autor_id === sim.ja.id).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
}

test('Dodaj lov bez interneta: forma se otvara odmah, kaže da treba internet i ne pravi lov napola; sa vezom radi', async ({ page }) => {
  test.setTimeout(180000);
  const sim = await startSim(page, makeWorld({ uToku: false }), { rpc: true, recv: true });
  await sim.run(40000);
  await seedSekcije(page, sim.db);
  sim.net = 'hang';
  await sim.run(120000);
  const prije = sim.db.lovovi.length;
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-lov-dodaj').click();
  await expect(page.locator('#sk-lov-forma')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#slf-status')).toContainText('potreban je internet');
  await page.locator('#slf-clanovi input').first().check();
  await page.locator('#forma-sk-lov button[type=submit]').click();
  await expect(page.locator('#sk-lov-forma')).toBeVisible(); // ostaje otvorena, ništa nije izgubljeno
  await sim.run(30000);
  expect(sim.db.lovovi.length).toBe(prije);
  expect(sim.db.lov_ucesnici.filter((u) => !sim.db.lovovi.some((l) => l.id === u.lov_id))).toHaveLength(0);

  sim.net = 'ok';
  await sim.run(90000);
  await page.locator('#forma-sk-lov button[type=submit]').click();
  await expect.poll(() => sim.db.lovovi.length, { timeout: 15000 }).toBe(prije + 1);
  await expect.poll(() => sim.db.lov_ucesnici.filter((u) => u.lov_id === sim.db.lovovi.at(-1).id).length, { timeout: 15000 }).toBe(2);
});

test('Dodaj lov na slabom signalu: ponovni pokušaji dovršavaju ISTI lov — jedan lov, svi učesnici, bez duplikata', async ({ page }) => {
  test.setTimeout(240000);
  const sim = await startSim(page, makeWorld({ uToku: false }), { rpc: true, recv: true });
  await sim.run(40000);
  await seedSekcije(page, sim.db);
  const prije = sim.db.lovovi.length;
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-lov-dodaj').click();
  await expect(page.locator('#sk-lov-forma')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.locator('#slf-clanovi input').nth(i).check();
  sim.net = 'flaky';
  for (let i = 0; i < 25 && await page.locator('#sk-lov-forma').isVisible(); i++) {
    if (await page.locator('#forma-sk-lov button[type=submit]').isEnabled()) await page.locator('#forma-sk-lov button[type=submit]').click();
    await sim.run(20000);
  }
  sim.net = 'ok';
  await sim.run(60000);
  if (await page.locator('#sk-lov-forma').isVisible()) await page.locator('#forma-sk-lov button[type=submit]').click();
  await expect(page.locator('#sk-lov-forma')).toBeHidden({ timeout: 15000 });
  expect(sim.db.lovovi.length).toBe(prije + 1);
  const lov = sim.db.lovovi.at(-1);
  expect(lov.status).toBe('u_toku');
  const uc = sim.db.lov_ucesnici.filter((u) => u.lov_id === lov.id);
  expect(uc).toHaveLength(4);
  expect(new Set(uc.map((u) => u.korisnik_id)).size).toBe(4);
});
