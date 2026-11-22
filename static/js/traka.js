// Gornja traka (nadmorska visina + koordinate): prikaži/sakrij; izbor se pamti.

import { loadJSON, saveSoft } from './storage.js';

export const TRAKA_KEY = 'lovac.traka.sakrivena';

export function initTraka() {
  const bar = document.querySelector('.gornja-traka');
  const btn = document.getElementById('btn-koord-sakrij');
  if (!bar || !btn) return;
  const apply = (hidden) => {
    if (hidden) bar.setAttribute('data-sakrivena', ''); else bar.removeAttribute('data-sakrivena');
    btn.setAttribute('aria-expanded', String(!hidden));
    btn.setAttribute('aria-label', hidden ? 'Prikaži visinu i koordinate' : 'Sakrij visinu i koordinate');
  };
  apply(loadJSON(TRAKA_KEY, false) === true);
  btn.addEventListener('click', () => {
    const hidden = !bar.hasAttribute('data-sakrivena');
    saveSoft(TRAKA_KEY, hidden);
    apply(hidden);
  });
}
