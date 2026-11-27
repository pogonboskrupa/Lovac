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
    // grupovođa je član svoje grupe i kad mu red u članstvu nema grupu
    if (g.grupovodja_id && !clanoviGrupe.some((c) => c.id === g.grupovodja_id)) clanoviGrupe.push({ id: g.grupovodja_id, ime: nameOf(g.grupovodja_id) });
    clanoviGrupe.sort((a, b) => Number(b.id === g.grupovodja_id) - Number(a.id === g.grupovodja_id) || a.ime.localeCompare(b.ime, 'bs'));
    return { id: g.id, grupovodja_id: g.grupovodja_id, grupovodja: nameOf(g.grupovodja_id), dozvola: Boolean(g.dozvola_visih), clanovi: clanoviGrupe };
  }).sort((a, b) => a.grupovodja.localeCompare(b.grupovodja, 'bs'));
}

// Ko je već u nekoj grupi (bilo koje sekcije: kao grupovođa ili član) — takav se ne nudi za dodavanje u drugu grupu dok ga se ne izvadi.
export function groupedIds(grupe = [], clanovi = []) {
  const ids = new Set(grupe.map((g) => g.id));
  const out = new Set(grupe.map((g) => g.grupovodja_id));
  for (const c of clanovi) if (c.status === 'odobren' && c.grupa_id && ids.has(c.grupa_id)) out.add(c.korisnik_id);
  out.delete(null); out.delete(undefined);
  return out;
}

// Odobreni članovi sekcije koji nisu ni u jednoj (postojećoj) grupi; `izvan` = admin ih je sklonio iz pregleda (migracija 049).
export function ungroupedMembers(sekcijaId, grupe = [], clanovi = [], nameOf = () => '', izvan = []) {
  const skip = new Set(izvan.map((x) => x.korisnik_id ?? x));
  const gs = grupe.filter((g) => g.sekcija_id === sekcijaId);
  const ids = new Set(gs.map((g) => g.id));
  const vode = new Set(gs.map((g) => g.grupovodja_id));
  return clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'odobren' && !ids.has(c.grupa_id) && !vode.has(c.korisnik_id) && !skip.has(c.korisnik_id))
    .map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id), zeljena: c.zeljena_grupa_id || null }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'bs'));
}

// Ko može postati grupovođa nove grupe: odobreni član sekcije koji već ne vodi grupu u njoj.
export function groupLeaderCandidates(sekcijaId, grupe = [], clanovi = [], nameOf = () => '', izvan = []) {
  const skip = new Set([...groupedIds(grupe, clanovi), ...izvan.map((x) => x.korisnik_id ?? x)]);
  return clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'odobren' && !skip.has(c.korisnik_id))
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
