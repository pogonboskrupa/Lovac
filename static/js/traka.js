// Gornja traka (nadmorska visina + koordinate) se prikazuje ili sakriva SAMO prekidačem u ploči podloga
// ("Prikaži visinu i koordinate"); izbor se pamti. Visina u traci je samo prikaz, nije dugme (vlasnik: jedno mjesto za izbor).

import { loadJSON, saveSoft } from './storage.js';

export const TRAKA_KEY = 'lovac.traka.sakrivena';

export function initTraka() {
  const frame = document.getElementById('koord-okvir');
  const sw = document.getElementById('btn-koord-prikazi');
  if (!frame) return;
  const apply = (hidden) => {
    if (hidden) frame.setAttribute('data-sakrivena', ''); else frame.removeAttribute('data-sakrivena');
    frame.hidden = hidden;
    sw?.setAttribute('aria-pressed', String(!hidden));
  };
  apply(loadJSON(TRAKA_KEY, false) === true);
  sw?.addEventListener('click', () => {
    const hidden = !frame.hasAttribute('data-sakrivena');
    saveSoft(TRAKA_KEY, hidden);
    apply(hidden);
  });
}
