// Dijeljenje lokacije sa sekcijom (van lova): trajanje, istek i spisak članova koji dijele (čista logika).

import { distanceM, bearingDeg } from './istrazivac.js';
import { sharingState } from './lokacija.js';

export const SHARE_DURATIONS = [
  { id: '1', naziv: '1 sat' },
  { id: '4', naziv: '4 sata' },
  { id: 'dan', naziv: 'Do kraja dana' },
];

// Server dozvoljava najviše 24 h; "do kraja dana" je ponoć po lokalnom vremenu (nikad duže od 24 h).
export function shareUntil(id, now = Date.now()) {
  if (id === 'dan') {
    const d = new Date(now);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0).getTime() - 1;
  }
  const hours = Number(id) === 4 ? 4 : 1;
  return now + hours * 3600000;
}

// Spremljeno stanje dijeljenja: { sekcijaId, do } ili null ako je isteklo/neispravno.
export function activeShare(raw, now = Date.now()) {
  if (!raw?.sekcijaId || !Number.isFinite(raw.do) || raw.do <= now) return null;
  return { sekcijaId: raw.sekcijaId, do: raw.do };
}

// Dijele svi koji sa sekcijom imaju veze: član, lovovođa sekcije, lovočuvar revira i administrator (migracija 035).
// Gledaju samo članovi, lovovođa sekcije i lovočuvar — administrator tuđe lokacije ne vidi (nije dio sekcije).
export function canShareToSection(status) {
  return ['clan', 'grupovodja', 'lovocuvar', 'admin'].includes(status);
}

// rows: [{ korisnik_id, lat, lon, t, do_ }] — drugi članovi koji dijele i nije isteklo; najbliži prvi.
export function sectionShareList(rows, myId, nameOf, me, now = Date.now()) {
  return rows
    .filter((r) => r.korisnik_id !== myId && Date.parse(r.do_) > now && sharingState(r.t, now) !== 'nema')
    .map((r) => ({
      id: r.korisnik_id, ime: nameOf(r.korisnik_id), lat: r.lat, lon: r.lon, stanje: sharingState(r.t, now),
      starost: Math.max(0, Math.round((now - Date.parse(r.t)) / 60000)),
      udaljenost: me ? distanceM(me, r) : null, smjer: me ? bearingDeg(me, r) : null,
    }))
    .sort((a, b) => (a.udaljenost ?? Infinity) - (b.udaljenost ?? Infinity) || a.ime.localeCompare(b.ime, 'bs'));
}

export function untilText(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
