// Pregled korisnika i odobrenja (admin): čista logika, ne dira DOM. Status se izvodi iz kolona servera
// (odobren, probni_do, is_admin), nikad iz imena.

import { matchesQuery } from './pretraga.js';

// 'ceka' = nije odobren i nema probnog perioda (treba odluku), 'probni' = radi u probnom periodu, 'odobren', 'admin'.
export function userState(u, now = Date.now()) {
  if (u?.is_admin && u.odobren) return 'admin';
  if (u?.odobren) return 'odobren';
  const t = Date.parse(u?.probni_do || '');
  return Number.isFinite(t) && t > now ? 'probni' : 'ceka';
}

export const STATE_LABELS = { ceka: 'Čeka odobrenje', probni: 'Probni period', odobren: 'Odobren', admin: 'Administrator' };

export function usersOverview(users = [], now = Date.now()) {
  const o = { ukupno: users.length, ceka: 0, probni: 0, odobreni: 0, admini: 0 };
  for (const u of users) {
    const s = userState(u, now);
    if (s === 'ceka') o.ceka++;
    else if (s === 'probni') o.probni++;
    else if (s === 'admin') { o.admini++; o.odobreni++; } else o.odobreni++;
  }
  return o;
}

// Filteri: Svi / Čekaju (ceka + probni, njih admin treba da pregleda) / Odobreni / Admini.
export const USER_FILTERS = [['svi', 'Svi'], ['cekaju', 'Čekaju'], ['odobreni', 'Odobreni'], ['admini', 'Admini']];

export function matchesFilter(u, filter, now = Date.now()) {
  const s = userState(u, now);
  if (filter === 'cekaju') return s === 'ceka' || s === 'probni';
  if (filter === 'odobreni') return s === 'odobren' || s === 'admin';
  if (filter === 'admini') return s === 'admin';
  return true;
}

export function filterUsers(users, { filter = 'svi', q = '', now = Date.now(), extra = () => '' } = {}) {
  return users.filter((u) => matchesFilter(u, filter, now))
    .filter((u) => !q || matchesQuery([u.ime, u.prezime, u.nadimak || '', `${u.prezime} ${u.ime}`, extra(u)], q));
}

export function filterCounts(users, now = Date.now()) {
  return Object.fromEntries(USER_FILTERS.map(([k]) => [k, users.filter((u) => matchesFilter(u, k, now)).length]));
}

// Redoslijed za pregled: prvo ko čeka odluku (probni period koji prije ističe ide ispred), pa odobreni po prezimenu.
export function reviewOrder(users, now = Date.now()) {
  const rank = { ceka: 0, probni: 1, odobren: 2, admin: 2 };
  return [...users].sort((a, b) => (rank[userState(a, now)] - rank[userState(b, now)])
    || (userState(a, now) === 'probni' ? Date.parse(a.probni_do) - Date.parse(b.probni_do) : 0)
    || String(a.prezime).localeCompare(String(b.prezime), 'bs')
    || String(a.ime).localeCompare(String(b.ime), 'bs'));
}

// Sekcije u kojima korisnik traži ulaz / jeste član (iz keša sekcija), za red "Traži: Krupa 1".
export function sectionLines(userId, data) {
  const nameOf = (id) => {
    const s = (data.sekcije || []).find((x) => x.id === id);
    if (!s) return null;
    const revir = (data.reviri || []).find((r) => r.id === s.revir_id)?.naziv;
    return revir ? `${s.naziv} (${revir})` : s.naziv;
  };
  const rows = (data.clanovi || []).filter((c) => c.korisnik_id === userId);
  const pick = (status) => rows.filter((c) => c.status === status).map((c) => nameOf(c.sekcija_id)).filter(Boolean);
  return { traze: pick('ceka'), clan: pick('odobren') };
}

export function pendingBadgeText(n) {
  return n > 0 ? `${n} čeka odluku` : '';
}
