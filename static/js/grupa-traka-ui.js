// Traka na mapi: lov moje grupe (u toku ili tek dolazi) sa brojem prisutnih; dodir otvara "Moja grupa".
// Podaci su lokalni (keš lovova i sekcija), pa traka ne pravi nikakve zahtjeve serveru.
import { cachedProfile } from './auth.js';
import { idbAll } from './db.js';
import { cachedSekcije } from './sekcije-ui.js';
import { groupBanner } from './grupa-podaci.js';

const REFRESH_MS = 60000;

export function initGrupaTraka() {
  const el = document.getElementById('grupa-traka');
  if (!el) return;
  const update = async () => {
    try {
      const me = cachedProfile();
      const b = me?.id ? groupBanner(await cachedSekcije(), await idbAll('lovovi'), me) : null;
      el.hidden = !b;
      if (b) { el.textContent = b.tekst; el.dataset.moj = String(b.moj); }
    } catch (err) {
      console.warn('traka grupe', err.message);
    }
  };
  el.addEventListener('click', () => document.dispatchEvent(new Event('grupa:otvori')));
  for (const ev of ['lovovi:preuzeti', 'lovovi:promjena', 'sekcije:promjena']) document.addEventListener(ev, update);
  setInterval(update, REFRESH_MS);
  setTimeout(update, 2500);
}
