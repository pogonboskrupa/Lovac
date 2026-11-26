// Grupe unutar sekcije (čista logika): grupa nema naziv, prepoznaje se po grupovođi; lovac je u jednoj grupi po sekciji
// (`sekcija_clanovi.grupa_id`). Server (migracija 045: `grupe`, `dodijeli_grupu`) provodi prava, ovdje se samo prikazuje.

// Ko smije praviti grupe i raspoređivati: lovovođa sekcije (st = grupovodja), admin, lovovođa revira i lovovođa društva.
export function canManageGroups(st, { myId, sekcija, revirVodje = [], drustvoUloge = [] } = {}) {
  if (st === 'admin' || st === 'grupovodja') return true;
  if (drustvoUloge.some((u) => u.korisnik_id === myId && u.uloga === 'lovovodja_drustva')) return true;
  return Boolean(sekcija && revirVodje.some((v) => v.korisnik_id === myId && v.revir_id === sekcija.revir_id));
}

// Grupe jedne sekcije sa odobrenim članovima; grupovođa grupe je prvi u svojoj grupi. nameOf(id) daje ime.
export function groupsOfSection(sekcijaId, grupe = [], clanovi = [], nameOf = () => '') {
  const odobreni = clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'odobren');
  return grupe.filter((g) => g.sekcija_id === sekcijaId).map((g) => {
    const clanoviGrupe = odobreni.filter((c) => c.grupa_id === g.id).map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id) }));
    clanoviGrupe.sort((a, b) => Number(b.id === g.grupovodja_id) - Number(a.id === g.grupovodja_id) || a.ime.localeCompare(b.ime, 'bs'));
    return { id: g.id, grupovodja_id: g.grupovodja_id, grupovodja: nameOf(g.grupovodja_id), dozvola: Boolean(g.dozvola_visih), clanovi: clanoviGrupe };
  }).sort((a, b) => a.grupovodja.localeCompare(b.grupovodja, 'bs'));
}

// Odobreni članovi sekcije koji nisu ni u jednoj (postojećoj) grupi.
export function ungroupedMembers(sekcijaId, grupe = [], clanovi = [], nameOf = () => '') {
  const ids = new Set(grupe.filter((g) => g.sekcija_id === sekcijaId).map((g) => g.id));
  return clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'odobren' && !ids.has(c.grupa_id))
    .map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id) }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'bs'));
}

// Ko može postati grupovođa nove grupe: odobreni član sekcije koji već ne vodi grupu u njoj.
export function groupLeaderCandidates(sekcijaId, grupe = [], clanovi = [], nameOf = () => '') {
  const vode = new Set(grupe.filter((g) => g.sekcija_id === sekcijaId).map((g) => g.grupovodja_id));
  return clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'odobren' && !vode.has(c.korisnik_id))
    .map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id) }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'bs'));
}

// U koje grupe smijem rasporediti: upravljač u sve, grupovođa samo u svoju.
export function assignableGroups(groups, { manage, myId }) {
  return manage ? groups : groups.filter((g) => g.grupovodja_id === myId);
}

// Moja grupa u sekciji (za prikaz "tvoja grupa"): { id, grupovodja } ili null.
export function myGroup(sekcijaId, myId, grupe = [], clanovi = [], nameOf = () => '') {
  const c = clanovi.find((x) => x.sekcija_id === sekcijaId && x.korisnik_id === myId && x.status === 'odobren');
  const g = c && grupe.find((x) => x.id === c.grupa_id && x.sekcija_id === sekcijaId);
  return g ? { id: g.id, grupovodja: nameOf(g.grupovodja_id) } : null;
}
