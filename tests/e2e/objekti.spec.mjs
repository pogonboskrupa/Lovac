import { test, expect } from '@playwright/test';
import { serveTiles, fakeServerConfigUnset, PNG } from './helpers.mjs';

const allObjects = (page) => page.evaluate(() => new Promise((resolve, reject) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => {
    const req = r.result.transaction('objekti').objectStore('objekti').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  };
  r.onerror = () => reject(r.error);
}));

const countPhotos = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => {
    const req = r.result.transaction('fotografije').objectStore('fotografije').count();
    req.onsuccess = () => resolve(req.result);
  };
}));

test.beforeEach(async ({ page }) => {
  await fakeServerConfigUnset(page);
  await serveTiles(page);
  // objekti se crtaju tek do 1:50 000 (zadani pogled z11 je cijelo lovište)
  await page.addInitScript(() => localStorage.setItem('lovac.pogled', JSON.stringify({ lat: 44.88, lon: 16.15, z: 15 })));
});

async function addObject(page, { vrsta = 'hraniliste', naziv = '', stanje = 'ispravno' } = {}) {
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await expect(page.locator('#objekt-forma')).toBeVisible();
  await page.locator(`#objekt-vrste [data-kod="${vrsta}"]`).click();
  if (naziv) await page.fill('#forma-objekt input[name=naziv]', naziv);
  await page.locator(`#objekt-stanje [data-stanje="${stanje}"]`).click();
  await page.locator('#forma-objekt button[type=submit]').click();
  await expect(page.locator('#objekt-forma')).toBeHidden();
}

test('nov objekat na nišanu karte: marker, privatno, klijentski UUID', async ({ page }) => {
  await page.goto('/');
  await addObject(page, { vrsta: 'ceka_visoka', naziv: 'Čeka kod bukve', stanje: 'popravka' });
  await expect(page.locator('.obj-ikona[data-vrsta="ceka_visoka"]')).toHaveCount(1);
  await expect(page.locator('.obj-ikona')).toHaveAttribute('data-stanje', 'popravka');
  const [o] = await allObjects(page);
  expect(o).toMatchObject({ naziv: 'Čeka kod bukve', vrsta: 'ceka_visoka', stanje: 'popravka', vidljivost: 'privatno', rev: 1 });
  expect(o.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(Math.abs(o.lat - 44.88)).toBeLessThan(0.001);
  expect(Math.abs(o.lon - 16.15)).toBeLessThan(0.001);
});

test('bez naziva objekat dobija naziv vrste; ostaje poslije ponovnog pokretanja (offline)', async ({ page }) => {
  await page.goto('/');
  await addObject(page, { vrsta: 'soliste' });
  await page.reload();
  await expect(page.locator('.obj-ikona[data-vrsta="soliste"]')).toHaveCount(1);
  expect((await allObjects(page))[0].naziv).toBe('Solište');
});

test('detalji: Obiđeno danas upisuje datum i podiže rev; izmjena stanja', async ({ page }) => {
  await page.goto('/');
  await addObject(page, { vrsta: 'hraniliste', naziv: 'Bara' });
  await page.locator('.obj-ikona').click();
  await expect(page.locator('#objekt-detalj')).toBeVisible();
  await expect(page.locator('#od-naziv')).toHaveText('Bara');
  await page.locator('#btn-od-obidjeno').click();
  await expect.poll(async () => (await allObjects(page))[0].rev).toBe(2);
  await page.locator('#btn-od-uredi').click();
  await page.locator('#objekt-stanje [data-stanje="sruseno"]').click();
  await page.locator('#forma-objekt button[type=submit]').click();
  await expect(page.locator('.obj-ikona')).toHaveAttribute('data-stanje', 'sruseno');
  expect((await allObjects(page))[0].rev).toBe(3);
});

test('spisak "treba popravka" daje samo objekte za obilazak, redovi nose data-id', async ({ page }) => {
  await page.goto('/');
  await addObject(page, { naziv: 'Dobra', stanje: 'ispravno' });
  await addObject(page, { naziv: 'Pokvarena', stanje: 'popravka' });
  await addObject(page, { naziv: 'Pala', stanje: 'sruseno' });
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-objekti').click();
  await expect(page.locator('#objekti-spisak [data-id]')).toHaveCount(3);
  await page.locator('#objekti-filter [data-filter="popravka"]').click();
  await expect(page.locator('#objekti-spisak [data-id]')).toHaveCount(2);
  await expect(page.locator('#objekti-spisak')).not.toContainText('Dobra');
  const ids = await page.locator('#objekti-spisak [data-id]').evaluateAll((els) => els.map((e) => e.dataset.id));
  const stored = (await allObjects(page)).map((o) => o.id);
  ids.forEach((id) => expect(stored).toContain(id));
  await page.locator('#objekti-spisak [data-id]').first().click();
  await expect(page.locator('#objekti')).toBeHidden();
  await expect(page.locator('#objekt-detalj')).toBeVisible();
});

test('fotografija: dodaje se u formi, čuva u IndexedDB, prikazuje u detaljima', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await page.locator('#objekt-foto-input').setInputFiles({ name: 'cek.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#objekt-foto img')).toHaveCount(1);
  await page.locator('#forma-objekt button[type=submit]').click();
  expect(await countPhotos(page)).toBe(1);
  await page.locator('.obj-ikona').click();
  await expect(page.locator('#od-foto img')).toHaveCount(1);
});

