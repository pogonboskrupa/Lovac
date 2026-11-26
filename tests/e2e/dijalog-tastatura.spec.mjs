// Dugačak dijalog ("Novi zajednički lov") uz tastaturu: mora imati vlastito listanje i držati polje u fokusu na vidnom mjestu.
import { test, expect } from '@playwright/test';

test('dijalog je ograničen visinom ekrana i lista se; polje u fokusu je vidljivo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 360 }); // niski prozor kao ekran sa tastaturom
  await page.goto('/');
  await page.evaluate(() => {
    const d = document.createElement('section');
    d.className = 'dijalog'; d.id = 'proba-dijalog';
    d.innerHTML = '<form>' + Array.from({ length: 8 }, (_, i) => `<label>Polje ${i}<input id="p${i}"></label>`).join('') + '</form>';
    document.body.appendChild(d);
  });
  const d = page.locator('#proba-dijalog');
  const m = await d.evaluate((e) => ({ vis: e.getBoundingClientRect().top, sh: e.scrollHeight, ch: e.clientHeight }));
  expect(m.vis).toBeGreaterThanOrEqual(0);
  expect(m.sh).toBeGreaterThan(m.ch); // sadržaj duži od dijaloga → lista se
  await page.locator('#p7').focus();
  await expect.poll(async () => {
    const b = await page.locator('#p7').boundingBox();
    return b.y >= 0 && b.y + b.height <= 360;
  }).toBe(true);
});
