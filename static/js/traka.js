// Gornja traka (nadmorska visina + koordinate): dodir na visinu je sakriva/prikazuje, a isti izbor je i
// prekidač u ploči podloga. Izbor se pamti. Kad je sakrivena ostaje samo ikona planine (dodir je vraća).

import { loadJSON, saveSoft } from './storage.js';

export const TRAKA_KEY = 'lovac.traka.sakrivena';

export function initTraka() {
  const frame = document.getElementById('koord-okvir');
  const nv = document.getElementById('btn-nv');
  const sw = document.getElementById('btn-koord-prikazi');
  if (!frame || !nv) return;
  const apply = (hidden) => {
    if (hidden) frame.setAttribute('data-sakrivena', ''); else frame.removeAttribute('data-sakrivena');
    nv.setAttribute('aria-expanded', String(!hidden));
    nv.setAttribute('aria-label', hidden ? 'Prikaži visinu i koordinate' : 'Nadmorska visina. Dodir sakriva visinu i koordinate');
    sw?.setAttribute('aria-pressed', String(!hidden));
  };
  const toggle = () => {
    const hidden = !frame.hasAttribute('data-sakrivena');
    saveSoft(TRAKA_KEY, hidden);
    apply(hidden);
  };
  apply(loadJSON(TRAKA_KEY, false) === true);
  nv.addEventListener('click', toggle);
  sw?.addEventListener('click', toggle);
}
