// Simulacija jedne sekcije sa 16 lovaca u lovu: markeri kolega sa inicijalima na karti, Istraživač 3D i izabrani
// kolega (istaknut marker, kartica sa udaljenošću). Snimci ekrana idu u SNIMCI_DIR kad je postavljen.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';
import { lok } from './helpers.mjs';

const IMENA = [
  ['Nedim', 'Ćehić'], ['Adnan', 'Hodžić'], ['Emir', 'Kovačević'], ['Senad', 'Mujić'], ['Mirsad', 'Begić'], ['Almir', 'Delić'],
  ['Jasmin', 'Hadžić'], ['Elvis', 'Mehić'], ['Samir', 'Alić'], ['Kemal', 'Tabaković'], ['Edin', 'Šehić'], ['Zijad', 'Pašić'],
  ['Haris', 'Ramić'], ['Enes', 'Zukić'], ['Fikret', 'Halilović'], ['Asim', 'Jusić'],
];

function svijet16() {
  const w = makeWorld();
  const sid = ID(200), lid = ID(300);
  const ja = w.korisnici[0];
  // ostale sekcije ne trebaju; sekcija 1 dobija 6 lovaca više (ukupno 16)
  const sek = w.korisnici.filter((u) => w.sekcija_clanovi.some((c) => c.sekcija_id === sid && c.korisnik_id === u.id));
  for (let i = 0; i < 6; i++) {
    const u = { id: ID(5000 + i), ime: 'x', prezime: 'y', odobren: true, is_admin: false };
    w.korisnici.push(u); sek.push(u);
    w.sekcija_clanovi.push({ sekcija_id: sid, korisnik_id: u.id, status: 'odobren' });
    w.lov_ucesnici.push({ lov_id: lid, korisnik_id: u.id, uloga: i < 3 ? 'pogonic' : 'strijelac' });
  }
  sek.forEach((u, i) => { u.ime = IMENA[i][0]; u.prezime = IMENA[i][1]; });
  // raspored: linija stanova sjeverno od mene (strijelci) i pogonici južno, kao u pogonu
  const me = { lat: 44.862, lon: 16.1 };
  sek.forEach((u, i) => {
    if (u.id === ja.id) return;
    const pog = w.lov_ucesnici.find((x) => x.korisnik_id === u.id && x.lov_id === lid)?.uloga === 'pogonic';
    w.pos.set(u.id, pog ? { lat: me.lat - 0.0035, lon: me.lon - 0.006 + (i - 10) * 0.0022 } : { lat: me.lat + 0.0015 + (i % 2) * 0.0009, lon: me.lon - 0.006 + i * 0.0012 });
  });
  for (const u of w.korisnici) if (!sek.includes(u)) w.pos.delete(u.id);
  w.korisnici = w.korisnici.filter((u) => sek.includes(u) || u.id === ja.id);
  return w;
}

const snimak = async (page, ime) => { if (process.env.SNIMCI_DIR) await page.screenshot({ path: `${process.env.SNIMCI_DIR}/${ime}.png` }); };

test('sekcija sa 16 lovaca u lovu: kolege na karti sa inicijalima; u Istraživaču 3D izabrani kolega je istaknut i ima karticu', async ({ page }) => {
  test.setTimeout(90000);
  const sim = await startSim(page, svijet16());
  await sim.run(60000);
  // na početnoj razmjeri se preklopljeni lovci skupljaju u znak sa brojem: svi (15) su i dalje obuhvaćeni
  const obuhvaceno = () => page.evaluate(() => [...document.querySelectorAll('.uc-marker')].reduce((n, e) => n + (e.dataset.broj ? Number(e.dataset.broj) : 1), 0));
  await expect.poll(obuhvaceno, { timeout: 15000 }).toBe(15);
  // početna razmjera (zoom 11): lovci su skupljeni u znakove sa brojem, a znak je manji nego na bližoj razmjeri
  const zoom0 = await page.evaluate(() => window.__karta.getZoom());
  expect(await page.locator('.uc-grupa').count()).toBeGreaterThan(0);
  expect(await page.locator('.uc-grupa').first().evaluate((e) => e.getBoundingClientRect().width)).toBeLessThan(34);
  // dodir na grupu uvećava kartu do lovaca u njoj
  await page.locator('.uc-grupa').first().evaluate((e) => e.click());
  await expect.poll(() => page.evaluate(() => window.__karta.getZoom())).toBeGreaterThan(zoom0);
  await expect.poll(obuhvaceno).toBe(15);
  await page.evaluate(() => window.__karta.setView([44.8615, 16.1], 15, { animate: false }));
  await page.waitForTimeout(500);
  await expect.poll(() => page.locator('.uc-marker').count()).toBe(15);
  await expect(page.locator('.uc-marker[data-uid]').first()).toHaveText(/^[A-ZČĆŽŠĐ]{2}$/);
  await snimak(page, 'sim16-karta');

  await lok(page, '#btn-istrazivac');
  await page.waitForTimeout(600);
  await snimak(page, 'sim16-3d');
  // dodir na kolegu (Kemal Tabaković)
  const kolega = page.locator('.uc-marker', { hasText: 'KT' });
  const b = await kolega.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('#istrazivac-detalj')).toBeVisible();
  await expect(page.locator('#ist-detalj-ime')).toHaveText('Kemal Tabaković');
  await expect(page.locator('#ist-detalj-udaljenost')).toContainText('od tebe');
  // pogled pokazuje i mene i izabranog kolegu (popup bi kartu odvukao u stranu)
  const vp = page.viewportSize();
  const kb = await kolega.boundingBox();
  expect(kb.x).toBeGreaterThan(0);
  expect(kb.x + kb.width).toBeLessThan(vp.width);
  const nb = await page.locator('.gps-nisan').boundingBox();
  expect(nb && nb.y > 0 && nb.y < vp.height).toBe(true);
  const istaknut = await kolega.evaluate((e) => getComputedStyle(e).boxShadow);
  expect(istaknut).toContain('217, 164, 65'); // zlatni prsten izabranog
  await page.waitForTimeout(400);
  await snimak(page, 'sim16-3d-kolega');
  // izlaz iz 3D skida isticanje
  await page.locator('#btn-ist-izlaz').click();
  expect(await kolega.evaluate((e) => getComputedStyle(e).boxShadow)).not.toContain('217, 164, 65');
});
