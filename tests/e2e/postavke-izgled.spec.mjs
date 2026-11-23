import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

test.use({ viewport: { width: 360, height: 800 } });

// Relativna osvijetljenost i omjer kontrasta (WCAG) računaju se u stranici nad stvarnim bojama.
const contrastJs = `(a, b) => {
  const lum = (c) => { const [r, g, bl] = c.match(/\\d+(\\.\\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}`;

for (const tema of ['noc', 'dan']) {
  test(`Postavke (${tema}): kartice imaju okvir, a okvir je dovoljno kontrastan prema kartici i pozadini`, async ({ page }) => {
    await fakeServerConfigUnset(page);
    await serveTiles(page);
    await page.addInitScript((t) => {
      localStorage.setItem('lovac.tema', JSON.stringify(t));
      localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Predsjednik', prezime: 'LD', odobren: true, is_admin: true }));
    }, tema);
    await page.goto('/');
    await page.locator('#btn-postavke').click();
    const r = await page.locator('#postavke .p-kartica').first().evaluate((el, js) => {
      const cs = getComputedStyle(el);
      const ratio = eval(js);
      return { w: parseFloat(cs.borderTopWidth), stil: cs.borderTopStyle, kartica: ratio(cs.borderTopColor, cs.backgroundColor), pozadina: ratio(cs.borderTopColor, getComputedStyle(document.body).backgroundColor) };
    }, contrastJs);
    expect(r.stil).toBe('solid');
    expect(r.w).toBeGreaterThanOrEqual(1);
    expect(r.kartica).toBeGreaterThanOrEqual(3);
    expect(r.pozadina).toBeGreaterThanOrEqual(3);
  });
}
