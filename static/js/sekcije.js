// Čista logika sekcija: status pristupa, ko upravlja, grupisanje po reviru.
// Pristup provodi SERVER (migracija 008); ovdje se samo prikazuje šta je dozvoljeno.

// Lovočuvar prati CIJELI revir (sve njegove sekcije); sekcija.lovocuvar_id je ranija, uža varijanta.
export function myStatus(sekcija, clanovi, myId, isAdmin = false, lovocuvari = []) {
  if (isAdmin) return 'admin';
  if (sekcija.grupovodja_id === myId) return 'grupovodja';
  if (sekcija.lovocuvar_id === myId || lovocuvari.some((l) => l.revir_id === sekcija.revir_id && l.korisnik_id === myId)) return 'lovocuvar';
  const c = clanovi.find((x) => x.sekcija_id === sekcija.id && x.korisnik_id === myId);
  if (!c) return 'nema';
  return c.status === 'odobren' ? 'clan' : 'ceka';
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
