// Statistika lovca (čista logika): lovovi, ulov, tragovi, opažanja iz podataka koji su na telefonu.

import { trackDistance } from './trag.js';

const yearOf = (ms) => new Date(ms).getFullYear();

export function statYears({ lovovi = [], odstrel = [], tragovi = [], opazanja = [] }) {
  const set = new Set();
  for (const z of lovovi) if (z.lov?.datum) set.add(Number(String(z.lov.datum).slice(0, 4)));
  for (const o of odstrel) set.add(yearOf(o.vrijeme));
  for (const t of tragovi) set.add(yearOf(t.start));
  for (const o of opazanja) set.add(yearOf(o.vrijeme));
  return [...set].filter(Number.isFinite).sort((a, b) => b - a);
}

// godina = null → sve godine
export function hunterStats({ lovovi = [], myId, odstrel = [], tragovi = [], opazanja = [], objekti = [], godina = null }) {
  const inYear = (ms) => godina == null || yearOf(ms) === godina;
  const myHunts = lovovi.filter((z) => ['zavrsen', 'u_toku'].includes(z.lov.status)
    && z.ucesnici?.some((u) => u.korisnik_id === myId)
    && (godina == null || Number(String(z.lov.datum).slice(0, 4)) === godina));
  const hours = myHunts.reduce((s, z) => (z.lov.pocetak && z.lov.kraj ? s + Math.max(0, Date.parse(z.lov.kraj) - Date.parse(z.lov.pocetak)) : s), 0) / 3600000;

  const mine = odstrel.filter((o) => !o.tudji && inYear(o.vrijeme));
  const bySpecies = new Map();
  let weight = 0;
  let biggest = null;
  for (const o of mine) {
    bySpecies.set(o.vrsta, (bySpecies.get(o.vrsta) || 0) + 1);
    const w = Number(o.tezina) > 0 ? Number(o.tezina) : 0;
    weight += w;
    if (w > (biggest?.tezina || 0)) biggest = { vrsta: o.vrsta, tezina: w, vrijeme: o.vrijeme };
  }

  const done = tragovi.filter((t) => t.status === 'gotovo' && !t.tudji && inYear(t.start));
  const walks = done.filter((t) => t.vrsta !== 'potraga');
  const km = walks.reduce((s, t) => s + trackDistance(t.tacke), 0) / 1000;
  const obs = opazanja.filter((o) => !o.tudji && inYear(o.vrijeme));

  return {
    lovova: myHunts.length,
    sati: hours,
    ulov: mine.length,
    tezina: weight,
    najveci: biggest,
    poVrstama: [...bySpecies.entries()].map(([vrsta, komada]) => ({ vrsta, komada })).sort((a, b) => b.komada - a.komada),
    tragova: walks.length,
    potraga: done.length - walks.length,
    km,
    opazanja: obs.length,
    grla: obs.reduce((s, o) => s + (o.broj || 1), 0),
    objekata: objekti.filter((o) => !o.tudji).length,
  };
}