test('odustajanje od forme briše nove slike (ne ostaju siročad u bazi)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await page.locator('#objekt-foto-input').setInputFiles({ name: 'cek.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('#objekt-foto img')).toHaveCount(1);
  await page.locator('#btn-objekt-odustani').click();
  await expect.poll(() => countPhotos(page)).toBe(0);
});

test('Vodi me do: udaljenost i pravac iz GPS-a, smanjuje se kad se približiš', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.885, longitude: 16.15, accuracy: 5 });
  await page.goto('/');
  await addObject(page, { naziv: 'Cilj' });
  await page.locator('.obj-ikona').click();
  await page.locator('#btn-od-vodi').click();
  await expect(page.locator('#navigacija')).toBeVisible();
  await expect(page.locator('#nav-cilj')).toHaveText('Cilj');
  await expect(page.locator('#nav-udaljenost')).toHaveText(/^5\d\d m$/);
  await expect(page.locator('#nav-smjer')).toHaveText(/^J 1(79|80|81)°$/);
  await expect(page.locator('#nav-eta')).toHaveText(/^≈ 1\d min hoda$/);
  const [o] = await allObjects(page);
  await context.setGeolocation({ latitude: o.lat + 0.002, longitude: o.lon, accuracy: 5 });
  await expect(page.locator('#nav-trend')).toHaveText('Približavaš se');
  await expect(page.locator('#navigacija')).toHaveAttribute('data-stanje', 'daleko');
  await page.locator('#btn-nav-karta').click();
  await expect(page.locator('#navigacija')).toBeVisible();
  await context.setGeolocation({ latitude: o.lat + 0.00005, longitude: o.lon, accuracy: 5 });
  await expect(page.locator('#nav-udaljenost')).toHaveText('Stigao si');
  await expect(page.locator('#navigacija')).toHaveAttribute('data-stanje', 'stigao');
  await page.locator('#btn-nav-kraj').click();
  await expect(page.locator('#navigacija')).toBeHidden();
});

test('brisanje objekta traži drugi dodir; Nazad zatvara formu', async ({ page }) => {
  await page.goto('/');
  await addObject(page, { naziv: 'Za brisanje' });
  await page.locator('.obj-ikona').click();
  await page.locator('#btn-od-obrisi').click();
  await expect(page.locator('.obj-ikona')).toHaveCount(1);
  await page.locator('#btn-od-obrisi').click();
  await expect(page.locator('.obj-ikona')).toHaveCount(0);

  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  expect(await page.evaluate(() => window.__nazad())).toBe(true);
  await expect(page.locator('#objekt-forma')).toBeHidden();
});

