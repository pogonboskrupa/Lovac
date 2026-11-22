import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok } from './helpers.mjs';

const tracksInDb = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => {
    const req = r.result.transaction('tragovi').objectStore('tragovi').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  };
  r.onerror = () => reject(r.error);
}));

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
});

// Lažni AndroidGps: bafer je niz tačaka, a pomak je indeks (native koristi bajtove, JS ga ne tumači).
async function installNativeMock(page) {
  await page.addInitScript(() => {
    window.__buf = [];
    window.__gps = { start: 0, stop: 0, clear: 0, battery: 0 };
    window.AndroidGps = {
      start: () => { window.__gps.start++; return 'ok'; },
      stop: () => { window.__gps.stop++; },
      clear: () => { window.__gps.clear++; window.__buf = []; },
      read: (off) => JSON.stringify({ next: window.__buf.length, pts: window.__buf.slice(off) }),
      isIgnoringBattery: () => false,
      requestBatteryExemption: () => { window.__gps.battery++; },
    };
    window.__push = (n, startLat, extra = {}) => {
      const t0 = Date.now();
      for (let i = 0; i < n; i++) {
        window.__buf.push({ t: t0 + i * 10, lat: startLat + i * 0.0002, lon: 16.15, acc: 4, ...extra });
      }
    };
  });
}

test('APK: tačke iz native bafera, pauza ne ulazi u trag, stop gasi servis', async ({ page }) => {
  await installNativeMock(page);
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  await expect(page.locator('#snim-status')).toHaveText('Snima');
  expect(await page.evaluate(() => window.__gps)).toMatchObject({ start: 1, battery: 1 });

  await page.evaluate(() => window.__push(3, 44.88));
  await expect(page.locator('#snim-tacke')).toHaveText('3', { timeout: 8000 });

  await page.locator('#btn-snim-pauza').click();
  await expect(page.locator('#snim-status')).toHaveText('Pauza');
  await page.waitForTimeout(50);
  // Tačke snimljene tokom pauze (vremenski unutar intervala) se ne smiju pojaviti.
  await page.evaluate(() => {
    const t = Date.now();
    window.__buf.push({ t, lat: 44.9, lon: 16.2, acc: 4 });
  });
  await page.waitForTimeout(3500);
  await expect(page.locator('#snim-tacke')).toHaveText('3');

  await page.locator('#btn-snim-pauza').click();
  await expect(page.locator('#snim-status')).toHaveText('Snima');
  await page.evaluate(() => window.__push(2, 44.8812));
  await expect(page.locator('#snim-tacke')).toHaveText('5', { timeout: 8000 });

  await page.locator('#btn-snim-stop').click();
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  await page.locator('#btn-snim-stop').click();
  await expect(page.locator('#panel-snimanje')).toBeHidden();
  expect(await page.evaluate(() => window.__gps)).toMatchObject({ stop: 1, clear: 1 });

  const [tr] = await tracksInDb(page);
  expect(tr.status).toBe('gotovo');
  expect(tr.tacke).toHaveLength(5);
  expect(tr.pauze).toHaveLength(1);
  expect(tr.pauze[0].do).not.toBeNull();
});

test('browser: snimanje preko watchPosition i spisak tragova sa dužinom', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.88, longitude: 16.15, accuracy: 5 });
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  for (let i = 1; i <= 3; i++) {
    await page.waitForTimeout(300);
    await context.setGeolocation({ latitude: 44.88 + i * 0.0005, longitude: 16.15, accuracy: 5 });
  }
  await expect.poll(async () => Number(await page.locator('#snim-tacke').innerText())).toBeGreaterThanOrEqual(3);
  await page.locator('#btn-snim-stop').click();
  await page.locator('#btn-snim-stop').click();

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-tragovi').click();
  await expect(page.locator('#tragovi')).toBeVisible();
  const row = page.locator('#tragovi-spisak .trag-red');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.sitno').first()).toContainText(/1\d\d m/);
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#tragovi')).toBeHidden();
});

