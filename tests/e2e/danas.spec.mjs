import { test, expect } from '@playwright/test';
import { serveTiles, lok } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Sarajevo' });

const LOVOSTAJ = [
  { id: 'l1', vrsta_kod: 'srna', kategorija_kod: 'srndac', otvoreno_od: '05-01', otvoreno_do: '09-30', izvor: 'Odluka društva 2026', aktivno: true },
  { id: 'l2', vrsta_kod: 'srna', kategorija_kod: 'srna', otvoreno_od: '09-01', otvoreno_do: '12-31', izvor: 'Odluka društva 2026', aktivno: true },
  { id: 'l3', vrsta_kod: 'zec', kategorija_kod: null, otvoreno_od: '10-01', otvoreno_do: '12-31', aktivno: true },
  { id: 'l4', vrsta_kod: 'fazan', kategorija_kod: null, otvoreno_od: '01-15', otvoreno_do: '02-28', aktivno: true },
];
const LOVNO = [{ id: 'v1', vrsta_kod: null, prije_izlaska_min: 60, poslije_zalaska_min: 60, aktivno: true }];

async function setup(page, { hang = false, admin = false } = {}) {
  await serveTiles(page);
  await page.clock.setFixedTime(new Date('2026-11-19T10:00:00+01:00'));
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    const src = (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'");
    await route.fulfill({ response: res, body: src });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  const sent = [];
  await page.route(/lazni\.supabase\.test\/rest\/v1\/(\w+)/, async (route) => {
    if (hang) return new Promise(() => {});
    const table = /rest\/v1\/(\w+)/.exec(route.request().url())[1];
    if (route.request().method() !== 'GET') {
      sent.push({ table, method: route.request().method(), body: route.request().postDataJSON(), url: route.request().url() });
      return route.fulfill({ status: 201, body: '' });
    }
    const me = { id: 'a1', ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: admin };
    const data = { lovostaj: LOVOSTAJ, lovno_vrijeme: LOVNO, korisnici: [me] }[table] ?? [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.addInitScript((isAdmin) => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'a1', ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: isAdmin }));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({
      access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'a1', aud: 'authenticated', role: 'authenticated' },
    }));
  }, admin);
  return sent;
}

test('Danas: svjetlo, lovno vrijeme po admin pravilu, šta se smije loviti; radi i offline iz keša', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('#lovno-chip')).toHaveText(/^Lovno vrijeme završava za \d+ h \d+ min$/);
  await expect(page.locator('#lovno-chip')).toHaveAttribute('data-stanje', 'traje');
  await page.locator('#lovno-chip').click();
  await expect(page.locator('#danas')).toBeVisible();
  await expect(page.locator('#danas-svjetlo')).toContainText('Izlazak sunca');
  await expect(page.locator('#danas-svjetlo')).toContainText(/06:5\d|07:0\d/);
  await expect(page.locator('#danas-lovno')).toContainText('60 min prije izlaska');
  // luk svjetla: tri boje, četiri vremena i tačka "sada" (10:00 je usred dana)
  await expect(page.locator('#danas-luk .luk-zora')).toHaveCount(1);
  await expect(page.locator('#danas-luk .luk-dan')).toHaveCount(1);
  await expect(page.locator('#danas-luk .luk-sumrak')).toHaveCount(1);
  await expect(page.locator('#danas-luk .luk-vrijeme')).toHaveCount(5);
  await expect(page.locator('#danas-luk .luk-podne')).toHaveCount(1);
  await expect(page.locator('#danas-luk .luk-naziv').nth(2)).toHaveText('Podne');
  await expect(page.locator('#danas-luk .luk-sada')).toHaveCount(1);
  await expect(page.locator('#danas-luk .luk-sada-tekst')).toHaveText('Sada 10:00');
  await expect(page.locator('#danas-luk-kartica')).toHaveAttribute('data-stanje', 'dan');
  await expect(page.locator('#danas-luk-stanje')).toContainText('Svjetlo do');
  expect(await page.locator('#danas').innerText()).not.toMatch(/građansk/i);
  const row = (kod) => page.locator(`#danas-lovostaj [data-id="${kod}"]`);
  await expect(row('srna')).toHaveAttribute('data-stanje', 'otvoreno');
  await expect(row('srna')).toContainText('samo: Srna');
  await expect(row('zec')).toContainText('Otvoreno do 31.12.');
  await expect(row('fazan')).toContainText('Lovostaj — otvara se 15.1.');
  await expect(row('medvjed')).toContainText('Nije uneseno');
  await expect(page.locator('#danas-izvor')).toContainText('Odluka društva 2026');
});

test('bez pravila od admina nema izmišljenog lovnog vremena', async ({ page }) => {
  await setup(page, { hang: true });
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-danas').click();
  await expect(page.locator('#danas-lovno')).toHaveText('Pravilo lovnog vremena još nije unio administrator.');
  await expect(page.locator('#lovno-chip')).toBeHidden();
});

test('keširani propisi rade offline poslije ponovnog pokretanja', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('#lovno-chip')).toBeVisible();
  await page.unroute(/lazni\.supabase\.test\/rest\/v1\/(\w+)/);
  await page.route(/lazni\.supabase\.test\/rest/, () => new Promise(() => {}));
  await page.reload();
  await expect(page.locator('#lovno-chip')).toHaveText(/završava za/);
});

