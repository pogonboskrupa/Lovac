// Čista logika sekcija: status pristupa, ko upravlja, grupisanje po reviru.
// Pristup provodi SERVER (migracija 008); ovdje se samo prikazuje šta je dozvoljeno.

// Lovočuvar prati CIJELI revir (sve njegove sekcije); sekcija.lovocuvar_id je ranija, uža varijanta.
export function myStatus(sekcija, clanovi, myId, isAdmin = false, lovocuvari = []) {
  if (!myId) return 'nema'; // bez profila (npr. odjavljen) niko nije ni vođa ni lovočuvar: undefined === undefined je zamka
  if (isAdmin) return 'admin';
  if (sekcija.grupovodja_id === myId) return 'grupovodja';
  if (sekcija.lovocuvar_id === myId || lovocuvari.some((l) => l.revir_id === sekcija.revir_id && l.korisnik_id === myId)) return 'lovocuvar';
  const c = clanovi.find((x) => x.sekcija_id === sekcija.id && x.korisnik_id === myId);
  if (!c) return 'nema';
  return c.status === 'odobren' ? 'clan' : 'ceka';
}

// Ko smije praviti naloge u sekciji: admin/grupovođa/lovočuvar direktno, običan član samo predlaže.
// Kanal Rukovodstvo: admin, grupovođe i lovočuvari (server to provjerava kroz je_rukovodstvo()).
export function isLeadership(user, ctx = {}) {
  if (!user?.id) return false;
  if (user.is_admin) return true;
  return (ctx.grupovodje || []).some((g) => g.korisnik_id === user.id)
    || (ctx.sekcije || []).some((s) => s.aktivno !== false && (s.grupovodja_id === user.id || s.lovocuvar_id === user.id))
    || (ctx.lovocuvari || []).some((l) => l.korisnik_id === user.id);
}

export function creationMode(status) {
  if (['admin', 'grupovodja', 'lovocuvar'].includes(status)) return 'direct';
  return status === 'clan' ? 'predlog' : null;
}

const TEKST = {
  admin: 'Administrator: puni pristup',
  grupovodja: 'Ti si grupovođa ove sekcije',
  lovocuvar: 'Ti si lovočuvar revira: pratiš sekciju (bez upravljanja)',
  clan: 'Član sekcije',
  ceka: 'Zahtjev čeka odobrenje grupovođe',
  nema: 'Nema pristupa — zatraži ga od grupovođe',
};

export function pristupText(status) {
  return TEKST[status] || '';
}

export function canManage(sekcija, user) {
  return Boolean(user && (user.is_admin || sekcija.grupovodja_id === user.id));
}

export function creatableRevirIds(user, grupovodje, reviri) {
  if (user?.is_admin) return reviri.map((r) => r.id);
  return [...new Set(grupovodje.filter((g) => g.korisnik_id === user?.id).map((g) => g.revir_id))];
}

export function groupByRevir(reviri, sekcije) {
  return reviri.map((revir) => ({ revir, sekcije: sekcije.filter((s) => s.revir_id === revir.id && s.aktivno !== false) }));
}

export function pendingRequests(sekcijaId, clanovi) {
  return clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'ceka');
}

// Lovci koje grupovođa može dodati: odobreni, a još nisu u sekciji ni imaju zahtjev.
export function candidatesToAdd(sekcija, clanovi, users) {
  const taken = new Set(clanovi.filter((c) => c.sekcija_id === sekcija.id).map((c) => c.korisnik_id));
  if (sekcija.grupovodja_id) taken.add(sekcija.grupovodja_id);
  if (sekcija.lovocuvar_id) taken.add(sekcija.lovocuvar_id);
  return users.filter((u) => !taken.has(u.id));
}

export function validateSekcija({ naziv, revir_id }) {
  if (String(naziv ?? '').trim().length < 2) return 'Upiši naziv sekcije (bar 2 znaka)';
  if (!revir_id) return 'Izaberi revir';
  return null;
}

export function mySectionsAsLeader(sekcije, myId) {
  return sekcije.filter((s) => s.grupovodja_id === myId && s.aktivno !== false);
}

// ---- pregled sekcija (v0.5.8) ----