test('pad app-a tokom snimanja: dijalog oporavka nudi nastavak ili završetak', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.88, longitude: 16.15, accuracy: 5 });
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  await expect.poll(async () => (await tracksInDb(page)).length).toBe(1);

  await page.reload();
  await expect(page.locator('#oporavak')).toBeVisible();
  await expect(page.locator('#oporavak-tekst')).toContainText('prekinuto');
  await page.locator('#btn-oporavak-nastavi').click();
  await expect(page.locator('#panel-snimanje')).toBeVisible();

  await page.reload();
  await expect(page.locator('#oporavak')).toBeVisible();
  await page.locator('#btn-oporavak-zavrsi').click();
  await expect(page.locator('#oporavak')).toBeHidden();
  // trag je prekratak (< 50 m), pa se završetkom odbacuje umjesto da završi u Moji tragovi
  await expect.poll(async () => (await tracksInDb(page)).length).toBe(0);
});

test('izvoz GPX/KML ide kroz AndroidShare, uglačavanje se može vratiti, brisanje traži drugi dodir', async ({ page }) => {
  await installNativeMock(page);
  await page.addInitScript(() => {
    window.__shared = [];
    window.AndroidShare = { shareFile: (name, mime, content) => window.__shared.push({ name, mime, content }) };
  });
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  await page.evaluate(() => window.__push(6, 44.88));
  await expect(page.locator('#snim-tacke')).toHaveText('6', { timeout: 8000 });
  await page.locator('#btn-snim-stop').click();
  await page.locator('#btn-snim-stop').click();

  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-tragovi').click();
  const row = page.locator('#tragovi-spisak .trag-red').first();
  await row.locator('[data-akcija="gpx"]').click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  await row.locator('[data-akcija="kml"]').click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2);
  const shared = await page.evaluate(() => window.__shared);
  expect(shared[0].name).toMatch(/^trag-\d{4}-\d{2}-\d{2}-\d{4}\.gpx$/);
  expect(shared[0].mime).toBe('application/gpx+xml');
  expect((shared[0].content.match(/<trkpt /g) || []).length).toBe(6);
  expect(shared[1].name).toMatch(/\.kml$/);
  expect(shared[1].content).toContain('<LineString>');

  await row.locator('[data-akcija="uglacaj"]').click();
  await expect(page.locator('#tragovi-spisak [data-akcija="uglacaj"]')).toHaveText('Original');
  await page.locator('#tragovi-spisak [data-akcija="uglacaj"]').click();
  await expect(page.locator('#tragovi-spisak [data-akcija="uglacaj"]')).toHaveText('Uglačaj');

  await page.locator('#tragovi-spisak [data-akcija="obrisi"]').click();
  await expect(page.locator('#tragovi-spisak .trag-red')).toHaveCount(1);
  await page.locator('#tragovi-spisak [data-akcija="obrisi"]').click();
  await expect(page.locator('#tragovi-spisak .trag-red')).toHaveCount(0);
});

test('dodirne mete snimanja ≥ 44 px', async ({ page }) => {
  await installNativeMock(page);
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  for (const sel of ['#btn-moja-lokacija', '#btn-spiskovi', '#btn-snim-pauza', '#btn-snim-stop']) {
    const b = await page.locator(sel).boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
});

test('trag kraći od 50 m se ne čuva u Moji tragovi i javlja se razlog', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.88, longitude: 16.15, accuracy: 5 });
  await page.goto('/');
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#panel-snimanje')).toBeVisible();
  await expect.poll(async () => (await tracksInDb(page)).length).toBe(1);
  await page.locator('#btn-snim-stop').click();
  await page.locator('#btn-snim-stop').click();
  await expect(page.locator('#panel-snimanje')).toBeHidden();
  await expect(page.locator('#poruka')).toContainText('kraći od 50 m');
  await expect.poll(async () => (await tracksInDb(page)).length).toBe(0);
});
