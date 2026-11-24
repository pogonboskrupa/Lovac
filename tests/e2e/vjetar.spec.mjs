import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, pogledBlizu } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await pogledBlizu(page); });

test.use({ timezoneId: 'Europe/Sarajevo' });

const NOW = new Date('2026-11-19T12:20:00+01:00').getTime();
const HOUR0 = Math.floor(NOW / 3600000) * 3600; // unix sekunde, početak trenutnog sata

function forecast(dirDeg) {
  const time = [];
  for (let i = -2; i < 48; i++) time.push(HOUR0 + i * 3600);
  return {
    hourly: {
      time,
      wind_speed_10m: time.map(() => 3.2),
      wind_direction_10m: time.map(() => dirDeg),
      wind_gusts_10m: time.map(() => 6.1),
    },
  };
}

// DEM pločica: teren raste prema istoku (2 m po pikselu), kodiran kao Terrarium PNG.
async function slopeTile(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const v = 500 + x * 2 + 32768;
        const i = (y * 256 + x) * 4;
        img.data[i] = Math.floor(v / 256); img.data[i + 1] = v % 256; img.data[i + 2] = 0; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(b64, 'base64');
}

async function setup(page, { dir = 300, wind = true } = {}) {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  const png = await slopeTile(page);
  await page.route(/elevation-tiles-prod/, (r) => r.fulfill({ status: 200, body: png, headers: { 'content-type': 'image/png', 'access-control-allow-origin': '*' } }));
  await page.route(/api\.open-meteo\.com/, (r) => (wind
    ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(forecast(dir)) })
    : r.abort('internetdisconnected')));
  await page.reload();
}

async function addStand(page, sektori) {
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await page.locator('#objekt-vrste [data-kod="ceka_visoka"]').click();
  await expect(page.locator('#objekt-vjetar-blok')).toBeVisible();
  for (const s of sektori) await page.locator(`#objekt-vjetar [data-sektor="${s}"]`).click();
  await page.locator('#forma-objekt button[type=submit]').click();
  await page.locator('.obj-ikona').click();
}

test('čeka sa dozvoljenim SZ/Z: vjetar sa SZ odgovara, konus mirisa niz vjetar, termika iz DEM-a', async ({ page }) => {
  await setup(page, { dir: 300 });
  await addStand(page, [6, 7]);
  await expect(page.locator('#od-vjetar-tekst')).toHaveText(/^Vjetar: SZ \(300°\) 3,2 m\/s, udari 6,1 · prognoza preuzeta/);
  await expect(page.locator('#od-vjetar-stanje')).toHaveAttribute('data-stanje', 'ok');
  await expect(page.locator('#od-vjetar-stanje')).toHaveText('Odgovara današnjem vjetru');
  await expect(page.locator('#od-termika')).toHaveText(/danju zrak ide uzbrdo — miris nosi prema I/);
  await page.locator('#btn-od-konus').click();
  await expect(page.locator('path.konus')).toHaveCount(1);
  await page.locator('#btn-od-konus').click();
  await expect(page.locator('path.konus')).toHaveCount(0);
  await expect(page.locator('#koord-nv')).toHaveText(/^\d+ m$/);
});

test('vjetar sa istoka ne odgovara čeki za SZ', async ({ page }) => {
  await setup(page, { dir: 90 });
  await addStand(page, [7]);
  await expect(page.locator('#od-vjetar-stanje')).toHaveAttribute('data-stanje', 'ne');
  await expect(page.locator('#od-vjetar-stanje')).toHaveText('NE odgovara današnjem vjetru');
});

test('bez interneta i bez keša: nema izmišljenog vjetra, konus ugašen', async ({ page }) => {
  await setup(page, { wind: false });
  await addStand(page, [7]);
  await expect(page.locator('#od-vjetar-tekst')).toContainText('Potreban je internet');
  await expect(page.locator('#btn-od-konus')).toBeDisabled();
});

test('stara prognoza (od prije 3 dana) se ne prikazuje kao trenutni vjetar', async ({ page }) => {
  await setup(page, { wind: false });
  await page.evaluate((h) => {
    const sati = [];
    for (let i = 0; i < 24; i++) sati.push({ t: (h - 72 * 3600 + i * 3600) * 1000, brzina: 9, smjer: 0, udari: 12 });
    for (const k of Object.keys(localStorage)) if (k.startsWith('lovac.vjetar.')) localStorage.removeItem(k);
    localStorage.setItem('lovac.vjetar.44.90_16.15', JSON.stringify({ preuzeto: Date.now() - 72 * 3600000, sati }));
  }, HOUR0);
  await addStand(page, [0]);
  await expect(page.locator('#od-vjetar-tekst')).toHaveText(/^Nema svježe prognoze \(prognoza preuzeta prije 3 dana\)/);
});

test('hranilište nema blok vjetra; dozvoljeni smjerovi su u formi samo za čeke', async ({ page }) => {
  await setup(page);
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await page.locator('#objekt-vrste [data-kod="hraniliste"]').click();
  await expect(page.locator('#objekt-vjetar-blok')).toBeHidden();
  await page.locator('#forma-objekt button[type=submit]').click();
  await page.locator('.obj-ikona').click();
  await expect(page.locator('#od-vjetar')).toBeHidden();
});
