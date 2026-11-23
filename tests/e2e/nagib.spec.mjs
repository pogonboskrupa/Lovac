import { test, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

// Terrarium pločica sa ravnom nagiba `deg` prema istoku (ćelija ~13,5 m na 44,9° N).
function demPng(deg) {
  const rise = Math.tan((deg * Math.PI) / 180) * 13.55;
  const raw = Buffer.alloc(256 * (1 + 256 * 4));
  for (let y = 0; y < 256; y++) {
    const row = y * (1 + 256 * 4);
    for (let x = 0; x < 256; x++) {
      const v = 500 + x * rise + 32768;
      const o = row + 1 + x * 4;
      raw[o] = Math.floor(v / 256); raw[o + 1] = Math.floor(v) % 256; raw[o + 2] = Math.floor((v - Math.floor(v)) * 256); raw[o + 3] = 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(256, 0); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.route(/elevation-tiles-prod\/terrarium/, (r) => r.fulfill({ status: 200, body: demPng(32), headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }));
});

const obojano = (page) => page.evaluate(() => [...document.querySelectorAll('.leaflet-nagib-pane canvas')].reduce((sum, c) => {
  const d = c.getContext('2d').getImageData(0, 0, 256, 256).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return sum + n;
}, 0));

test('Granice lovišta: sloj nagiba boji teren strmiji od praga (30° zadano), prag se mijenja i pamti', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 14 })));
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await expect(page.locator('#nagib-prag [data-prag="30"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#nagib-legenda')).toContainText('30–35°');
  expect(await obojano(page)).toBe(0); // zadano isključeno

  await page.locator('#btn-nagib-prikazi').click();
  await expect(page.locator('#btn-nagib-prikazi')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => obojano(page)).toBeGreaterThan(1000); // ravan od 32° je iznad 30°

  await page.locator('#nagib-prag [data-prag="35"]').click();
  await expect.poll(() => obojano(page)).toBe(0); // 32° nije iznad 35°
  await expect(page.locator('#nagib-legenda')).toContainText('35–40°');

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.nagib')))).toEqual({ on: true, prag: 35 });
  await page.reload();
  await expect(page.locator('.leaflet-nagib-pane')).toBeAttached();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await expect(page.locator('#btn-nagib-prikazi')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#nagib-prag [data-prag="35"]')).toHaveAttribute('aria-pressed', 'true');
});

test('sloj nagiba kaže da treba uvećati kartu kad je razmjera sitna', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 11 })));
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await page.locator('#btn-nagib-prikazi').click();
  await expect(page.locator('#nagib-status')).toContainText('Uvećaj kartu');
  expect(await obojano(page)).toBe(0);
});