test('dodirne mete objekata ≥ 44 px, polja ≥ 48 px', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-dodaj').click();
  let b = await page.locator('#btn-dodaj-objekat').boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(44);
  await page.locator('#btn-dodaj-objekat').click();
  for (const sel of ['#objekt-vrste [data-kod]', '#objekt-stanje [data-stanje]', '#objekt-forma .dugme-fajl', '#btn-objekt-nisan', '#btn-objekt-moja-lokacija']) {
    b = await page.locator(sel).first().boundingBox();
    expect(Math.min(b.width, b.height), sel).toBeGreaterThanOrEqual(44);
  }
  for (const sel of ['input[name=naziv]', 'input[name=zadnji_obilazak]', 'textarea[name=napomena]']) {
    b = await page.locator(`#forma-objekt ${sel}`).boundingBox();
    expect(b.height, sel).toBeGreaterThanOrEqual(48);
  }
});

async function seedRole(page, grupovodja) {
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'u1', ime: 'Goran', prezime: 'Grupovođa', odobren: true, is_admin: false }));
  });
  await page.goto('/');
  await page.evaluate((gv) => new Promise((resolve) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const tx = r.result.transaction('spiskovi', 'readwrite');
      tx.objectStore('spiskovi').put({ id: 'sekcije', rows: {
        reviri: [{ id: 'R1', naziv: 'Krupa' }],
        sekcije: [{ id: 'S1', naziv: 'Krupa 1', revir_id: 'R1', grupovodja_id: gv ? 'u1' : 'drugi' }],
        clanovi: [], grupovodje: [], lovocuvari: [],
      } });
      tx.oncomplete = resolve;
    };
  }), grupovodja);
  await page.reload();
}

test('zvanični objekat: grupovođa ga označi (društvo, zlatna oznaka), lovac nema izbor', async ({ page }) => {
  await seedRole(page, true);
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await expect(page.locator('#objekt-zvanicni-blok')).toBeVisible();
  await page.locator('#objekt-vrste [data-kod="ceka_visoka"]').click();
  await page.fill('#forma-objekt input[name=naziv]', 'Čeka društva');
  await page.locator('#objekt-zvanicni-blok input').check();
  await page.locator('#forma-objekt button[type=submit]').click();
  await expect(page.locator('#objekt-forma')).toBeHidden();
  const [o] = await allObjects(page);
  expect(o).toMatchObject({ zvanicni: true, vidljivost: 'drustvo' });
  await expect(page.locator('.obj-ikona[data-zvanicni="true"] .obj-zvjezdica')).toHaveCount(1);
  await page.locator('.obj-ikona').click();
  await expect(page.locator('#od-vlasnik')).toContainText('Zvanični objekat društva');
});

test('zvanični objekat: običan lovac ne vidi izbor i objekat ostaje privatan', async ({ page }) => {
  await seedRole(page, false);
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-dodaj-objekat').click();
  await expect(page.locator('#objekt-forma')).toBeVisible();
  await expect(page.locator('#objekt-zvanicni-blok')).toBeHidden();
  await page.locator('#forma-objekt button[type=submit]').click();
  const [o] = await allObjects(page);
  expect(o.zvanicni).toBeFalsy();
  expect(o.vidljivost).toBe('privatno');
  await expect(page.locator('.obj-ikona[data-zvanicni="true"]')).toHaveCount(0);
});

test('objekti su manji i ne vide se na razmjeri većoj od 1:50 000', async ({ page }) => {
  await page.goto('/');
  await addObject(page, { vrsta: 'hraniliste', naziv: 'Bara' });
  const ikona = page.locator('.obj-ikona');
  await expect(ikona).toHaveCount(1);
  const box = await ikona.boundingBox();
  expect(box.width).toBeLessThanOrEqual(32);
  await page.evaluate(() => window.__karta.setZoom(12, { animate: false }));
  await expect(ikona).toHaveCount(0);
  await page.evaluate(() => window.__karta.setZoom(13, { animate: false }));
  await expect(ikona).toHaveCount(1);
  await page.evaluate(() => window.__karta.setZoom(16, { animate: false }));
  await expect(ikona).toHaveCount(1);
});
