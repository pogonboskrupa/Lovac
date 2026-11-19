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

