import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo', geolocation: { latitude: 44.88, longitude: 16.15 }, permissions: ['geolocation'] });

test.beforeEach(async ({ page }) => { await fakeServerConfigUnset(page); });

test('čip dnevnog svjetla pokazuje stanje; Istraživač nagne kartu i pokaže smjer i udaljenost članova', async ({ page }) => {
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00Z'));
  await page.goto('/');
  await expect(page.locator('#svjetlo-chip')).toHaveAttribute('data-stanje', 'dan');
  await expect(page.locator('#svjetlo-chip')).toContainText('Svjetlo do 16:2');

  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#ekran-mapa')).toHaveClass(/istrazivac/);
  await expect(page.locator('#btn-istrazivac')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('karta')).transform)).not.toBe('none');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows: [
    { korisnik_id: 'x1', lat: 44.89, lon: 16.15, t: new Date().toISOString() },
  ] } })));
  const chip = page.locator('#istrazivac-traka .clan-chip');
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText(/S 1[,.]1 km|S 1,1 km/);
  const box = await chip.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);

  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#ekran-mapa')).not.toHaveClass(/istrazivac/);
  await expect(page.locator('#istrazivac-traka')).toBeHidden();
});

test('Istraživač: karta se okreće dugmadima i prati kompas; strelice članova slijede rotaciju; Sjever gore vraća', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#istrazivac-kontrole')).toBeVisible();
  for (const b of await page.locator('#istrazivac-kontrole button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
  const tr = () => page.evaluate(() => document.getElementById('karta').style.transform);
  await page.locator('#btn-ist-desno').click();
  expect(await tr()).toContain('rotateZ(15deg)');
  await page.locator('#btn-ist-lijevo').click();
  await page.locator('#btn-ist-lijevo').click();
  expect(await tr()).toContain('rotateZ(345deg)');
  await page.locator('#btn-ist-sjever').click();
  expect(await tr()).toContain('rotateZ(0deg)');

  await page.locator('#btn-ist-kompas').click();
  await expect(page.locator('#btn-ist-kompas')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, absolute: true })));
  await expect.poll(tr).toContain('rotateZ(270deg)');

  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#istrazivac-kontrole')).toBeHidden();
  expect(await tr()).toBe('');
});

