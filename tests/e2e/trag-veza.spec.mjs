import { test, expect } from '@playwright/test';
import { serveTiles, lok } from './helpers.mjs';

const ME = { id: '00000000-0000-4000-8000-0000000000aa', ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: false };
const tracksInDb = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction('tragovi').objectStore('tragovi').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); };
  r.onerror = () => reject(r.error);
}));

// Trag se snima dok veza čas radi, čas ne: ni jedan prekid veze ne smije izbrisati trag.
test('snimanje traga preživi naizmjeničnu vezu (server vrti, odbija, pada) i trag ostaje u spisku i na telefonu', async ({ page }) => {
  const server = { mode: 'abort', sent: [] };
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  await page.route(/lazni\.supabase\.test\/rest\/v1\/(\w+)/, async (route) => {
    const req = route.request();
    const table = new URL(req.url()).pathname.split('/').pop();
    if (server.mode === 'abort') return route.abort('failed');
    if (server.mode === 'rls' && req.method() === 'POST') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: `row-level security policy (USING expression) for table "${table}"` }) });
    if (req.method() === 'POST') { server.sent.push({ table, body: req.postDataJSON() }); return route.fulfill({ status: 201, body: '' }); }
    if (table === 'korisnici') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ME]) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((me) => {
    localStorage.setItem('lovac.profil', JSON.stringify(me));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: me.id, aud: 'authenticated', role: 'authenticated' } }));
    window.__buf = [];
    window.AndroidGps = {
      start: () => 'ok', stop: () => {}, clear: () => { window.__buf = []; },
      read: (off) => JSON.stringify({ next: window.__buf.length, pts: window.__buf.slice(off) }),
      isIgnoringBattery: () => true, requestBatteryExemption: () => {},
    };
    // Realne tačke: hod ~5 m/s, svake 2 s, vrijeme stalno raste (filter brzine i redoslijeda ih ne smije odbaciti).
    window.__t = Date.now(); window.__lat = 44.88;
    window.__push = (n) => { for (let i = 0; i < n; i++) { window.__t += 2000; window.__lat += 0.0001; window.__buf.push({ t: window.__t, lat: window.__lat, lon: 16.15, acc: 4 }); } };
  }, ME);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await lok(page, '#btn-snimaj');
  await expect(page.locator('#snim-status')).toHaveText('Snima');

  await page.evaluate(() => window.__push(3));
  await expect(page.locator('#snim-tacke')).toHaveText('3', { timeout: 8000 });
  server.mode = 'rls';
  await page.evaluate(() => window.__push(3));
  await expect(page.locator('#snim-tacke')).toHaveText('6', { timeout: 8000 });
  server.mode = 'ok';
  await page.evaluate(() => window.__push(3));
  await expect(page.locator('#snim-tacke')).toHaveText('9', { timeout: 8000 });

  await page.locator('#btn-snim-stop').click();
  await page.locator('#btn-snim-stop').click();
  await expect(page.locator('#panel-snimanje')).toBeHidden();
  const [tr] = await tracksInDb(page);
  expect(tr.status).toBe('gotovo');
  expect(tr.tacke).toHaveLength(9);
  await expect.poll(async () => { await page.locator('#btn-posalji-sad').evaluate((b) => b.click()).catch(() => {}); return server.sent.filter((s) => s.table === 'tragovi').length; }, { timeout: 12000 }).toBeGreaterThan(0);
  expect((await tracksInDb(page))).toHaveLength(1);
});
