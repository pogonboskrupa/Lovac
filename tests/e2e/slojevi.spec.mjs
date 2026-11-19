import { test, expect } from '@playwright/test';
import { deflateRawSync } from 'node:zlib';
import { serveTiles, fakeServerConfigUnset } from './helpers.mjs';

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Lovište Grmeč</name>
<Style id="g"><LineStyle><color>ff0000ff</color><width>4</width></LineStyle></Style>
<Placemark><name>Revir Bara</name><styleUrl>#g</styleUrl><Polygon><outerBoundaryIs><LinearRing><coordinates>
16.14,44.87 16.16,44.87 16.16,44.89 16.14,44.89 16.14,44.87</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Lovačka kuća</name><Point><coordinates>16.15,44.88</coordinates></Point></Placemark>
</Document></kml>`;

const GPX = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
<wpt lat="44.88" lon="16.15"><name>Izvor</name></wpt>
<trk><name>Staza</name><trkseg><trkpt lat="44.88" lon="16.15"/><trkpt lat="44.881" lon="16.151"/></trkseg></trk></gpx>`;

function zip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, content] of files) {
    const raw = Buffer.from(content); const data = deflateRawSync(raw); const nb = Buffer.from(name);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(nb.length, 26);
    locals.push(l, nb, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(offset, 42);
    centrals.push(c, nb); offset += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals); const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, e]);
}

function shpLine(points) {
  const content = 4 + 32 + 8 + 4 + points.length * 16;
  const rec = Buffer.alloc(8 + content);
  rec.writeInt32BE(1, 0); rec.writeInt32BE(content / 2, 4); rec.writeInt32LE(3, 8);
  rec.writeInt32LE(1, 44); rec.writeInt32LE(points.length, 48); rec.writeInt32LE(0, 52);
  points.forEach(([x, y], i) => { rec.writeDoubleLE(x, 56 + i * 16); rec.writeDoubleLE(y, 64 + i * 16); });
  const h = Buffer.alloc(100); h.writeInt32BE(9994, 0); h.writeInt32BE((100 + rec.length) / 2, 24); h.writeInt32LE(1000, 28); h.writeInt32LE(3, 32);
  return Buffer.concat([h, rec]);
}

const layers = (page) => page.evaluate(() => new Promise((resolve) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction('slojevi').objectStore('slojevi').getAll(); q.onsuccess = () => resolve(q.result); };
}));

async function openLayers(page) {
  await page.locator('#btn-spiskovi').click();
  await page.locator('#btn-slojevi').click();
  await expect(page.locator('#slojevi')).toBeVisible();
}

test.describe('bez servera', () => {
  test.beforeEach(async ({ page }) => {
    await fakeServerConfigUnset(page);
    await serveTiles(page);
    await page.goto('/');
  });

  test('KML: poligon i tačka, boja iz KML stila, ostaje poslije ponovnog pokretanja', async ({ page }) => {
    await openLayers(page);
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'granica.kml', mimeType: 'application/vnd.google-earth.kml+xml', buffer: Buffer.from(KML) });
    await expect(page.locator('#slojevi-spisak [data-id]')).toHaveCount(1);
    await expect(page.locator('#slojevi-spisak')).toContainText('Lovište Grmeč');
    await expect(page.locator('#slojevi-spisak')).toContainText('2 elemenata');
    await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(2);
  });

  test('stil po sloju; sakriven sloj oslobađa prazan renderer', async ({ page }) => {
    await openLayers(page);
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'g.kml', mimeType: 'text/xml', buffer: Buffer.from(KML) });
    const row = page.locator('#slojevi-spisak [data-id]').first();
    await row.locator('input[data-akcija="boja"]').fill('#00ff00');
    await expect(page.locator('.leaflet-slojevi-pane path').first()).toHaveAttribute('stroke', '#00ff00');
    await row.locator('input[data-akcija="popuna"]').check();
    await expect(page.locator('.leaflet-slojevi-pane path').first()).toHaveAttribute('fill-opacity', '0.18');
    await row.locator('input[data-akcija="vidljiv"]').uncheck();
    await expect(page.locator('.leaflet-slojevi-pane svg')).toHaveCount(0);
    await row.locator('input[data-akcija="vidljiv"]').check();
    await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(2);
  });

  test('GPX i KMZ uvoz', async ({ page }) => {
    await openLayers(page);
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'staza.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(GPX) });
    await expect(page.locator('#slojevi-spisak [data-id]')).toHaveCount(1);
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'granica.kmz', mimeType: 'application/zip', buffer: zip([['doc.kml', KML]]) });
    await expect(page.locator('#slojevi-spisak [data-id]')).toHaveCount(2);
    const names = (await layers(page)).map((l) => l.naziv).sort();
    expect(names).toEqual(['Lovište Grmeč', 'staza']);
  });

  test('SHP u ZIP-u (GK zona 6, sa .prj) se preračunava u WGS84', async ({ page }) => {
    await openLayers(page);
    const prj = 'PROJCS["MGI_Balkans_zone_6",GEOGCS["GCS_MGI"]]';
    const z = zip([['revir.shp', shpLine([[6342176.852, 4963671.602], [6381324.342, 4940596.778]])], ['revir.prj', prj]]);
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'revir.zip', mimeType: 'application/zip', buffer: z });
    await expect(page.locator('#slojevi-spisak [data-id]')).toHaveCount(1);
    const [l] = await layers(page);
    const [lon, lat] = l.geojson.features[0].geometry.coordinates[0];
    expect(Math.abs(lat - 44.8)).toBeLessThan(1e-5);
    expect(Math.abs(lon - 16.0)).toBeLessThan(1e-5);
  });

  test('neispravan fajl daje jasnu poruku', async ({ page }) => {
    await openLayers(page);
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'x.kml', mimeType: 'text/xml', buffer: Buffer.from('<kml><nije') });
    await expect(page.locator('#slojevi-status')).toContainText('Uvoz nije uspio');
    await page.locator('#slojevi-uvoz').setInputFiles({ name: 'x.doc', mimeType: 'application/msword', buffer: Buffer.from('x') });
    await expect(page.locator('#slojevi-status')).toContainText('nije podržan');
  });
});

