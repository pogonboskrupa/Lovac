// Čista logika lovačkih objekata.

import { haversine } from './trag.js';

export const STANJA = { ispravno: 'Ispravno', popravka: 'Treba popravka', sruseno: 'Srušeno' };

export function needsRepair(o) {
  return o.stanje === 'popravka' || o.stanje === 'sruseno';
}

export function sortByDistance(items, from) {
  return items
    .map((o) => ({ ...o, udaljenost: from ? haversine(from, o) : null }))
    .sort((a, b) => (a.udaljenost ?? 0) - (b.udaljenost ?? 0));
}

export function todayIso(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function formatDateBs(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${Number(d)}.${Number(m)}.${y}.`;
}