// "Moje" sekcije: u kojima sam član/grupovođa/lovočuvar ili čekam odobrenje. Admin je u svakoj sekciji sa punim pristupom,
// pa su za njega "moje" samo one u kojima je i izričito grupovođa ili član.
export function isMine(sekcija, clanovi, myId, isAdmin = false, lovocuvari = []) {
  const st = myStatus(sekcija, clanovi, myId, isAdmin, lovocuvari);
  if (st === 'admin') {
    return sekcija.grupovodja_id === myId || clanovi.some((c) => c.sekcija_id === sekcija.id && c.korisnik_id === myId);
  }
  return st !== 'nema';
}

// Zahtjevi koje JA smijem odobriti (grupovođa svoje sekcije, admin sve): [{sekcija, zahtjev}] najstariji prvi.
export function approvalsForMe(data, user) {
  const out = [];
  for (const s of data.sekcije.filter((x) => x.aktivno !== false && canManage(x, user))) {
    for (const z of pendingRequests(s.id, data.clanovi)) out.push({ sekcija: s, zahtjev: z });
  }
  return out.sort((a, b) => String(a.zahtjev.created_at || '9999').localeCompare(String(b.zahtjev.created_at || '9999'))); // bez datuma ide na kraj
}

export function sectionsOverview(data, user) {
  const aktivne = data.sekcije.filter((s) => s.aktivno !== false);
  const mine = aktivne.filter((s) => isMine(s, data.clanovi, user?.id, Boolean(user?.is_admin), data.lovocuvari));
  return {
    ukupno: aktivne.length,
    moje: mine.length,
    zaOdobrenje: approvalsForMe({ ...data, sekcije: aktivne }, user).length,
    mojiZahtjevi: aktivne.filter((s) => myStatus(s, data.clanovi, user?.id, false, data.lovocuvari) === 'ceka').length,
  };
}

export const SEKCIJE_FILTERI = [['moje', 'Moje'], ['zahtjevi', 'Za odobrenje'], ['slobodne', 'Bez pristupa'], ['sve', 'Sve']];

// Filter + pretraga sekcija. `textOf(s)` daje tekst za pretragu (naziv, revir, grupovođa, članovi...).
export function filterSections(data, user, { filter = 'sve', q = '', textOf = () => '', match = (fields, query) => fields.join(' ').toLowerCase().includes(String(query).toLowerCase()) } = {}) {
  const id = user?.id;
  const admin = Boolean(user?.is_admin);
  return data.sekcije.filter((s) => s.aktivno !== false).filter((s) => {
    if (filter === 'moje') return isMine(s, data.clanovi, id, admin, data.lovocuvari);
    if (filter === 'zahtjevi') return canManage(s, user) && pendingRequests(s.id, data.clanovi).length > 0;
    if (filter === 'slobodne') return myStatus(s, data.clanovi, id, false, data.lovocuvari) === 'nema';
    return true;
  }).filter((s) => !q || match([s.naziv, textOf(s)], q));
}

// Kratki tekst za pločicu u Meniju.
export function menuSummary(data, user) {
  const o = sectionsOverview(data, user);
  if (o.zaOdobrenje) return `${o.zaOdobrenje} ${o.zaOdobrenje === 1 ? 'zahtjev čeka' : 'zahtjeva čeka'} tvoje odobrenje`;
  if (o.mojiZahtjevi) return 'Tvoj zahtjev čeka odobrenje';
  if (o.moje) return `Moje sekcije: ${o.moje}`;
  return 'Članstvo i odobrenja';
}

// Ko vidi više sekcija odjednom (admin: sve revire, lovočuvar: svoj revir) dobija tab "Sekcije" sa spiskom;
// grupovođa i lovac vide svoju sekciju (pristup ionako provodi server).
export function seesSectionList(user, ctx = {}) {
  if (!user?.id) return false;
  if (user.is_admin) return true;
  return (ctx.lovocuvari || []).some((l) => l.korisnik_id === user.id)
    || (ctx.sekcije || []).some((x) => x.aktivno !== false && x.lovocuvar_id === user.id);
}

// Sekcije po reviru (revir po nazivu, pa sekcija po nazivu): [{ revir, sekcije }].
export function groupSectionsByRevir(sekcije, reviri = []) {
  const by = new Map();
  for (const x of sekcije) {
    const r = reviri.find((v) => v.id === x.revir_id);
    const key = r?.naziv || '';
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(x);
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'bs'))
    .map(([revir, list]) => ({ revir, sekcije: list.sort((a, b) => a.naziv.localeCompare(b.naziv, 'bs')) }));
}
