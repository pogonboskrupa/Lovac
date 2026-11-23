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
  await expect(page.locator('#meni-podloga [data-podloga]')).toHaveText(['Topo', 'Satelit', 'Teren']);
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
  // Veliki fajl: prvi dodir samo upozorava, drugi pokreće preuzimanje.
  await page.locator('#btn-teren-preuzmi').click();
  await expect(page.locator('#btn-teren-preuzmi')).toContainText('dodirni ponovo');
  expect(await page.evaluate(() => window.__poziv)).toEqual([]);
  await page.locator('#btn-teren-preuzmi').click();
  // Dok preuzimanje traje dugme je zaključano (dvostruko preuzimanje bi pokvarilo fajl).
  await expect(page.locator('#btn-teren-preuzmi')).toBeDisabled();
  await page.locator('#btn-teren-preuzmi').click({ force: true });
  const poziv = await page.evaluate(() => window.__poziv);
  expect(poziv).toEqual([{ url: expect.stringMatching(/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/karte\/teren\.mbtiles$/), naziv: 'teren.mbtiles' }]);
  await page.evaluate(() => window.__karteNapredak('37'));
  await expect(page.locator('#teren-preuzimanje')).toHaveText('Preuzimam teren… 37 %');
  await expect(page.locator('#teren-napredak')).toHaveJSProperty('value', 37);
  // brzina i preostalo vrijeme iz preuzimanja u dijelovima
  await page.evaluate(() => window.__karteBrzina('3,4 MB/s · još 2 min'));
  await expect(page.locator('#teren-preuzimanje')).toHaveText('Preuzimam teren… 37 % · 3,4 MB/s · još 2 min');

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
  await page.locator('#btn-teren-preuzmi').click();
  await page.evaluate(() => window.__karteGreska('Teren još nije objavljen (Release "karte" nema fajl teren.mbtiles)'));
  await expect(page.locator('#teren-preuzimanje')).toContainText('još nije objavljen');
  // poslije greške dugme se otključa za novi pokušaj
  await expect(page.locator('#btn-teren-preuzmi')).toBeEnabled();
});

test('Teren: pločice se učitavaju i u pojasu oko ekrana (rubovi pri pomjeranju nisu crni), pozadina je svijetla', async ({ page }) => {
  await bridge(page, { teren: TEREN });
  await page.route(/appassets\.androidplatform\.net\/mbtiles\//, (r) => r.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png' } }));
  await page.addInitScript(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 13 })));
  await page.goto('/');
  await page.locator('#btn-podloga').click();
  await page.locator('#meni-podloga [data-podloga="teren"]').click();
  await expect(page.locator('#karta')).toHaveClass(/podloga-teren/);
  const izvan = () => page.evaluate(() => {
    const w = innerWidth; const h = innerHeight;
    return [...document.querySelectorAll('#karta img.leaflet-tile[src*="/mbtiles/"]')].filter((t) => {
      const r = t.getBoundingClientRect();
      return r.left >= w || r.right <= 0 || r.top >= h || r.bottom <= 0;
    }).length;
  });
  await expect.poll(izvan).toBeGreaterThan(0);
  await page.locator('#btn-podloga').click();
  await page.locator('#meni-podloga [data-podloga="topo"]').click();
  await expect(page.locator('#karta')).not.toHaveClass(/podloga-teren/);
});
