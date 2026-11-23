import { test, expect } from '@playwright/test';
import { PNG, TILE_HOSTS, fakeServerConfigUnset } from './helpers.mjs';

test('pločice se preuzimaju najviše 6 istovremeno (spor server se ne guši)', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await page.route(/api\.github\.com/, (r) => r.fulfill({ status: 404, body: '{}' }));
  let inflight = 0;
  let max = 0;
  let total = 0;
  await page.route(TILE_HOSTS, async (route) => {
    inflight++; total++;
    max = Math.max(max, inflight);
    await new Promise((r) => setTimeout(r, 150));
    inflight--;
    await route.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } });
  });
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await expect.poll(() => total, { timeout: 8000 }).toBeGreaterThanOrEqual(7);
  await page.waitForTimeout(1500);
  expect(max).toBeLessThanOrEqual(6);
});


test('pločice su canvas sa nacrtanim pikselima (ne <img> sa blob URL-om koji WebView zna ostaviti crnim)', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await page.route(/api\.github\.com/, (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.route(TILE_HOSTS, (route) => route.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  const info = await page.evaluate(() => {
    const t = document.querySelector('#karta .leaflet-tile-loaded');
    return { tag: t.tagName, imgs: document.querySelectorAll('#karta img.leaflet-tile').length, w: t.width };
  });
  expect(info.tag).toBe('CANVAS');
  expect(info.imgs).toBe(0);
  expect(info.w).toBeGreaterThan(0);
});

test('pločice: bez međunivoa tokom zuma i sa većim baferom (manje crnih rupa)', async ({ page }) => {
  await fakeServerConfigUnset(page);
  await page.route(/api\.github\.com/, (r) => r.fulfill({ status: 404, body: '{}' }));
  await page.route(TILE_HOSTS, (route) => route.fulfill({ status: 200, body: PNG, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }));
  await page.goto('/');
  await expect(page.locator('#karta .leaflet-tile-loaded').first()).toBeAttached();
  await page.waitForTimeout(500); // početno učitavanje završeno
  // Poslije zuma stari nivo ostaje pokriven dok novi ne stigne: tačka u sredini je stalno ispod nekog učitanog canvasa.
  await page.evaluate(() => { window.__rupe = 0; });
  const sample = page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    const cx = innerWidth / 2; const cy = innerHeight / 2;
    const tick = () => {
      const hit = [...document.querySelectorAll('#karta canvas.leaflet-tile-loaded')].some((c) => {
        const r = c.getBoundingClientRect();
        return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom && Number(getComputedStyle(c).opacity) > 0.05;
      });
      if (!hit) window.__rupe += 1;
      const cov = [...document.querySelectorAll('#karta canvas.leaflet-tile-loaded')].filter((c) => { const r = c.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; });
      if (cov.length && Math.max(...cov.map((c) => Number(getComputedStyle(c).opacity))) < 0.99) window.__rupe += 1;
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else resolve(window.__rupe);
    };
    tick();
  }));
  await page.locator('#btn-zoom-in').click();
  // Jedan okvir pri samoj zamjeni nivoa je Leafletovo ponašanje; staro ponašanje (blijeđenje pločica) daje desetak okvira.
  expect(await sample).toBeLessThanOrEqual(2);
});
