// Kompas u ploči "Moja lokacija": pravac gledanja telefona.

import { onGpsUpdate } from './gps.js';
import { smoothHeading, roseRotation, headingText, headingSource, KOMPAS_NAPOMENA } from './kompas.js';

const $ = (id) => document.getElementById(id);

export function initKompas() {
  const rose = $('kompas-ruza');
  if (!rose) return;
  let shown = null;
  let frame = 0;
  let compassSeen = false;

  const draw = () => {
    frame = 0;
    rose.style.transform = `rotate(${roseRotation(shown)}deg)`;
    $('kompas-tekst').textContent = headingText(shown);
  };

  onGpsUpdate((fix, heading) => {
    const src = headingSource(heading, fix?.heading);
    if (src.izvor === 'kompas') compassSeen = true;
    if (src.stepeni == null) {
      $('kompas-izvor').textContent = 'Kompas nije dostupan na ovom telefonu';
      return;
    }
    shown = smoothHeading(shown, src.stepeni);
    $('kompas-izvor').textContent = src.izvor === 'kompas' ? 'Pravac gledanja (kompas)' : 'Smjer kretanja (GPS)';
    if (!frame) frame = requestAnimationFrame(draw);
  });
  $('kompas-napomena').textContent = KOMPAS_NAPOMENA;
  $('kompas-izvor').textContent = 'Čekam kompas…';
  setTimeout(() => { if (!compassSeen && shown == null) $('kompas-izvor').textContent = 'Kompas nije dostupan na ovom telefonu'; }, 4000);
}
