// Kompas "Pravac gledanja" (čista logika): glatko praćenje smjera, tekst i izvor.

import { formatBearing } from './geo.js';

const norm = (d) => ((d % 360) + 360) % 360;

// Najkraća razlika uglova u (-180, 180]: prelazak 359° → 1° ne smije proći kroz 180°.
export function angleDelta(from, to) {
  const d = norm(to - from);
  return d > 180 ? d - 360 : d;
}

// Kompas senzor šumi; prigušenje po kružnoj razlici (k = udio novog mjerenja).
export function smoothHeading(prev, next, k = 0.35) {
  if (!Number.isFinite(next)) return prev;
  if (!Number.isFinite(prev)) return norm(next);
  return norm(prev + angleDelta(prev, next) * k);
}

// Ruža se okreće suprotno od smjera telefona, pa je smjer gledanja uvijek na vrhu.
export function roseRotation(heading) {
  return Number.isFinite(heading) ? norm(-heading) : 0;
}

export function headingText(heading) {
  return Number.isFinite(heading) ? formatBearing(norm(heading)) : '—';
}

// Izvor smjera: senzor (kompas) ili GPS smjer kretanja (samo kad se kreće), inače ništa.
export function headingSource(compass, gps) {
  if (Number.isFinite(compass)) return { stepeni: norm(compass), izvor: 'kompas' };
  if (Number.isFinite(gps)) return { stepeni: norm(gps), izvor: 'kretanje' };
  return { stepeni: null, izvor: null };
}

export const STOZAC_KEY = 'lovac.kompas.stozac';

// Snop pravca na karti: zadano uključen; samo izričito `false` ga gasi.
export function coneEnabled(stored) {
  return stored !== false;
}

export const KOMPAS_NAPOMENA = 'Kompas može griješiti (metal, magneti). Ne zamjenjuje pravila lova ni vođu lova.';
