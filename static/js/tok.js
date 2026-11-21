// Tok lova: događaji u lovu koji je u toku (čista logika).

export const LEADER_EVENTS = {
  pocetak_pogona: 'Početak pogona',
  kraj_pogona: 'Kraj pogona',
  okupljanje: 'Okupljanje',
  prekid: 'PREKID LOVA — svi staju',
};

export const MEMBER_EVENTS = {
  na_stanu: 'Na stanu',
  napustio_stan: 'Napustio stan',
  pauza: 'Pauza',
};

export const EVENT_LABELS = { ...LEADER_EVENTS, ...MEMBER_EVENTS };

// Vođa: organizator lova, uloga 'vodja' u lovu ili admin. Server to provjerava; ovo samo bira šta se prikazuje.
export function canLead(lov, myId, isAdmin) {
  if (isAdmin) return true;
  return lov?.lov?.organizator_id === myId || Boolean(lov?.ucesnici?.some((u) => u.korisnik_id === myId && u.uloga === 'vodja'));
}

export function newDogadjaj({ id, lovId, autorId, vrsta, tekst = null, fix = null, now = new Date() }) {
  if (!EVENT_LABELS[vrsta]) throw new Error(`Nepoznata vrsta događaja: ${vrsta}`);
  return {
    id, lov_id: lovId, autor_id: autorId, vrsta, tekst: tekst ? String(tekst).slice(0, 200) : null,
    lat: fix?.lat ?? null, lon: fix?.lon ?? null, created_at: now.toISOString(),
  };
}

export function mergeDogadjaji(local, remote) {
  const byId = new Map();
  for (const e of [...local, ...remote]) byId.set(e.id, { ...byId.get(e.id), ...e });
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id.localeCompare(b.id)));
}

// Stanje pogona iz zadnje komande: 'prekid' > 'pogon' (od početka) > 'kraj' / 'nije'.
export function driveState(events) {
  const cmds = events.filter((e) => LEADER_EVENTS[e.vrsta] && e.vrsta !== 'okupljanje');
  const last = cmds[cmds.length - 1];
  if (!last) return { stanje: 'nije', od: null };
  if (last.vrsta === 'prekid') return { stanje: 'prekid', od: last.created_at };
  if (last.vrsta === 'pocetak_pogona') return { stanje: 'pogon', od: last.created_at };
  return { stanje: 'kraj', od: last.created_at };
}

// Prekid se poništava tek novim početkom pogona (vođa mora izričito ponovo pokrenuti).
export function memberStatus(events, userId) {
  const mine = events.filter((e) => e.autor_id === userId && MEMBER_EVENTS[e.vrsta]);
  const last = mine[mine.length - 1];
  if (!last) return { stanje: 'nema', t: null };
  return { stanje: { na_stanu: 'na-stanu', napustio_stan: 'u-pokretu', pauza: 'pauza' }[last.vrsta], t: last.created_at };
}

export function elapsedText(fromIso, now = Date.now()) {
  const min = Math.max(0, Math.floor((now - Date.parse(fromIso)) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

// Događaji drugih koji traže pažnju (komande vođe), a još nisu viđeni.
export function alertsFor(events, myId, seen) {
  return events.filter((e) => e.autor_id !== myId && LEADER_EVENTS[e.vrsta] && !seen.has(e.id));
}

export function isRlsDenied(message) {
  return /row-level security|permission denied|insufficient/i.test(String(message));
}
