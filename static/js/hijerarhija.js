// Hijerarhija vodstva (čista logika): lovočuvari (najviše 2) i lovovođa društva (1) na nivou društva,
// lovovođa revira (1 po reviru), lovovođa sekcije (sekcije.grupovodja_id) i grupovođa grupe.
// Server (migracija 045) provodi ograničenja; ovdje se samo prikazuje i unaprijed objašnjava.

export const MAX_LOVOCUVARA = 2;
export const MAX_LOVOVODJA_DRUSTVA = 1;
export const ULOGA_LOVOCUVAR = 'lovocuvar';
export const ULOGA_LOVOVODJA_DRUSTVA = 'lovovodja_drustva';
export const ULOGA_PREDSJEDNIK = 'predsjednik';

// Lovočuvari društva važe za SVAKI revir (isti oblik kao stari revir_lovocuvari, pa ostali kod radi nepromijenjen).
export function expandKeepers(revirKeepers = [], drustvoUloge = [], reviri = []) {
  const out = [...revirKeepers];
  for (const u of drustvoUloge.filter((x) => x.uloga === ULOGA_LOVOCUVAR)) {
    for (const r of reviri) {
      if (!out.some((k) => k.korisnik_id === u.korisnik_id && k.revir_id === r.id)) out.push({ korisnik_id: u.korisnik_id, revir_id: r.id, drustvo: true });
    }
  }
  return out;
}

export const rolesOf = (userId, drustvoUloge = []) => drustvoUloge.filter((u) => u.korisnik_id === userId).map((u) => u.uloga);

// Može li korisnik postati lovočuvar / lovovođa društva (i ko mu zauzima mjesto).
export function drustvoSlot(userId, uloga, drustvoUloge = [], nameOf = () => '') {
  const limit = uloga === ULOGA_LOVOCUVAR ? MAX_LOVOCUVARA : 1;
  const rows = drustvoUloge.filter((u) => u.uloga === uloga);
  const ima = rows.some((u) => u.korisnik_id === userId);
  const drugi = rows.filter((u) => u.korisnik_id !== userId);
  return { ima, slobodno: ima || rows.length < limit, zauzeli: drugi.map((u) => nameOf(u.korisnik_id)).filter(Boolean), limit };
}

// Reviri za koje korisnik još nije lovovođa; uz svaki ko je sadašnji lovovođa (imenovanje ga zamjenjuje).
export function revirVodjaTargets(userId, reviri = [], revirVodje = [], nameOf = () => '') {
  return reviri.filter((r) => r.aktivno !== false && !revirVodje.some((v) => v.revir_id === r.id && v.korisnik_id === userId))
    .map((r) => {
      const trenutni = revirVodje.find((v) => v.revir_id === r.id);
      return { id: r.id, tekst: r.naziv, trenutni: trenutni ? nameOf(trenutni.korisnik_id) : '', trenutniId: trenutni?.korisnik_id || null };
    });
}

export const NAZIVI_ULOGA = {
  [ULOGA_PREDSJEDNIK]: 'Predsjednik',
  [ULOGA_LOVOCUVAR]: 'Lovočuvar društva',
  [ULOGA_LOVOVODJA_DRUSTVA]: 'Lovovođa društva',
  vodja_revira: 'Lovovođa revira',
};

// Čipovi uloga na nivou društva i revira za jednog korisnika.
export function hierarchyChips(userId, { drustvoUloge = [], revirVodje = [], reviri = [] } = {}) {
  const out = [];
  for (const u of drustvoUloge.filter((x) => x.korisnik_id === userId)) out.push({ kod: u.uloga, tekst: NAZIVI_ULOGA[u.uloga] || u.uloga });
  for (const v of revirVodje.filter((x) => x.korisnik_id === userId)) {
    out.push({ kod: 'vodja_revira', tekst: `${NAZIVI_ULOGA.vodja_revira} · ${reviri.find((r) => r.id === v.revir_id)?.naziv || 'revir'}` });
  }
  return out;
}