test('Istraživač pregled: sažetak, lica sa svježinom, najbliži istaknut, nagib kruži i pamti se, HUD smjera, centriraj na mene', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows: [
    { korisnik_id: 'x1', lat: 44.89, lon: 16.15, t: new Date().toISOString() },
    { korisnik_id: 'x2', lat: 44.95, lon: 16.2, t: new Date(Date.now() - 8 * 60000).toISOString() },
  ] } })));
  await expect(page.locator('#ist-sazetak')).toContainText('2 člana · najbliži');
  const chips = page.locator('#istrazivac-traka .clan-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.first()).toHaveAttribute('data-najblizi', '');
  await expect(chips.first()).toHaveAttribute('data-svjezina', 'uzivo');
  await expect(chips.nth(1)).toHaveAttribute('data-svjezina', 'zastarjelo');
  await expect(chips.first().locator('.clan-lice')).toHaveText(/^[A-ZČĆŽŠĐ?]{1,2}$/);

  await expect(page.locator('#btn-ist-nagib-tekst')).toHaveText('40°');
  await page.locator('#btn-ist-nagib').click();
  await expect(page.locator('#btn-ist-nagib-tekst')).toHaveText('55°');
  expect(await page.evaluate(() => document.getElementById('karta').style.transform)).toContain('rotateX(55deg)');
  await page.reload();
  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#btn-ist-nagib-tekst')).toHaveText('55°');
  await page.locator('#btn-ist-desno').click();
  expect(await page.evaluate(() => document.getElementById('karta').style.transform)).toContain('rotateZ(15deg)');
  await expect(page.locator('#ist-hud')).toHaveCount(0);
  await page.locator('#btn-ist-ja').click();
  for (const b of await page.locator('#istrazivac-kontrole button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('Istraživač: kontejner karte je veći (pločice i za okrenuti dio), jedan prst pomjera kartu od pozicije, ◎ vraća na mene', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  const vp = page.viewportSize();
  const box = await page.locator('#karta').boundingBox();
  expect(box.width).toBeGreaterThan(vp.width * 1.8);
  const center = () => page.evaluate(() => { const v = JSON.parse(localStorage.getItem('lovac.pogled') || 'null'); return v ? [v.lat, v.lon] : null; });
  const before = await center();
  await page.mouse.move(180, 400);
  await page.mouse.down();
  await page.mouse.move(180, 300, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => { const a = await center(); return a && before ? Math.abs(a[0] - before[0]) + Math.abs(a[1] - before[1]) : -1; }).toBeGreaterThan(0);
  await expect(page.locator('#btn-ist-ja')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#btn-ist-ja').click();
  // zoom ostaje na ekranu (donji lijevi), a Leaflet kontrole unutar okrenute karte su sakrivene
  await expect(page.locator('#ekran-mapa .leaflet-control-zoom')).toBeHidden();
});

test('Istraživač: Izađi je gore lijevo, nema HUD natpisa; dodir na kolegu pokazuje udaljenost od mene, a trag se uključuje i ostaje', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  const izlaz = page.locator('#btn-ist-izlaz');
  const ib = await izlaz.boundingBox();
  expect(ib.x).toBeLessThan(20);
  expect(ib.y).toBeLessThan(30);
  await expect(page.locator('#ist-hud')).toHaveCount(0);

  const emit = (rows) => page.evaluate((r) => document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows: r } })), rows);
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  await emit([{ lov_id: 'L1', korisnik_id: 'x1', lat: 44.8900, lon: 16.15, t: iso(now - 120000) }]);
  await emit([{ lov_id: 'L1', korisnik_id: 'x1', lat: 44.8920, lon: 16.15, t: iso(now - 60000) }]);
  await emit([{ lov_id: 'L1', korisnik_id: 'x1', lat: 44.8940, lon: 16.15, t: iso(now) }]);
  const chip = page.locator('#istrazivac-traka .clan-chip').first();
  await expect(chip).toBeVisible();
  await expect(page.locator('#istrazivac-detalj')).toBeHidden();
  await chip.click();
  await expect(page.locator('#istrazivac-detalj')).toBeVisible();
  await expect(page.locator('#ist-detalj-udaljenost')).toContainText(/1[,.]6 km S od tebe/);
  await expect(page.locator('#btn-ist-trag')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#btn-ist-trag').click();
  await expect(page.locator('#btn-ist-trag')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#ist-detalj-starost')).toContainText('trag');
  // mrvice su sačuvane lokalno (ostaju i poslije ponovnog učitavanja)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.ist.mrvice') || 'null'));
  expect(saved.by.x1.length).toBeGreaterThanOrEqual(3);
  await page.locator('#btn-ist-detalj-zatvori').click();
  await expect(page.locator('#istrazivac-detalj')).toBeHidden();
  await izlaz.click();
  await expect(page.locator('#ekran-mapa')).not.toHaveClass(/istrazivac/);
});

test('Istraživač: ekran se ne pomjera kad se dodirne dugme (kontrole ostaju na mjestu)', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows: [{ lov_id: 'L1', korisnik_id: 'x1', lat: 44.8825, lon: 16.1525, t: new Date().toISOString() }] } })));
  await page.locator('#istrazivac-traka .clan-chip').first().click();
  await page.locator('#btn-ist-trag').click();
  const pos = await page.evaluate(() => ({ s: [document.getElementById('ekran-mapa').scrollTop, document.getElementById('ekran-mapa').scrollLeft], izlaz: document.getElementById('btn-ist-izlaz').getBoundingClientRect().toJSON() }));
  expect(pos.s).toEqual([0, 0]);
  expect(pos.izlaz.x).toBeLessThan(20);
  expect(pos.izlaz.y).toBeLessThan(30);
});

test('Istraživač: kontrole su stvarno nacrtane iznad okrenute karte (preveliki sloj karte ih je brisao iz slike)', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await page.waitForTimeout(400);
  for (const sel of ['#btn-ist-izlaz', '#btn-ist-desno', '#btn-zoom-in']) {
    const box = await page.locator(sel).boundingBox();
    const clip = { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: box.width + 8, height: box.height + 8 };
    const sa = await page.screenshot({ clip });
    await page.locator(sel).evaluate((e) => { e.style.visibility = 'hidden'; });
    await page.waitForTimeout(150);
    const bez = await page.screenshot({ clip });
    await page.locator(sel).evaluate((e) => { e.style.visibility = ''; });
    expect(sa.equals(bez), `${sel} mora biti nacrtan na ekranu`).toBe(false);
  }
});
