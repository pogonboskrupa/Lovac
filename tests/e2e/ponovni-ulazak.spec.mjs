import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

// Odjava pa ponovna prijava: karta je bila skrivena dok je tastatura mijenjala veličinu prozora.
test('poslije odjave i ponovnog ulaska karta se iscrta cijela (nema crnih pločica)', async ({ page }) => {
  await serveTiles(page);
  await fakeServerConfigUnset(page);
  await page.addInitScript(() => {
    if (!localStorage.getItem('test.seeded')) {
      localStorage.setItem('test.seeded', '1');
      localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'A', prezime: 'B', odobren: true }));
    }
  });
  const vp = { width: 360, height: 1000 };
  await page.setViewportSize({ width: 360, height: 300 });
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.locator('#ekran-mapa').evaluate(() => import('/static/js/ui.js').then((m) => m.showScreen('prijava')));
  await expect(page.locator('#ekran-prijava')).toBeVisible();
  await page.setViewportSize(vp);
  await page.waitForTimeout(400); // resize se obradi dok je karta još skrivena
  await page.evaluate(() => import('/static/js/ui.js').then((m) => m.showScreen('mapa')));
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  const covered = async (x, y) => page.evaluate(([px, py]) => [...document.querySelectorAll('.leaflet-tile-loaded')].some((t) => { const r = t.getBoundingClientRect(); return r.width > 0 && px >= r.left && px <= r.right && py >= r.top && py <= r.bottom; }), [x, y]);
  await expect.poll(() => covered(vp.width - 5, vp.height - 100)).toBe(true);
  await expect.poll(() => covered(5, 5)).toBe(true);
});