test('opažanje vrste u lovostaju pokazuje upozorenje', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('#lovno-chip')).toBeVisible();
  await lok(page, '#btn-opazanje');
  await page.locator('#op-vrste [data-kod="fazan"]').click();
  await expect(page.locator('#op-upozorenje')).toBeVisible();
  await expect(page.locator('#op-upozorenje')).toContainText('lovostaju (otvara se 15.1.)');
  await page.locator('#op-vrste [data-kod="zec"]').click();
  await expect(page.locator('#op-upozorenje')).toBeHidden();
  await page.locator('#op-vrste [data-kod="srna"]').click();
  await page.locator('#op-kategorija [data-kat="srndac"]').click();
  await expect(page.locator('#op-upozorenje')).toContainText('otvara se 1.5.');
});

test('admin unosi lovostaj: datum dd.mm. ide na server kao MM-DD', async ({ page }) => {
  const sent = await setup(page, { admin: true });
  await page.goto('/');
  await page.locator('#btn-postavke').click();
  await page.locator('#btn-propisi').click();
  await expect(page.locator('#propisi-spisak [data-id]')).toHaveCount(4);
  await page.locator('#btn-propisi-dodaj').click();
  await page.locator('#propisi-forma select[name=vrsta_kod]').selectOption('divlja_svinja');
  await page.locator('#propisi-forma select[name=kategorija_kod]').selectOption('vepar');
  await page.fill('#propisi-forma input[name=otvoreno_od]', '1.4.');
  await page.fill('#propisi-forma input[name=otvoreno_do]', '31.1.');
  await page.fill('#propisi-forma input[name=izvor]', 'Test odluka');
  await page.locator('#propisi-forma button[type=submit]').click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({
    table: 'lovostaj', method: 'POST',
    body: { vrsta_kod: 'divlja_svinja', kategorija_kod: 'vepar', otvoreno_od: '04-01', otvoreno_do: '01-31', izvor: 'Test odluka', aktivno: true },
  });
  expect(sent[0].body).not.toHaveProperty('promijenio');

  await page.locator('#propisi-tabovi [data-tab="lovno_vrijeme"]').click();
  await page.locator('#propisi-spisak [data-akcija="uredi"]').first().click();
  await page.fill('#propisi-forma input[name=poslije_zalaska_min]', '45');
  await page.locator('#propisi-forma button[type=submit]').click();
  await expect.poll(() => sent.length).toBe(2);
  expect(sent[1]).toMatchObject({ table: 'lovno_vrijeme', method: 'PATCH', body: { poslije_zalaska_min: 45 } });
  expect(sent[1].url).toContain('id=eq.v1');
});

test('Danas: tab Vrijeme i vjetar — temperatura, smjer vjetra (kompas), sati; bez veze nema izmišljene prognoze', async ({ page }) => {
  await setup(page);
  const d0 = Date.parse('2026-11-19T00:00:00+01:00') / 1000;
  const time = Array.from({ length: 72 }, (_, i) => d0 + i * 3600);
  await page.route(/api\.open-meteo\.com/, (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ hourly: {
      time, wind_speed_10m: time.map(() => 4.2), wind_direction_10m: time.map(() => 225), wind_gusts_10m: time.map(() => 7),
      temperature_2m: time.map((_, i) => i % 24), precipitation: time.map(() => 0), cloud_cover: time.map(() => 50), weather_code: time.map(() => 2),
    } }),
  }));
  await page.goto('/');
  await page.locator('#lovno-chip').waitFor({ state: 'hidden' }).catch(() => {});
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-danas').click();
  await expect(page.locator('#danas-tab-vrijeme')).toBeHidden();
  await page.locator('#danas-tabovi [data-tab="vrijeme"]').click();
  await expect(page.locator('#danas-tab-svjetlo')).toBeHidden();
  await expect(page.locator('#vr-temp')).toHaveText('10°');
  await expect(page.locator('#vr-opis')).toHaveText('Djelimično oblačno');
  await expect(page.locator('#vr-vjetar')).toContainText('Vjetar iz JZ');
  await expect(page.locator('#vr-vjetar')).toContainText('prema SI');
  await expect(page.locator('#vr-vjetar')).toContainText('umjeren vjetar');
  // strelica kompasa pokazuje kuda vjetar puše: iz 225° → 45°
  await expect(page.locator('#vr-kompas .kompas-strelica')).toHaveAttribute('transform', 'rotate(45 80 80)');
  await expect(page.locator('#vr-sati .vr-sat.sada')).toContainText('10:00');
  await expect(page.locator('#vr-sati .vr-sat').first()).toContainText('10:00');
  await expect(page.locator('#vr-stanje')).toContainText('prognoza preuzeta');
});

test('Danas: bez prognoze (nema veze) tab Vrijeme to kaže, bez izmišljenih brojeva', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-danas').click();
  await page.locator('#danas-tabovi [data-tab="vrijeme"]').click();
  await expect(page.locator('#vr-stanje')).toContainText('Prognoza nije dostupna');
  await expect(page.locator('#vr-temp')).toHaveText('—');
  await expect(page.locator('#vr-sati .vr-sat')).toHaveCount(0);
});
