import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG } from './helpers.mjs';

const TEREN = { id: 'teren.mbtiles', naziv: 'Teren društva', format: 'mbtiles', minzoom: 8, maxzoom: 16, velicina: 314572800, bounds: '15.5,44.4,16.9,45.2' };

async function bridge(page, { teren = null } = {}) {
  await page.addInitScript((t) => {
    window.__karte = t ? [t] : [];
    window.__poziv = [];
    window.AndroidKarte = {
      spisak: () => JSON.stringify(window.__karte),
      uvezi: () => {},
      ukloni: (id) => { window.__karte = window.__karte.filter((k) => k.id !== id); return true; },
      preuzmi: (url, naziv) => window.__poziv.push({ url, naziv }),
    };
  }, teren);
}

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

test('podloge na mapi su Topo, Satelit i Teren; u browseru Teren objašnjava da radi u aplikaciji', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  await expect(page.locator('#meni-podloga button')).toHaveText(['Topo', 'Satelit', 'Teren']);
  await page.locator('#meni-podloga [data-podloga="teren"]').click();
  await expect(page.locator('#poruka')).toContainText('Teren radi u aplikaciji');
  await expect(page.locator('#meni-podloga [data-podloga="topo"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#meni-podloga [data-podloga="teren"]')).toHaveAttribute('aria-pressed', 'false');
});

test('Teren nije preuzet: izbor vodi na preuzimanje sa Release-a, napredak, pa se podloga prebacuje', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  await page.locator('#meni-podloga [data-podloga="teren"]').click();
  await expect(page.locator('#karte')).toBeVisible();
  await expect(page.locator('#teren-status')).toContainText('nije preuzet');
  await expect(page.locator('#btn-teren-ukloni')).toBeHidden();
  await page.locator('#btn-teren-preuzmi').click();
  const poziv = await page.evaluate(() => window.__poziv);
  expect(poziv).toEqual([{ url: expect.stringMatching(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/karte\/teren\.mbtiles$/), naziv: 'teren.mbtiles' }]);
  await page.evaluate(() => window.__karteNapredak('37'));
  await expect(page.locator('#karte-status')).toHaveText('Preuzimam teren… 37 %');

  const tiles = [];
  await page.route(/appassets\.androidplatform\.net\/mbtiles\//, (r) => { tiles.push(r.request().url()); return r.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png' } }); });
  await page.evaluate((t) => { window.__karte = [t]; window.__karteUvoz(JSON.stringify(t)); }, TEREN);
  await expect(page.locator('#teren-status')).toContainText('300 MB');
  await expect(page.locator('#teren-status')).toContainText('zoom 8–16');
  await expect(page.locator('#btn-teren-preuzmi')).toHaveText('Preuzmi ponovo (ažuriraj)');
  await expect(page.locator('#meni-podloga [data-podloga="teren"]')).toHaveAttribute('aria-pressed', 'true');
  // Teren se NE nudi kao dodatni sloj među offline kartama.
  await expect(page.locator('#karte-spisak [data-id]')).toHaveCount(0);
  await page.locator('#nav-mapa').click();
  await page.evaluate(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 12 })));
  await page.reload();
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  expect(tiles.every((u) => /\/mbtiles\/teren\.mbtiles\/\d+\/\d+\/\d+$/.test(u))).toBe(true);
});

test('preuzet teren: sačuvan izbor se vraća poslije ponovnog pokretanja; uklanjanje vraća Topo', async ({ page }) => {
  await bridge(page, { teren: TEREN });
  await page.route(/appassets\.androidplatform\.net\/mbtiles\//, (r) => r.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png' } }));
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  await page.locator('#meni-podloga [data-podloga="teren"]').click();
  await expect(page.locator('#meni-podloga [data-podloga="teren"]')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#meni-podloga [data-podloga="teren"]')).toHaveAttribute('aria-pressed', 'true');

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await page.locator('#btn-teren-ukloni').click();
  await page.locator('#btn-teren-ukloni').click();
  await expect(page.locator('#teren-status')).toContainText('nije preuzet');
  await expect(page.locator('#meni-podloga [data-podloga="topo"]')).toHaveAttribute('aria-pressed', 'true');
});

test('greška preuzimanja se prikazuje lovcu', async ({ page }) => {
  await bridge(page);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-karte').click();
  await page.locator('#btn-teren-preuzmi').click();
  await page.evaluate(() => window.__karteGreska('Teren još nije objavljen (Release "karte" nema fajl teren.mbtiles)'));
  await expect(page.locator('#karte-status')).toContainText('još nije objavljen');
});
