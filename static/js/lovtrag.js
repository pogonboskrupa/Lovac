// Trag kretanja lovaca tokom lova (čista logika): kad se tačka snima, grupisanje po lovcu i boje.

import { distanceM } from './istrazivac.js';

// Tačka se snima kad se lovac pomjerio bar minM metara ili je prošlo maxMs (da trag ne ostane prazan na stanu).
export function shouldRecordPoint(last, fix, now = Date.now(), { minM = 15, maxMs = 90000 } = {}) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return false;
  if (!last) return true;
  return distanceM(last, fix) >= minM || now - last.t >= maxMs;
}

export function pushPoint(buffer, point, max = 3000) {
  return [...buffer, point].slice(-max);
}

export const BOJE_TRAGA = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0f766e'];

export function trailColor(index) {
  return BOJE_TRAGA[((index % BOJE_TRAGA.length) + BOJE_TRAGA.length) % BOJE_TRAGA.length];
}

// rows: [{ korisnik_id, lat, lon, t }] → [{ id, tacke:[{lat,lon,t}], duzina, boja }] stabilnim redoslijedom (po prvoj tački).
export function groupTrails(rows) {
  const by = new Map();
  for (const r of rows) {
    const list = by.get(r.korisnik_id) || [];
    list.push({ lat: r.lat, lon: r.lon, t: typeof r.t === 'number' ? r.t : Date.parse(r.t) });
    by.set(r.korisnik_id, list);
  }
  return [...by.entries()]
    .map(([id, tacke]) => {
      tacke.sort((a, b) => a.t - b.t);
      let duzina = 0;
      for (let i = 1; i < tacke.length; i++) duzina += distanceM(tacke[i - 1], tacke[i]);
      return { id, tacke, duzina };
    })
    .sort((a, b) => a.tacke[0].t - b.tacke[0].t || a.id.localeCompare(b.id))
    .map((tr, i) => ({ ...tr, boja: trailColor(i) }));
}

// Rezervne tačke lovca koje još nisu poslane na server (lokalni bafer) dodaju se njegovom tragu.
export function withLocalPoints(rows, localPoints, myId) {
  const have = new Set(rows.filter((r) => r.korisnik_id === myId).map((r) => Date.parse(r.t)));
  return [...rows, ...localPoints.filter((p) => !have.has(p.t)).map((p) => ({ korisnik_id: myId, lat: p.lat, lon: p.lon, t: p.t }))];
}

// Iz TRENUTNOG bafera izbaci samo poslane tačke (tačke snimljene dok je slanje trajalo ostaju).
export function removeSentPoints(buffer, sent) {
  const done = new Set(sent.map((p) => p.t));
  return buffer.filter((p) => !done.has(p.t));
}
