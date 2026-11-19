// Čista logika zajedničkog lova (raspored, sektori, kompas). Ne zamjenjuje pravila lova ni vođu lova.

import { standSectors, isForbidden } from './sektori.js';

// Kompas telefona može griješiti više stepeni; pravac blizu granice se smatra zabranjenim.
export const KOMPAS_TOLERANCIJA = 10;

export function myAssignment(data, myId) {
  const u = data.ucesnici.find((x) => x.korisnik_id === myId);
  if (!u) return null;
  return { uloga: u.uloga, stan: data.stanovi.find((s) => s.korisnik_id === myId) || null };
}

export function sectorsForStand(stand, data) {
  const manual = data.sektori
    .filter((s) => s.stan_id === stand.id)
    .map((s) => ({ od: s.od_azimut, do: s.do_azimut, razlog: s.razlog }));
  return standSectors(stand, data.stanovi, manual);
}

export function nextStandNumber(stanovi) {
  return stanovi.reduce((m, s) => Math.max(m, s.broj || 0), 0) + 1;
}

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function todaysHunts(list, now = new Date()) {
  const day = isoDay(now);
  return list.filter((l) => String(l.datum).slice(0, 10) === day && l.status !== 'zavrsen');
}

export function headingCheck(heading, arcs) {
  if (heading == null || !Number.isFinite(heading)) return 'nepoznato';
  for (let d = -KOMPAS_TOLERANCIJA; d <= KOMPAS_TOLERANCIJA; d += 1) {
    if (isForbidden(heading + d, arcs)) return 'zabranjeno';
  }
  return 'dozvoljeno';
}
