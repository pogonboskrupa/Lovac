// Čista logika ekrana sekcije: moje sekcije, tekući lov, članovi i njihova aktivnost u lovu.

import { myStatus } from './sekcije.js';
import { todayIso } from './objekti.js';

// Pozicija starija od ovoga znači da je član u lovu, ali bez signala.
export const ACTIVE_MS = 10 * 60000;

export function mySections({ sekcije, clanovi, lovocuvari = [] }, user) {
  return sekcije.filter((s) => s.aktivno !== false
    && (user?.is_admin || ['grupovodja', 'lovocuvar', 'clan'].includes(myStatus(s, clanovi, user?.id, false, lovocuvari))));
}

// Lov u toku; ako ga nema, sljedeći planirani (od danas).
export function currentHunt(lovovi, sekcijaId, now = Date.now()) {
  const mine = lovovi.filter((z) => z.lov.sekcija_id === sekcijaId);
  const live = mine.filter((z) => z.lov.status === 'u_toku').sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)))[0];
  if (live) return { tip: 'u_toku', zapis: live };
  const today = todayIso(new Date(now));
  const next = mine.filter((z) => z.lov.status === 'planiran' && String(z.lov.datum).slice(0, 10) >= today)
    .sort((a, b) => String(a.lov.datum).localeCompare(String(b.lov.datum)))[0];
  return next ? { tip: 'sljedeci', zapis: next } : null;
}

export function memberActivity(userId, lov, ucesnici, pozicije, now = Date.now()) {
  const u = lov ? ucesnici.find((x) => x.korisnik_id === userId) : null;
  if (!u) return { stanje: 'nije-u-lovu', uloga: null, zadnje: null };
  if (lov.status !== 'u_toku') return { stanje: 'pozvan', uloga: u.uloga, zadnje: null };
  const p = pozicije.find((x) => x.korisnik_id === userId);
  const t = p ? Date.parse(p.t) : null;
  const svjeze = t != null && now - t <= ACTIVE_MS;
  return { stanje: svjeze ? 'aktivan' : 'bez-signala', uloga: u.uloga, zadnje: t, lat: p?.lat, lon: p?.lon };
}

function ago(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 1) return 'upravo';
  if (min < 60) return `prije ${min} min`;
  return `prije ${Math.floor(min / 60)} h`;
}

export function activityText(a, now = Date.now()) {
  if (a.stanje === 'aktivan') return `Aktivan u lovu · ${ago(now - a.zadnje)}`;
  if (a.stanje === 'bez-signala') return `U lovu, bez signala${a.zadnje ? ` · zadnja pozicija ${ago(now - a.zadnje)}` : ' · pozicija još nije stigla'}`;
  if (a.stanje === 'pozvan') return 'Pozvan na lov (lov još nije počeo)';
  return 'Nije u lovu';
}

const name = (u) => (u ? `${u.ime} ${u.prezime}${u.nadimak ? ` (${u.nadimak})` : ''}` : 'drugi lovac');

// Grupovođa, lovočuvar(i) revira, pa odobreni članovi po prezimenu.
export function sectionMembers(sekcija, clanovi, lovocuvari, users) {
  const byId = new Map(users.map((u) => [u.id, u]));
  const rows = [];
  const seen = new Set();
  const add = (id, uloga) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    rows.push({ id, uloga, ime: name(byId.get(id)), prezime: byId.get(id)?.prezime || '' });
  };
  add(sekcija.grupovodja_id, 'grupovodja');
  for (const l of lovocuvari.filter((x) => x.revir_id === sekcija.revir_id)) add(l.korisnik_id, 'lovocuvar');
  add(sekcija.lovocuvar_id, 'lovocuvar');
  const members = clanovi.filter((c) => c.sekcija_id === sekcija.id && c.status === 'odobren')
    .map((c) => ({ id: c.korisnik_id, prezime: byId.get(c.korisnik_id)?.prezime || '', ime: byId.get(c.korisnik_id)?.ime || '' }))
    .sort((a, b) => a.prezime.localeCompare(b.prezime, 'bs') || a.ime.localeCompare(b.ime, 'bs'));
  for (const m of members) add(m.id, 'clan');
  return rows;
}

const p2 = (n) => String(n).padStart(2, '0');

