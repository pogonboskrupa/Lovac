// Dijeljenje lokacije u lovu: postavke, stanje svježine, izbor aktivnog lova i spisak članova (čista logika).

import { distanceM, bearingDeg } from './istrazivac.js';

export const SHARE_INTERVALS = [
  { id: 'cesto', ms: 10000, naziv: 'Često (10 s)' },
  { id: 'normalno', ms: 20000, naziv: 'Normalno (20 s)' },
  { id: 'stedi', ms: 60000, naziv: 'Štedi bateriju (60 s)' },
];

export function normalizeShare(raw) {
  const interval = SHARE_INTERVALS.some((i) => i.id === raw?.interval) ? raw.interval : 'normalno';
  return { on: raw?.on !== false, interval };
}

export function shareIntervalMs(id) {
  return (SHARE_INTERVALS.find((i) => i.id === id) || SHARE_INTERVALS[1]).ms;
}

// zivo ≤ 2 min, staro ≤ 10 min (isto kao "aktivan" u sekciji), bez-signala ≤ 30 min, inače nema.
export function sharingState(t, now = Date.now()) {
  const min = (now - Date.parse(t)) / 60000;
  if (!Number.isFinite(min) || min > 30) return 'nema';
  if (min <= 2) return 'zivo';
  if (min <= 10) return 'staro';
  return 'bez-signala';
}

export function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// Lov u toku u kojem sam učesnik; najnoviji datum ako ih je više.
export function pickActiveHunt(records, myId) {
  return records
    .filter((r) => r?.lov?.status === 'u_toku' && r.ucesnici?.some((u) => u.korisnik_id === myId))
    .sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)))[0] || null;
}

// Učesnici lova (bez mene): oni koji dijele (svježa pozicija) prvi po udaljenosti, ostali po imenu.
export function shareList(ucesnici, rows, myId, nameOf, me, now = Date.now()) {
  const byUser = new Map(rows.map((r) => [r.korisnik_id, r]));
  return ucesnici
    .filter((u) => u.korisnik_id !== myId)
    .map((u) => {
      const row = byUser.get(u.korisnik_id);
      const stanje = row ? sharingState(row.t, now) : 'nema';
      const base = { id: u.korisnik_id, ime: nameOf(u.korisnik_id), uloga: u.uloga, stanje };
      if (stanje === 'nema' || !row) return base;
      const udaljenost = me ? distanceM(me, row) : null;
      return { ...base, lat: row.lat, lon: row.lon, t: row.t, starost: Math.max(0, Math.round((now - Date.parse(row.t)) / 60000)),
        udaljenost, smjer: me ? bearingDeg(me, row) : null };
    })
    .sort((a, b) => (a.stanje === 'nema') - (b.stanje === 'nema')
      || (a.udaljenost ?? Infinity) - (b.udaljenost ?? Infinity)
      || a.ime.localeCompare(b.ime, 'bs'));
}
