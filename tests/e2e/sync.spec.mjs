import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

const ME = { id: '00000000-0000-4000-8000-0000000000aa', ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: false };
const DRUG = { id: '00000000-0000-4000-8000-0000000000bb', ime: 'Drago', prezime: 'Drug', odobren: true, is_admin: false };

const SHARED = {
  id: '33333333-0000-4000-8000-000000000001', vlasnik_id: DRUG.id, vidljivost: 'drustvo', dijeli_sa: [],
  lat: 44.881, lon: 16.151, podaci: { naziv: 'Dragina čeka', vrsta: 'ceka_visoka', stanje: 'ispravno' }, rev: 1, obrisan: false,
  created_at: '2026-11-18T08:00:00Z', updated_at: '2026-11-18T08:00:00Z', server_at: '2026-11-18T08:00:01Z',
};

async function setup(page, server) {
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    const src = (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'");
    await route.fulfill({ response: res, body: src });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  await page.route(/lazni\.supabase\.test\/rest\/v1\/(\w+)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    if (req.method() === 'POST') {
      if (server.abort) return route.abort('failed');
      if (server.fail) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"server privremeno nedostupan"}' });
      server.sent.push({ table, body: req.postDataJSON(), url: req.url() });
      return route.fulfill({ status: 201, body: '' });
    }
    if (table === 'korisnici') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([ME, DRUG]) });
    if (table === 'objekti') {
      const visible = server.shared.filter((r) => r.vlasnik_id !== ME.id);
      const body = url.searchParams.get('select') === 'id' ? visible.map((r) => ({ id: r.id })) : visible;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.addInitScript((me) => {
    localStorage.setItem('lovac.profil', JSON.stringify(me));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: me.id, aud: 'authenticated', role: 'authenticated' },
    }));
  }, ME);
}

// Upis u red je asinhron (IndexedDB): "Pošalji sad" se ponavlja dok zapis ne stigne na server.
async function sendUntil(page, server, pred) {
  await expect.poll(async () => {
    await page.locator('#btn-posalji-sad').evaluate((b) => b.click());
    await page.waitForTimeout(200);
    return server.sent.filter(pred).length;
  }, { timeout: 10000 }).toBe(1);
}

async function addObject(page, naziv) {
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await page.fill('#forma-objekt input[name=naziv]', naziv);
  await page.locator('#forma-objekt button[type=submit]').click();
  await expect(page.locator('#objekt-forma')).toBeHidden();
}

test('neposlano čeka u redu (i preživi ponovno pokretanje), pa se šalje kad server proradi', async ({ page }) => {
  const server = { fail: true, sent: [], shared: [] };
  await setup(page, server);
  await page.goto('/');
  await addObject(page, 'Moja čeka');
  await expect(page.locator('#red-znacka')).toHaveText('Čeka slanje: 1');
  await page.locator('#red-znacka').click();
  await expect(page.locator('#red-znacka')).toHaveText('Čeka slanje: 1');
  await page.reload();
  await expect(page.locator('#red-znacka')).toHaveText('Čeka slanje: 1');

  server.fail = false;
  // Automatsko slanje može stići prije klika; "Pošalji sad" u Postavkama postoji uvijek.
  await page.locator('#btn-posalji-sad').evaluate((b) => b.click());
  await expect(page.locator('#red-znacka')).toBeHidden();
  const mine = server.sent.filter((s) => s.table === 'objekti');
  expect(mine).toHaveLength(1);
  expect(mine[0].url).toContain('on_conflict=id');
  expect(mine[0].body).toMatchObject({ vlasnik_id: ME.id, vidljivost: 'privatno', rev: 1, obrisan: false, podaci: { naziv: 'Moja čeka' } });
  expect(mine[0].body.podaci).not.toHaveProperty('fotografije');
});

