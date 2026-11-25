import { test, expect } from '@playwright/test';
import { startSim, makeWorld } from './sim-svijet.mjs';

// Odstrel u lovu nosi lokaciju pogotka (migracija 043); server bez migracije ne smije zadržati odstrel u redu.
const upisi = (page, extra = {}) => page.evaluate((x) => document.dispatchEvent(new CustomEvent('odstrel:upisan', {
  detail: { id: '00000000-0000-4000-8000-0000000d0001', vrsta: 'divlja_svinja', kategorija: 'vepar', vrijeme: Date.now(), tezina: 80, uLov: true, lat: 44.8851, lon: 16.1543, ...x },
})), extra);

test('odstrel upisan u lovu se šalje sa lokacijom pogotka i stanom', async ({ page }) => {
  const sim = await startSim(page, makeWorld({ uToku: true }));
  await sim.run(90000);
  await upisi(page);
  await sim.run(20000);
  const red = sim.db.lov_odstrel?.find((o) => o.vrsta === 'divlja_svinja');
  expect(red).toBeTruthy();
  expect(red.lat).toBeCloseTo(44.8851, 4);
  expect(red.lon).toBeCloseTo(16.1543, 4);
});

test('odstrel bez lokacije (nema GPS-a) se šalje bez lat/lon, ne sa praznim vrijednostima', async ({ page }) => {
  const sim = await startSim(page, makeWorld({ uToku: true }));
  await sim.run(90000);
  await upisi(page, { lat: undefined, lon: undefined, id: '00000000-0000-4000-8000-0000000d0002' });
  await sim.run(20000);
  const red = sim.db.lov_odstrel.find((o) => o.id === '00000000-0000-4000-8000-0000000d0002');
  expect(red).toBeTruthy();
  expect('lat' in red).toBe(false);
});

test('server bez migracije 043 (nema kolone lat): odstrel ipak stiže, bez lokacije, i ne ostaje u redu', async ({ page }) => {
  const sim = await startSim(page, makeWorld({ uToku: true }));
  await page.route(/lazni\.supabase\.test\/rest\/v1\/lov_odstrel/, (route) => {
    const req = route.request();
    if (req.method() === 'POST' && /"lat"/.test(req.postData() || '')) {
      return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'lat' column of 'lov_odstrel' in the schema cache" }) });
    }
    return route.fallback();
  });
  await sim.run(90000);
  await upisi(page, { id: '00000000-0000-4000-8000-0000000d0003' });
  await sim.run(20000);
  const red = sim.db.lov_odstrel.find((o) => o.id === '00000000-0000-4000-8000-0000000d0003');
  expect(red).toBeTruthy();
  expect('lat' in red).toBe(false);
  // red slanja je prazan: ponovno slanje ništa ne dodaje
  const prije = sim.db.lov_odstrel.length;
  await sim.run(60000);
  expect(sim.db.lov_odstrel.length).toBe(prije);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('lovac.lov_odstrel.red') || '[]').length)).toBe(0);
});
