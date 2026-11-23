import { test, expect } from '@playwright/test';
import { serveTiles, lok } from './helpers.mjs';

// Cijeli dan u lovištu: server ne odgovara (mrtva ili preslaba veza), a lovac snima trag, gleda svoju lokaciju
// i upisuje opažanje. Sve mora raditi na telefonu, a kad veza proradi, zapisi sami odu na server.
const ME = { id: '00000000-0000-4000-8000-0000000000aa', ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: false };
const store = (page, name) => page.evaluate((s) => new Promise((resolve, reject) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); };
  r.onerror = () => reject(r.error);
}), name);

test.use({ viewport: { width: 360, height: 740 }, geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test('bez veze: lokacija, snimanje traga i opažanje rade; kad veza proradi, sve se samo pošalje', async ({ page }) => {
  const server = { mode: 'visi', sent: [] };
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\//, async (route) => {
    if (server.mode === 'visi') return new Promise(() => {}); // mrtva veza: zahtjev visi, ne pada
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const table = url.pathname.split('/').pop();
    if (req.method() === 'POST') { server.sent.push(table); return route.fulfill({ status: 201, body: '' }); }
    if (table === 'korisnici') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ME]) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((me) => {
    localStorage.setItem('lovac.profil', JSON.stringify(me));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: me.id, aud: 'authenticated', role: 'authenticated' } }));
    window.__buf = [];
    window.AndroidGps = {
      start: () => 'ok', stop: () => {}, clear: () => { window.__buf = []; },
      read: (off) => JSON.stringify({ next: window.__buf.length, pts: window.__buf.slice(off) }),
      isIgnoringBattery: () => true, requestBatteryExemption: () => {},
    };
    window.__lat = 44.88;
    window.__push = (n) => { for (let i = 0; i < n; i++) { window.__lat += 0.0001; window.__buf.push({ t: Date.now() + i * 2000, lat: window.__lat, lon: 16.15, acc: 4 }); } };
  }, ME);
  await page.clock.install();
  await page.goto('/');

  // 1) Pokretanje bez veze: karta odmah, bez prijave
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await expect(page.locator('#ekran-prijava')).toBeHidden();

  // 2) Moja lokacija radi bez interneta (GPS)
  await expect(page.locator('#karta .gps-nisan')).toHaveCount(1);
  await page.locator('#btn-moja-lokacija').click();
  await expect(page.locator('#lok-ploca')).toBeVisible();
  await expect(page.locator('#lok-ploca')).toContainText('44.88');
  await page.locator('#btn-lok-zatvori').click();

  // 3) Snimanje traga
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#snim-status')).toHaveText('Snima');
  for (let k = 0; k < 4; k++) {
    await page.evaluate(() => window.__push(3));
    await page.clock.runFor(8000);
  }
  await expect.poll(async () => Number(await page.locator('#snim-tacke').textContent())).toBeGreaterThanOrEqual(10);

  // 4) Opažanje dok snimanje traje
  await lok(page, '#btn-opazanje');
  await expect(page.locator('#opazanje-forma')).toBeVisible();
  await page.locator('#forma-opazanje button[type=submit]').click();
  await expect(page.locator('#opazanje-forma')).toBeHidden();

  // 5) Kraj snimanja: trag je na telefonu
  await page.locator('#btn-snim-stop').click();
  await page.locator('#btn-snim-stop').click();
  await expect(page.locator('#panel-snimanje')).toBeHidden();
  await expect.poll(async () => (await store(page, 'tragovi')).filter((t) => t.status === 'gotovo').length).toBe(1);
  expect((await store(page, 'opazanja')).length).toBe(1);

  // Dugo bez veze (rokovi zahtjeva istječu): ništa nije poslano i ništa nije izgubljeno
  await page.clock.runFor(5 * 60 * 1000);
  expect(server.sent).toEqual([]);
  expect((await store(page, 'tragovi')).length).toBe(1);

  // 6) Veza proradi: provjera veze to primijeti i red slanja sam pošalje trag i opažanje
  server.mode = 'ok';
  for (let k = 0; k < 12 && !(server.sent.includes('tragovi') && server.sent.includes('opazanja')); k++) {
    await page.clock.runFor(30000);
    await page.waitForTimeout(100);
  }
  expect(server.sent).toContain('tragovi');
  expect(server.sent).toContain('opazanja');
});

test('bez veze: Statistika i Pregled se otvaraju odmah (zadnje sačuvano), ne čekaju server', async ({ page }) => {
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\//, () => new Promise(() => {}));
  await page.addInitScript((me) => {
    localStorage.setItem('lovac.profil', JSON.stringify(me));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 36000, user: { id: me.id, aud: 'authenticated', role: 'authenticated' } }));
  }, ME);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-statistika').click();
  await expect(page.locator('#statistika')).toBeVisible({ timeout: 2000 });
  await page.locator('#btn-statistika-zatvori').click();
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-pregled').click();
  await expect(page.locator('#pregled')).toBeVisible({ timeout: 2000 });
  await page.locator('#btn-pregled-zatvori').click();
  // Danas (svjetlo, lovno vrijeme) ne treba internet: prognoza visi, a ekran se ipak otvara odmah
  await page.route(/open-meteo\.com/, () => new Promise(() => {}));
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-danas').click();
  await expect(page.locator('#danas')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#danas-luk-stanje')).not.toBeEmpty();
});