test('promjena vidljivosti jednim dodirom šalje novu verziju (rev 2) sa društvom', async ({ page }) => {
  const server = { fail: false, sent: [], shared: [] };
  await setup(page, server);
  await page.goto('/');
  await addObject(page, 'Hranilište');
  await expect.poll(() => server.sent.length, { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  await page.locator('.obj-ikona').click();
  await expect(page.locator('#od-vlasnik')).toHaveText('Vidljivost: Samo ja');
  await page.locator('#btn-od-dijeli').click();
  await expect(page.locator('#dijeljenje-opis')).toContainText('ni administrator');
  await page.locator('#dijeljenje-izbor [data-vidljivost="drustvo"]').click();
  await page.locator('#btn-dijeljenje-sacuvaj').click();
  await sendUntil(page, server, (x) => x.body.vidljivost === 'drustvo');
  expect(server.sent.find((s) => s.body.vidljivost === 'drustvo').body.rev).toBe(2);
});

test('izabrani lovci: mora se izabrati bar jedan, dijeli_sa ide na server', async ({ page }) => {
  const server = { fail: false, sent: [], shared: [] };
  await setup(page, server);
  await page.goto('/');
  await addObject(page, 'Za Dragu');
  await page.locator('.obj-ikona').click();
  await page.locator('#btn-od-dijeli').click();
  await page.locator('#dijeljenje-izbor [data-vidljivost="izabrani"]').click();
  await expect(page.locator('#dijeljenje-clanovi [data-id]')).toHaveCount(1);
  await page.locator('#btn-dijeljenje-sacuvaj').click();
  await expect(page.locator('#dijeljenje')).toBeVisible();
  await page.locator(`#dijeljenje-clanovi input[value="${DRUG.id}"]`).check();
  await page.locator('#btn-dijeljenje-sacuvaj').click();
  await sendUntil(page, server, (x) => x.body.vidljivost === 'izabrani');
  expect(server.sent.find((s) => s.body.vidljivost === 'izabrani').body.dijeli_sa).toEqual([DRUG.id]);
});

test('brisanje šalje nadgrobni zapis', async ({ page }) => {
  const server = { fail: false, sent: [], shared: [] };
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
  const red = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => { const q = r.result.transaction('red').objectStore('red').getAll(); q.onsuccess = () => res(JSON.stringify(q.result.map((e) => [e.id.slice(0, 14), !!e.tombstone, e.pokusaja]))); };
  }));
  await setup(page, server);
  await page.goto('/');
  await addObject(page, 'Kratkog vijeka');
  logs.push(`poslije unosa: ${await red()} poslano=${server.sent.length}`);
  await page.locator('.obj-ikona').click();
  await page.locator('#btn-od-obrisi').click();
  await page.locator('#btn-od-obrisi').click();
  await page.waitForTimeout(300);
  logs.push(`poslije brisanja: ${await red()} poslano=${server.sent.length}`);
  try {
    await sendUntil(page, server, (x) => x.body.obrisan === true);
  } catch (err) {
    console.log('LOG', JSON.stringify(logs));
    console.log('DIJAG', JSON.stringify(server.sent.map((x) => [x.body.obrisan, x.body.rev])), await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('lovac');
      r.onsuccess = () => { const q = r.result.transaction('red').objectStore('red').getAll(); q.onsuccess = () => res(JSON.stringify(q.result.map((e) => [e.id, !!e.tombstone, e.pokusaja, e.greska, e.sljedeci - Date.now()]))); };
    })));
    throw err;
  }
});

test('podijeljen tuđi objekat stiže sa servera, prikazuje se kao tuđi i ne može se uređivati; nestaje kad ga vlasnik vrati na privatno', async ({ page }) => {
  const server = { fail: false, sent: [], shared: [SHARED] };
  await setup(page, server);
  await page.goto('/');
  await expect(page.locator('.obj-ikona[data-tudji="true"]')).toHaveCount(1, { timeout: 10000 });
  await page.locator('.obj-ikona[data-tudji="true"]').click();
  await expect(page.locator('#od-naziv')).toHaveText('Dragina čeka');
  await expect(page.locator('#od-vlasnik')).toHaveText('Podijelio: Drago Drug');
  await expect(page.locator('#btn-od-uredi')).toBeHidden();
  await expect(page.locator('#btn-od-obrisi')).toBeHidden();
  await expect(page.locator('#btn-od-dijeli')).toBeHidden();
  await expect(page.locator('#btn-od-vodi')).toBeVisible();
  await page.locator('#btn-od-zatvori').click();
  expect(server.sent.filter((s) => s.table === 'objekti')).toHaveLength(0);

  server.shared = [];
  await page.locator('#btn-posalji-sad').evaluate((b) => b.click());
  await expect(page.locator('.obj-ikona[data-tudji="true"]')).toHaveCount(0);
});

test('zaštita: neposlan zapis kojeg nema u redu (npr. upis u red nije uspio) ipak se pošalje', async ({ page }) => {
  const server = { fail: false, sent: [], shared: [] };
  await setup(page, server);
  await page.goto('/');
  await expect(page.locator('#ekran-mapa')).toBeVisible();
  await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('objekti', 'readwrite');
      tx.objectStore('objekti').put({ id: '44444444-0000-4000-8000-000000000001', naziv: 'Bez reda', vrsta: 'soliste', stanje: 'ispravno',
        lat: 44.88, lon: 16.15, vidljivost: 'privatno', dijeli_sa: [], rev: 1, created_at: Date.now(), updated_at: Date.now(), sinhronizovano: false });
      tx.oncomplete = resolve;
    };
  }));
  await sendUntil(page, server, (x) => x.body.id === '44444444-0000-4000-8000-000000000001');
});

const redEntries = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction('red').objectStore('red').getAll(); q.onsuccess = () => resolve(q.result); };
}));

test('mrtva veza ne produžava čekanje: pokušaji se ne broje, ponovo za ~15 s; odbijanje servera (503) i dalje raste', async ({ page }) => {
  const server = { abort: true, sent: [], shared: [] };
  await setup(page, server);
  await page.goto('/');
  await addObject(page, 'Offline čeka');
  await page.locator('#btn-posalji-sad').evaluate((b) => b.click());
  await expect.poll(async () => (await redEntries(page))[0]?.greska ?? null, { timeout: 10000 }).not.toBeNull();
  let e = (await redEntries(page))[0];
  expect(e.pokusaja).toBe(0);
  expect(e.sljedeci - Date.now()).toBeLessThanOrEqual(16000);

  server.abort = false;
  server.fail = true;
  await page.locator('#btn-posalji-sad').evaluate((b) => b.click());
  await expect.poll(async () => (await redEntries(page))[0]?.pokusaja, { timeout: 10000 }).toBeGreaterThan(0);
  e = (await redEntries(page))[0];
  expect(e.sljedeci - Date.now()).toBeGreaterThan(4000);
});
