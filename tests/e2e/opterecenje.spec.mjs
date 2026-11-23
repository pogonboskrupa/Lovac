// Budžet za besplatni server: koliko zahtjeva i prometa pravi JEDAN telefon za 10 min rada.
// Društvo: 7 sekcija × 10 lovaca, 30 ranijih lovova po sekciji, 400 poruka po sekciji.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim, ID } from './sim-svijet.mjs';

const MIN = 10;
const idbAll = (page, store) => page.evaluate((s) => new Promise((res) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result || []); };
}), store);

async function measure(page, world, opts) {
  const sim = await startSim(page, world, opts);
  await sim.run(90000); // prvo pokretanje (jednokratno preuzimanje keša) se ne broji
  sim.reset();
  await sim.run(MIN * 60000);
  const r = sim.report(MIN);
  console.log(`${opts.naziv}: ${r.zahtjevaMin.toFixed(1)} zahtjeva/min, ${r.kbMin.toFixed(0)} KB/min`);
  console.log(r.po.slice(0, 12).map(([k, c, kb]) => `  ${k}: ${c} zaht., ${kb} KB`).join('\n'));
  return { sim, r };
}

for (const recv of [true, false]) {
  test(`opterećenje u lovu: zahtjevi i promet po telefonu u budžetu (${recv ? 'migracije 028/029' : 'bez migracija'})`, async ({ page }) => {
    test.setTimeout(180000);
    const { sim, r } = await measure(page, makeWorld({ historija: 30, poruka: 400, dogadjaja: 60 }), { rpc: recv, recv, naziv: `u lovu${recv ? '' : ' (bez migracija)'}` });
    expect(r.zahtjevaMin).toBeLessThan(40);
    expect(r.kbMin).toBeLessThan(recv ? 60 : 120);
    // raniji lovovi se ne preuzimaju ponovo (ranije 2–3 zahtjeva po svakom lovu, pri svakom osvježavanju)
    const ucesnici = r.po.find(([k]) => k === 'GET lov_ucesnici')?.[1] || 0;
    expect(ucesnici).toBeLessThanOrEqual(MIN * 2);

    // nova poruka kolege (poslije 400 starih) stiže na telefon
    const sid = sim.db.sekcije[0].id;
    sim.db.poruke.push({ id: ID(799999), kanal: 'sekcija', sekcija_id: sid, autor_id: sim.db.korisnici[3].id, lov_id: null,
      tekst: 'Nova poruka poslije 400 starih', created_at: new Date(sim.now).toISOString(), ...(recv ? { primljeno: new Date(sim.now).toISOString() } : {}) });
    await sim.run(70000);
    await expect.poll(async () => (await idbAll(page, 'poruke')).some((m) => m.id === ID(799999)), { timeout: 10000 }).toBe(true);
  });
}

test('opterećenje u mirovanju (nema lova u toku): mali broj zahtjeva', async ({ page }) => {
  test.setTimeout(180000);
  const { r } = await measure(page, makeWorld({ uToku: false, historija: 30, poruka: 400 }), { rpc: true, recv: true, naziv: 'mirovanje' });
  expect(r.zahtjevaMin).toBeLessThan(15);
  expect(r.kbMin).toBeLessThan(25);
});

test('raspored lova: keširani brojevi telefona (SMS za SOS/PREKID) ostaju poslije osvježavanja lovova', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, makeWorld(), { rpc: true, recv: true });
  await sim.run(20000);
  const lov = sim.db.lovovi[0].id;
  await page.evaluate((lid) => new Promise((res) => {
    const r = indexedDB.open('lovac');
    r.onsuccess = () => {
      const st = r.result.transaction('lovovi', 'readwrite').objectStore('lovovi');
      const g = st.get(lid);
      g.onsuccess = () => { st.put({ ...g.result, telefoni: [{ korisnik_id: 'x', telefon: '061000000' }] }); st.transaction.oncomplete = res; };
    };
  }), lov);
  await sim.run(130000); // osvježavanje lovova (svakih 60 s)
  const rec = (await idbAll(page, 'lovovi')).find((x) => x.id === lov);
  expect(rec.telefoni).toEqual([{ korisnik_id: 'x', telefon: '061000000' }]);
});
