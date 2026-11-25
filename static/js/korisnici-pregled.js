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
export const USER_FILTERS = [['svi', 'Svi'], ['cekaju', 'Čekaju'], ['odobreni', 'Odobreni'], ['vodstvo', 'Vodstvo'], ['admini', 'Admini'], ['bez', 'Bez sekcije']];

// Vodstvo = grupovođa sekcije, lovočuvar revira ili administrator. "Bez sekcije" = odobren lovac koji nije član nijedne sekcije
// (ni vođa neke): takvog nema ko da pozove na lov, pa ga admin treba rasporediti.
export function matchesFilter(u, filter, now = Date.now(), data = {}) {
  const s = userState(u, now);
  if (filter === 'cekaju') return s === 'ceka' || s === 'probni';
  if (filter === 'odobreni') return s === 'odobren' || s === 'admin';
  if (filter === 'admini') return s === 'admin';
  if (filter === 'vodstvo') {
    if (s !== 'odobren' && s !== 'admin') return false;
    const r = roleInfo(u.id, data);
    return s === 'admin' || r.vodi.length > 0 || r.lovocuvar.length > 0;
  }
  if (filter === 'bez') {
    if (s !== 'odobren') return false;
    const r = roleInfo(u.id, data);
    return r.clan.length === 0 && r.vodi.length === 0;
  }
  return true;
}

// sekcija: '' (sve), id sekcije (član ili traži ulaz u nju) ili 'bez' (nije u nijednoj).
export function inSection(userId, sekcija, data = {}) {
  if (!sekcija) return true;
  const r = roleInfo(userId, data);
  if (sekcija === 'bez') return r.clan.length === 0 && r.traze.length === 0 && r.vodi.length === 0;
  return r.clan.some((c) => c.id === sekcija) || r.traze.some((c) => c.id === sekcija) || r.vodi.some((c) => c.id === sekcija);
}

export function filterUsers(users, { filter = 'svi', q = '', now = Date.now(), extra = () => '', data = {}, sekcija = '' } = {}) {
  return users.filter((u) => matchesFilter(u, filter, now, data))
    .filter((u) => inSection(u.id, sekcija, data))
    .filter((u) => !q || matchesQuery([u.ime, u.prezime, u.nadimak || '', `${u.prezime} ${u.ime}`, extra(u)], q));
}

export function filterCounts(users, now = Date.now(), data = {}) {
  return Object.fromEntries(USER_FILTERS.map(([k]) => [k, users.filter((u) => matchesFilter(u, k, now, data)).length]));
}

const sekcijaTekst = (s, data) => {
  const revir = (data.reviri || []).find((r) => r.id === s.revir_id)?.naziv;
  return revir ? `${s.naziv} (${revir})` : s.naziv;
};

// Sve što korisnik JESTE u sekcijama i revirima (iz keša sekcija): vodi sekcije (grupovođa), lovočuvar revira, član, traži ulaz.
export function roleInfo(userId, data = {}) {
  const sekcije = data.sekcije || [];
  const byId = new Map(sekcije.map((s) => [s.id, s]));
  const rows = (data.clanovi || []).filter((c) => c.korisnik_id === userId && byId.has(c.sekcija_id));
  const mk = (c) => ({ id: c.sekcija_id, tekst: sekcijaTekst(byId.get(c.sekcija_id), data), pozvao_id: c.pozvao_id || null, aktivno: byId.get(c.sekcija_id).aktivno !== false });
  return {
    vodi: sekcije.filter((s) => s.grupovodja_id === userId).map((s) => ({ id: s.id, tekst: sekcijaTekst(s, data) })),
    lovocuvar: (data.lovocuvari || []).filter((l) => l.korisnik_id === userId)
      .map((l) => ({ id: l.revir_id, tekst: (data.reviri || []).find((r) => r.id === l.revir_id)?.naziv || 'revir' })),
    clan: rows.filter((c) => c.status === 'odobren').map(mk),
    traze: rows.filter((c) => c.status === 'ceka').map(mk),
  };
}

