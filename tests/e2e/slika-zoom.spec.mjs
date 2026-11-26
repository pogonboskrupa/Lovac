// Velika slika: zum sa dva prsta (pinch), pomjeranje uvećane slike, dupli dodir i vraćanje.
import { test, expect } from '@playwright/test';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';

async function open(page) {
  await page.goto('/');
  await page.evaluate(async (src) => {
    const m = await import('/static/js/slika-pregled.js');
    m.initImageViewer();
    m.openImageViewer({ src, share: false });
  }, PNG);
  await expect(page.locator('#slika-velika')).toBeVisible();
}
const scaleOf = () => document.getElementById('slika-velika-img').style.transform;
const touch = (page, type, id, x, y) => page.locator('#slika-velika').dispatchEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: 'touch', isPrimary: id === 1, bubbles: true });

test('dva prsta uvećavaju sliku, dva prsta unazad vraćaju na cijelu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await open(page);
  await touch(page, 'pointerdown', 1, 150, 400);
  await touch(page, 'pointerdown', 2, 240, 400);
  for (let i = 1; i <= 6; i++) { await touch(page, 'pointermove', 1, 150 - i * 15, 400); await touch(page, 'pointermove', 2, 240 + i * 15, 400); }
  await touch(page, 'pointerup', 2, 330, 400);
  await touch(page, 'pointerup', 1, 60, 400);
  const t = await page.evaluate(scaleOf);
  expect(t).toMatch(/scale\((\d+(\.\d+)?)\)/);
  expect(Number(/scale\(([\d.]+)\)/.exec(t)[1])).toBeGreaterThan(2);
  // približavanje prstiju do početka vraća cijelu sliku
  await touch(page, 'pointerdown', 1, 60, 400);
  await touch(page, 'pointerdown', 2, 330, 400);
  for (let i = 1; i <= 8; i++) { await touch(page, 'pointermove', 1, 60 + i * 13.5, 400); await touch(page, 'pointermove', 2, 330 - i * 13.5, 400); }
  await touch(page, 'pointerup', 2, 222, 400);
  await touch(page, 'pointerup', 1, 168, 400);
  expect(await page.evaluate(scaleOf)).toBe('');
});

test('dupli dodir uvećava, drugi dupli dodir vraća; točkić miša zumira', async ({ page }) => {
  await open(page);
  const img = page.locator('#slika-velika-img');
  await img.dblclick();
  expect(await page.evaluate(scaleOf)).toMatch(/scale\(2\.5\)/);
  expect(await page.evaluate(() => document.getElementById('slika-velika').classList.contains('pun'))).toBe(false); // dupli dodir ne ide u cijeli ekran
  await img.dblclick();
  expect(await page.evaluate(scaleOf)).toBe('');
  await img.hover();
  await page.mouse.wheel(0, -200);
  await expect.poll(() => page.evaluate(scaleOf)).toMatch(/scale/);
});

test('jedan dodir (bez uvećanja) prebacuje na cijeli ekran', async ({ page }) => {
  await open(page);
  await page.locator('#slika-velika-img').click();
  await expect(page.locator('#slika-velika')).toHaveClass(/pun/);
});
