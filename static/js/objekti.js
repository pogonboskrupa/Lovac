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

// ---- pregled objekata (v0.5.6) ----
// Pravilo aplikacije (ne propis): objekat bez obilaska 30+ dana se označava kao "dugo bez obilaska".
export const OBILAZAK_KASNI_DANA = 30;
const DAY_MS = 86400000;

export function daysSince(iso, now = Date.now()) {
  const t = Date.parse(`${String(iso || '').slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

// {dana, kasni}: dana = null kad obilazak nije upisan (to se računa kao "nije obilažen").
export function visitStatus(o, now = Date.now()) {
  const dana = daysSince(o.zadnji_obilazak, now);
  return { dana, kasni: dana == null || dana >= OBILAZAK_KASNI_DANA };
}

export function visitText(o, now = Date.now()) {
  const { dana } = visitStatus(o, now);
  if (dana == null) return 'nije obilažen';
  if (dana === 0) return 'obiđen danas';
  if (dana === 1) return 'obiđen jučer';
  return `obiđen prije ${dana} dana`;
}

export const OBJEKTI_FILTERI = [['svi', 'Svi'], ['popravka', 'Treba popravka'], ['kasni', 'Dugo bez obilaska']];
export const OBJEKTI_SORT = [['blizu', 'Najbliži'], ['naziv', 'Po nazivu'], ['obilazak', 'Najdavnije obiđeni']];

export function filterObjects(items, { filter = 'svi', vrsta = '' } = {}, now = Date.now()) {
  return items.filter((o) => (filter === 'popravka' ? needsRepair(o) : filter === 'kasni' ? visitStatus(o, now).kasni : true)
    && (!vrsta || o.vrsta === vrsta));
}

export function sortObjects(items, mode, now = Date.now()) {
  const list = [...items];
  if (mode === 'naziv') return list.sort((a, b) => String(a.naziv).localeCompare(String(b.naziv), 'bs'));
  if (mode === 'obilazak') return list.sort((a, b) => (visitStatus(b, now).dana ?? Infinity) - (visitStatus(a, now).dana ?? Infinity));
  return list; // 'blizu': već sortirano po udaljenosti
}

// Brojevi po vrsti za filtere: [{vrsta, komada}] najviše prvo.
export function typeCounts(items) {
  const m = new Map();
  for (const o of items) m.set(o.vrsta, (m.get(o.vrsta) || 0) + 1);
  return [...m.entries()].map(([vrsta, komada]) => ({ vrsta, komada })).sort((a, b) => b.komada - a.komada);
}