// Sekcije u koje se korisnik može premjestiti/dodati: aktivne i one u kojima već nema red (član ili zahtjev).
export function sectionTargets(userId, data = {}) {
  const has = new Set((data.clanovi || []).filter((c) => c.korisnik_id === userId).map((c) => c.sekcija_id));
  const reviri = data.reviri || [];
  return (data.sekcije || []).filter((s) => s.aktivno !== false && !has.has(s.id))
    .map((s) => ({ id: s.id, tekst: sekcijaTekst(s, data), revir: reviri.find((r) => r.id === s.revir_id)?.naziv || '' }))
    .sort((a, b) => a.revir.localeCompare(b.revir, 'bs') || a.tekst.localeCompare(b.tekst, 'bs'));
}

// Sekcije u kojima korisnik još NIJE grupovođa (imenovanje zamjenjuje postojećeg, pa se vidi ko je trenutni).
export function leaderTargets(userId, users = [], data = {}) {
  const name = (id) => { const u = users.find((x) => x.id === id); return u ? `${u.ime} ${u.prezime}` : ''; };
  return (data.sekcije || []).filter((s) => s.aktivno !== false && s.grupovodja_id !== userId)
    .map((s) => ({ id: s.id, tekst: sekcijaTekst(s, data), trenutni: s.grupovodja_id ? name(s.grupovodja_id) || 'drugi lovac' : '' }))
    .sort((a, b) => a.tekst.localeCompare(b.tekst, 'bs'));
}

// Revirima u kojima korisnik još NIJE lovočuvar.
export function keeperTargets(userId, data = {}) {
  const has = new Set((data.lovocuvari || []).filter((l) => l.korisnik_id === userId).map((l) => l.revir_id));
  return (data.reviri || []).filter((r) => r.aktivno !== false && !has.has(r.id)).map((r) => ({ id: r.id, tekst: r.naziv }));
}

// Brojke za pregled: vodstvo (različiti ljudi) i odobreni bez sekcije.
export function rolesOverview(users = [], data = {}, now = Date.now()) {
  const gv = new Set((data.sekcije || []).map((s) => s.grupovodja_id).filter(Boolean));
  const lc = new Set((data.lovocuvari || []).map((l) => l.korisnik_id));
  const ids = new Set(users.map((u) => u.id));
  return {
    grupovodje: [...gv].filter((id) => ids.has(id)).length,
    lovocuvari: [...lc].filter((id) => ids.has(id)).length,
    bez: users.filter((u) => matchesFilter(u, 'bez', now, data)).length,
  };
}

export function rolesText(o) {
  return `${o.grupovodje} grupovođa · ${o.lovocuvari} lovočuvara · ${o.bez} bez sekcije`;
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

// Zahtjevi za sekciju koje admin može odobriti zajedno sa nalogom (bez predloženih naloga: njih vodi odobri_pozvanog).
export function approvableRequests(userId, data) {
  return (data.clanovi || []).filter((c) => c.korisnik_id === userId && c.status === 'ceka' && !c.pozvao_id)
    .map((c) => ({ sekcija_id: c.sekcija_id, naziv: (data.sekcije || []).find((x) => x.id === c.sekcija_id)?.naziv || 'sekciju' }));
}

export function approveLabel(requests) {
  if (!requests.length) return 'Odobri';
  return requests.length === 1 ? `Odobri i primi u ${requests[0].naziv}` : `Odobri i primi u sekcije (${requests.length})`;
}

// "Registrovan danas / jučer / prije N dana" iz created_at; bez datuma prazan tekst.
export function registeredText(u, now = Date.now()) {
  const t = Date.parse(u?.created_at || '');
  if (!Number.isFinite(t)) return '';
  const days = Math.floor((now - t) / 86400000);
  return `Registrovan ${days <= 0 ? 'danas' : days === 1 ? 'jučer' : `prije ${days} dana`}`;
}
