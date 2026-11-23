import { test, expect } from '@playwright/test';
import { makeWorld, startSim, CLANOVA } from './sim-svijet.mjs';

const cachedTrail = (page, lovId) => page.evaluate((lid) => new Promise((res) => {
  const r = indexedDB.open('lovac');
  r.onsuccess = () => { const q = r.result.transaction('arhiva').objectStore('arhiva').get(`trag:${lid}`); q.onsuccess = () => res(q.result?.rows || []); };
}), lovId);

for (const rpc of [true, false]) {
  test(`simulacija 7 sekcija × 10 lovaca: trag kretanja je potpun i preuzima se samo novo (${rpc ? 'funkcija lov_trag' : 'bez migracije 028'})`, async ({ page }) => {
    test.setTimeout(120000);
    const sim = await startSim(page, makeWorld(), { rpc, recv: rpc });
    const lov = sim.db.lovovi[0].id;
    await sim.run(70000);
    await page.evaluate((lid) => document.dispatchEvent(new CustomEvent('lovtrag:trazi', { detail: { lovId: lid, on: true, live: true } })), lov);
    sim.reset();
    const MIN = 10;
    await sim.run(MIN * 60000);
    await page.waitForTimeout(500);
    const rows = (await cachedTrail(page, lov)).map((x) => ({ ...x, t: new Date(x.t).toISOString() }));
    const perUser = new Set(rows.map((r) => r.korisnik_id));
    // server dobija tačke i poslije zadnjeg preuzimanja: poredi se sa stanjem do zadnje preuzete tačke
    const zadnja = Date.parse(rows.at(-1)?.t || 0);
    const naServeru = sim.db.lov_tragovi.filter((r) => r.lov_id === lov && Date.parse(r.t) <= zadnja).length;
    const trag = sim.report(MIN).po.filter(([k]) => /lov_tragovi|lov_trag/.test(k) && k.startsWith('GET') || k.includes('rpc/lov_trag'));
    const tragKb = trag.reduce((a, [, , kb]) => a + kb, 0) / MIN;
    console.log(`trag: ${rows.length}/${naServeru} redova, ${perUser.size} lovaca, ${tragKb.toFixed(0)} KB/min`);
    expect(perUser.size).toBe(CLANOVA);
    expect(rows.length).toBeGreaterThanOrEqual(naServeru - 40);
    expect(zadnja).toBeGreaterThan(sim.now - 60000);
    // trag se ne preuzima ponovo cijeli svakih 30 s (staro: ~1 MB/min)
    expect(tragKb).toBeLessThan(150);
    expect(await page.locator('.uc-marker').count()).toBeGreaterThanOrEqual(CLANOVA - 1);
  });
}
