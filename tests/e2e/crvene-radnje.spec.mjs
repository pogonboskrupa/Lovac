import { test, expect } from '@playwright/test';
import { serveTiles } from './helpers.mjs';

// Dugmad koja zatvaraju ili brišu su crvena u obje teme, a bijeli tekst ima kontrast ≥ 4,5:1.
const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
const lum = ([r, g, b]) => { const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const omjer = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

for (const tema of ['noc', 'dan']) {
  test(`zatvori i obriši su crveni (${tema})`, async ({ page }) => {
    await serveTiles(page);
    await page.goto('/');
    await page.evaluate((t) => {
      document.documentElement.dataset.tema = t;
      const html = [
        '<button id="probni-zatvori" class="ikona-dugme" aria-label="Zatvori">X</button>',
        '<button id="btn-test-zatvori-dno" class="dugme">Zatvori</button>',
        '<button data-akcija="obrisi" class="dugme">Obriši</button>',
        '<button data-akcija="ukloni-ucesnika" class="dugme">Ukloni</button>',
        '<button data-akcija="skini" class="dugme">Skini</button>',
        '<button data-akcija="odbij-odustani" class="dugme">Odustani</button>',
      ].join('');
      const box = document.createElement('div');
      box.id = 'probni-okvir';
      box.innerHTML = html;
      document.body.append(box);
    }, tema);
    const boje = await page.$$eval('#probni-okvir button', (bs) => bs.map((b) => { const c = getComputedStyle(b); return [b.textContent, c.backgroundColor, c.color]; }));
    for (const [tekst, bg, fg] of boje.slice(0, 5)) {
      expect(bg, tekst).toBe('rgb(198, 40, 40)');
      expect(omjer(rgb(bg), rgb(fg)), tekst).toBeGreaterThanOrEqual(4.5);
    }
    expect(boje[5][1], 'Odustani nije crveno').not.toBe('rgb(198, 40, 40)');
  });
}
