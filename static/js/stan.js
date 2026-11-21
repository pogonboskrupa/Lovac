// Pregled stana: jedan pogled sa pravcem telefona, sigurnosnim stanjem, udaljenošću i vjetrom (čista logika).

import { headingCheck } from './lov.js';
import { distanceM, bearingDeg, formatMemberDistance } from './istrazivac.js';
import { compassName } from './geo.js';

// Miris ide NIZ vjetar: suprotno od smjera odakle duva.
export function scentDirection(windFromDeg) {
  return (windFromDeg + 180) % 360;
}

export function standBrief({ heading, arcs, fix, stand, wind }) {
  const sigurnost = headingCheck(heading, arcs);
  const out = {
    sigurnost,
    pravac: heading == null || !Number.isFinite(heading) ? null : { stepeni: Math.round(heading), strana: compassName(heading) },
    stan: null,
    vjetar: null,
  };
  if (fix && stand && Number.isFinite(stand.lat)) {
    const d = distanceM(fix, stand);
    out.stan = { udaljenost: d, tekst: formatMemberDistance(d), strana: compassName(bearingDeg(fix, stand)), nasStanu: d <= 25 };
  }
  if (wind) {
    out.vjetar = {
      odakle: compassName(wind.smjer), stepeni: Math.round(wind.smjer), brzina: wind.brzina,
      mirisKa: compassName(scentDirection(wind.smjer)),
    };
  }
  return out;
}
