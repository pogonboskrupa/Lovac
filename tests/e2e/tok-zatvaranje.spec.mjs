// Tok lova na velikom lovu: ekran se prelista do dna, a zatvaranje (× gore i "Zatvori" dole) je uvijek dostupno.
import { test, expect } from '@playwright/test';
import { makeWorld, startSim } from './sim-svijet.mjs';

test.use({ viewport: { width: 380, height: 700 } });

test('Tok lova: × ostaje vidljiv pri listanju, "Zatvori tok lova" na dnu zatvara, učesnici sažeti po stanju', async ({ page }) => {
  test.setTimeout(120000);
  const sim = await startSim(page, makeWorld({ uToku: true, dogadjaja: 30 }), { rpc: true, recv: true });
  await sim.run(80000);
  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-lov-danas').click();
  await page.locator('#ld-sadrzaj [data-akcija="tok"]').click();
  const ekran = page.locator('#tok-ekran');
  await expect(ekran).toBeVisible();
  await expect(page.locator('#tok-ucesnici-broj')).toContainText('na stanu');
  await expect(page.locator('#tok-ucesnici .tok-ucesnik')).toHaveCount(10);

  await ekran.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(100);
  const x = await page.locator('#btn-tok-zatvori').boundingBox();
  expect(x.y).toBeGreaterThanOrEqual(0);
  expect(x.y + x.height).toBeLessThan(120); // zalijepljeno gore, ne odlazi sa ekrana
  await page.locator('#btn-tok-zatvori').click();
  await expect(ekran).toBeHidden();

  await page.locator('#btn-dodaj').click();
  await page.locator('#btn-lov-danas').click();
  await page.locator('#ld-sadrzaj [data-akcija="tok"]').click();
  await ekran.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.locator('#btn-tok-zatvori-dno').click();
  await expect(ekran).toBeHidden();
});