test('sa servera jednim dodirom (offline poslije), a admin objavljuje društvu', async ({ page }) => {
  await serveTiles(page);
  await page.route('**/static/js/config.js', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/SUPABASE_URL = '[^']*'/, "SUPABASE_URL = 'https://lazni.supabase.test'") });
  });
  await page.route(/lazni\.supabase\.test\/auth\//, () => new Promise(() => {}));
  const posted = [];
  const SRV = { id: '55555555-0000-4000-8000-000000000001', naziv: 'Granica lovišta (društvo)', opis: 'Objavio lovočuvar', verzija: 2, aktivno: true,
    geojson: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[16.1, 44.8], [16.2, 44.9]] }, properties: { name: 'Granica' } }] }, stil: { boja: '#ff0000' } };
  await page.route(/lazni\.supabase\.test\/rest\/v1\/(\w+)/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split('/').pop();
    if (table === 'korisnici') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'a1', ime: 'Ado', prezime: 'A', odobren: true, is_admin: true }]) });
    if (table !== 'slojevi') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (req.method() === 'POST') {
      posted.push(req.postDataJSON());
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ ...req.postDataJSON(), id: '55555555-0000-4000-8000-000000000002', verzija: 1 }]) });
    }
    if (url.searchParams.get('id')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SRV) });
    const { geojson, ...list } = SRV;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([list]) });
  });
  await page.addInitScript(() => {
    localStorage.setItem('lovac.profil', JSON.stringify({ id: 'a1', ime: 'Ado', prezime: 'A', odobren: true, is_admin: true }));
    localStorage.setItem('sb-lazni-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'a1', aud: 'authenticated', role: 'authenticated' } }));
  });
  await page.goto('/');
  await openLayers(page);
  await page.locator('#btn-slojevi-server').click();
  await expect(page.locator('#slojevi-server [data-server]')).toHaveCount(1);
  await page.locator('#slojevi-server [data-akcija="preuzmi"]').click();
  await expect(page.locator('#slojevi-server [data-akcija="preuzmi"]')).toHaveText('Preuzeto');
  await expect(page.locator('#slojevi-spisak')).toContainText('sa servera, verzija 2');

  await page.route(/lazni\.supabase\.test\/rest/, () => new Promise(() => {}));
  await page.reload();
  await expect(page.locator('.leaflet-slojevi-pane path')).toHaveCount(1);

  await page.unroute(/lazni\.supabase\.test\/rest/);
  await openLayers(page);
  await page.locator('#slojevi-uvoz').setInputFiles({ name: 'novo.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(GPX) });
  await page.locator('#slojevi-spisak [data-akcija="objavi"]').click();
  await expect.poll(() => posted.length).toBe(1);
  expect(posted[0].naziv).toBe('novo');
  expect(posted[0].geojson.features.length).toBe(2);
  await expect(page.locator('#slojevi-spisak [data-akcija="objavi"]')).toHaveCount(0);
});