// Lov sekcije za danas: naziv nosi datum, da se lovovi iste sekcije razlikuju u spisku.
export function newTodayHunt(sekcija, id, now = new Date(), form = {}) {
  const naziv = String(form.naziv || '').trim().slice(0, 120);
  // vrijeme okupljanja ide na početak napomene (lov nema posebnu kolonu za to)
  const okupljanje = /^([01]\d|2[0-3]):[0-5]\d$/.test(form.okupljanje || '') ? `Okupljanje u ${form.okupljanje}.` : '';
  const napomena = [okupljanje, String(form.napomena || '').trim()].filter(Boolean).join('\n').slice(0, 1000);
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(form.datum || '') ? form.datum : todayIso(now);
  return {
    id, revir_id: sekcija.revir_id, sekcija_id: sekcija.id, status: 'planiran', datum,
    naziv: naziv || `${sekcija.naziv} — ${p2(now.getDate())}.${p2(now.getMonth() + 1)}.${now.getFullYear()}.`,
    ...(napomena ? { napomena } : {}),
  };
}

// Forma "Novi lov": šta se šalje serveru. Pokrenuti odmah se može samo lov sa današnjim datumom;
// organizator je vođa, izabrani članovi su strijelci ili pogoniči (form.uloge), bez duplikata i bez organizatora.
export function huntCreatePlan(sekcija, id, myId, form, now = new Date()) {
  const lov = newTodayHunt(sekcija, id, now, form);
  const ids = [...new Set(form.ucesnici || [])].filter((x) => x && x !== myId);
  return {
    lov,
    ucesnici: [{ lov_id: id, korisnik_id: myId, uloga: 'vodja' },
      ...ids.map((k) => ({ lov_id: id, korisnik_id: k, uloga: form.uloge?.[k] === 'pogonic' ? 'pogonic' : 'strijelac' }))],
    pokreni: Boolean(form.pokreni) && lov.datum === todayIso(now),
  };
}

// Šta lovac smije u lovu sekcije: prijaviti se kao prisutan (samo odobreni član) ili odjaviti SVOJU samoprijavu.
export function huntPresence(zapis, myId, myStatusInSection) {
  const mine = zapis?.ucesnici?.find((u) => u.korisnik_id === myId) || null;
  const open = zapis && ['planiran', 'u_toku'].includes(zapis.lov.status);
  return {
    mine,
    canJoin: Boolean(open && !mine && myStatusInSection === 'clan'),
    canLeave: Boolean(open && mine?.samoprijava),
  };
}

// Odobreni članovi sekcije kojih još nema među učesnicima lova (grupovođa ih može dodati).
export function addableMembers(sekcija, clanovi, ucesnici) {
  const inHunt = new Set(ucesnici.map((u) => u.korisnik_id));
  return clanovi.filter((c) => c.sekcija_id === sekcija.id && c.status === 'odobren' && !inHunt.has(c.korisnik_id)).map((c) => c.korisnik_id);
}

// ---- Istaknut prikaz lovaca sekcije: brojevi po stanju, filter i pretraga ----
export const CLAN_FILTERI = [
  { id: 'svi', naziv: 'Svi' },
  { id: 'aktivni', naziv: 'Aktivni' },
  { id: 'vodstvo', naziv: 'Vodstvo' },
];

// rows = sectionMembers(...), actOf(id) = memberActivity za tog člana.
export function huntersCounts(rows, actOf) {
  return {
    svi: rows.length,
    aktivni: rows.filter((r) => actOf(r.id).stanje === 'aktivan').length,
    bezSignala: rows.filter((r) => actOf(r.id).stanje === 'bez-signala').length,
    vodstvo: rows.filter((r) => r.uloga !== 'clan').length,
  };
}

export function filterHunters(rows, actOf, filter, query, match) {
  return rows.filter((r) => {
    if (filter === 'aktivni' && actOf(r.id).stanje !== 'aktivan') return false;
    if (filter === 'vodstvo' && r.uloga === 'clan') return false;
    return match([r.ime], query);
  });
}

// Prvih n lica za traku u heroju; vodstvo prvo (rows je već tako poređan), ostatak ide u "+N".
export function faceStrip(rows, n = 7) {
  return { lica: rows.slice(0, n), ostalo: Math.max(0, rows.length - n) };
}
