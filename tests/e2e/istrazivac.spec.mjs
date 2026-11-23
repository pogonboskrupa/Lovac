import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, lok, twoFingers } from './helpers.mjs';

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
  await twoFingers(page, { rotate: 30 });
  expect(await tr()).toContain('rotateZ(30deg)');
  await twoFingers(page, { rotate: -45 });
  expect(await tr()).toContain('rotateZ(345deg)');
  await page.locator('#ist-n').click();
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
  await twoFingers(page, { rotate: 15 });
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
  for (const sel of ['#btn-ist-izlaz', '#btn-ist-kompas', '#btn-zoom-in']) {
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

test('Istraživač dizajn: kompas sa sjeverom prati rotaciju, horizont je nebo, panel podloga je iznad kontrola', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#ist-n')).toBeVisible();
  const rot = () => page.locator('#ist-n-strelica').getAttribute('transform');
  expect(await rot()).toBe('rotate(0)');
  await twoFingers(page, { rotate: 30 });
  expect(await rot()).toBe('rotate(30)');
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('ekran-mapa')).backgroundImage)).toContain('linear-gradient');
  await expect(page.locator('#istrazivac-traka')).toContainText('Nema kolega koji dijele lokaciju');

  // panel podloga se otvara iznad kontrola (ne ispod njih)
  await page.locator('#btn-podloga').click();
  await expect(page.locator('#meni-podloga')).toBeVisible();
  const pb = await page.locator('#meni-podloga').boundingBox();
  const kb = await page.locator('#btn-ist-kompas').boundingBox();
  const cx = Math.min(kb.x + kb.width / 2, pb.x + pb.width - 5);
  const cy = Math.max(kb.y + kb.height / 2, pb.y + 5);
  const gore = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.closest('#meni-podloga') ? 'panel' : e.id || e.className); }, [cx, cy]);
  if (pb.y + pb.height > kb.y && pb.x + pb.width > kb.x) expect(gore).toBe('panel');
});


test('Istraživač: X uz tipku lokacije izlazi iz 3D, nema tipki lijevo/desno ni S; niže "Izađi iz 3D"; zum sa dva prsta', async ({ page }) => {
  await serveTiles(page);
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  for (const id of ['#btn-ist-lijevo', '#btn-ist-desno', '#btn-ist-sjever']) expect(await page.locator(id).count(), id).toBe(0);
  expect((await page.locator('#btn-ist-izlaz').boundingBox()).height).toBeLessThanOrEqual(40);
  const ja = await page.locator('#btn-ist-ja').boundingBox();
  const x = await page.locator('#btn-ist-x').boundingBox();
  expect(x.x).toBeGreaterThan(ja.x + ja.width - 2);
  expect(Math.abs(x.y - ja.y)).toBeLessThan(4);
  expect(x.height).toBeGreaterThanOrEqual(44);

  // zum: razmak prstiju se udvostruči = bar jedan nivo bliže
  const z = () => page.evaluate(() => JSON.parse(localStorage.getItem('lovac.pogled') || 'null')?.z ?? null);
  const z0 = await z();
  await twoFingers(page, { scale: 2.4 });
  await expect.poll(z).toBeGreaterThan(z0 ?? 0);
  const z1 = await z();
  await twoFingers(page, { scale: 0.4 });
  await expect.poll(z).toBeLessThan(z1);

  await page.locator('#btn-ist-x').click();
  await expect(page.locator('#ekran-mapa')).not.toHaveClass(/istrazivac/);
});

test('Istraživač: okrenuta i strmo nagnuta karta pokriva cijeli ekran (bez crnih ivica sa strane)', async ({ page }) => {
  await serveTiles(page);
  await page.addInitScript(() => localStorage.setItem('lovac.ist.nagib', JSON.stringify('strm')));
  await page.goto('/');
  await lok(page, '#btn-istrazivac');
  await expect(page.locator('#btn-ist-nagib-tekst')).toHaveText('55°');
  const vp = page.viewportSize();
  for (const angle of [35, 55]) {
    await twoFingers(page, { rotate: angle, cx: vp.width / 2, cy: vp.height / 2 });
    // tačke na rubu ekrana (ispod magle horizonta) moraju pogoditi ravan karte, ne pozadinu ekrana
    const misses = await page.evaluate(() => {
      const r = document.getElementById('ekran-mapa').getBoundingClientRect();
      const w = r.width; const h = r.bottom; const karta = document.getElementById('karta');
      const fog = document.getElementById('ist-magla');
      const top = fog && !fog.hidden ? fog.getBoundingClientRect().height + 2 : 2;
      const pts = [];
      for (let i = 0; i <= 6; i++) {
        const y = top + ((h - 2 - top) * i) / 6;
        pts.push([1, y], [w - 2, y]);
        const x = 1 + ((w - 3) * i) / 6;
        pts.push([x, top], [x, h - 2]);
      }
      const sakrij = [...document.querySelectorAll('#ekran-mapa > *:not(#karta), .navigacija-donja, nav')];
      const prije = sakrij.map((el) => el.style.visibility);
      sakrij.forEach((el) => { el.style.visibility = 'hidden'; });
      const out = pts.map(([x, y]) => [x, y, document.elementFromPoint(x, y)]).filter(([, , el]) => !karta.contains(el));
      sakrij.forEach((el, i) => { el.style.visibility = prije[i]; });
      return out.map(([x, y, el]) => `${Math.round(x)},${Math.round(y)} ${el?.id || el?.tagName}`);
    });
    expect(misses, `okret +${angle}°`).toEqual([]);
  }
});
