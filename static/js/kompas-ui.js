// Pravac gledanja u ploči "Moja lokacija": prekidač plavog snopa na karti i stanje senzora.

import { onGpsUpdate } from './gps.js';
import { loadJSON, saveSoft } from './storage.js';
import { headingSource, coneEnabled, STOZAC_KEY, KOMPAS_NAPOMENA } from './kompas.js';

const $ = (id) => document.getElementById(id);

export function initKompas() {
  const sw = $('btn-kompas-stozac');
  if (!sw) return;
  let on = coneEnabled(loadJSON(STOZAC_KEY, null));
  let seen = false;

  const draw = () => {
    sw.setAttribute('aria-checked', String(on));
    sw.dataset.on = String(on);
  };
  sw.addEventListener('click', () => {
    on = !on;
    saveSoft(STOZAC_KEY, on);
    draw();
    document.dispatchEvent(new CustomEvent('kompas:promjena'));
  });
  onGpsUpdate((fix, heading) => {
    const src = headingSource(heading, fix?.heading);
    if (src.izvor) seen = true;
    $('kompas-izvor').textContent = src.izvor === 'kompas' ? 'Kompas radi'
      : src.izvor === 'kretanje' ? 'Smjer kretanja (GPS)'
        : 'Čekam kompas…';
  });
  $('kompas-napomena').textContent = KOMPAS_NAPOMENA;
  setTimeout(() => { if (!seen) $('kompas-izvor').textContent = 'Kompas nije dostupan na ovom telefonu'; }, 4000);
  draw();
}
