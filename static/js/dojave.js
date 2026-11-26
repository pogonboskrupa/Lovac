// "Prijavi lovočuvaru" (čista logika): vrste dojava, nova dojava, revir kojem ide, redoslijed za lovočuvara.

export const DOJAVA_VRSTE = [
  { kod: 'krivolov', naziv: 'Krivolov', opis: 'Pucnji, svjetla, nepoznati lovci, vozilo' },
  { kod: 'ubijena', naziv: 'Ubijena divljač', opis: 'Pronađeno mrtvo grlo' },
  { kod: 'ranjena', naziv: 'Ranjena divljač', opis: 'Ranjeno ili bolesno grlo' },
  { kod: 'zamka', naziv: 'Zamka ili otrov', opis: 'Sajla, zamka, otrovan mamac' },
  { kod: 'pas', naziv: 'Pas lutalica', opis: 'Psi koji gone divljač' },
  { kod: 'ostalo', naziv: 'Ostalo', opis: 'Šteta, otpad, oštećen objekat…' },
];
export const DOJAVA_STATUS = { nova: 'Nova', preuzeta: 'Preuzeta', rijesena: 'Riješena' };
export const vrstaNaziv = (kod) => DOJAVA_VRSTE.find((v) => v.kod === kod)?.naziv || 'Dojava';

export function validateDojava({ vrsta, revir_id: revir, lat, lon }) {
  if (!DOJAVA_VRSTE.some((v) => v.kod === vrsta)) return 'Izaberi šta prijavljuješ';
  if (!revir) return 'Izaberi revir (lovočuvar kojem ide dojava)';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Nema lokacije — uključi GPS ili odaberi na karti';
  return null;
}

export function newDojava({ id, autorId, vrsta, revirId, opis = '', lat, lon, slika = null, now = new Date() }) {
  return {
    id, autor_id: autorId, revir_id: revirId, vrsta,
    opis: String(opis || '').trim().slice(0, 1000) || null,
    lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6,
    slika, created_at: now.toISOString(), status: 'nova', sinhronizovano: false,
  };
}

// Revir za dojavu: revir moje sekcije (prve), inače revir u kojem sam lovočuvar, inače nijedan (lovac bira).
export function defaultRevir(ctx = {}, myId) {
  const clan = (ctx.clanovi || []).find((c) => c.korisnik_id === myId && c.status === 'odobren');
  const sek = (ctx.sekcije || []).find((s) => s.id === clan?.sekcija_id || s.grupovodja_id === myId);
  if (sek) return sek.revir_id;
  return (ctx.lovocuvari || []).find((l) => l.korisnik_id === myId)?.revir_id || null;
}

// Lovočuvar (ili admin) obrađuje dojave: revira u kojima je lovočuvar; admin sve.
export function keeperRevirs(ctx = {}, me = null) {
  if (!me?.id) return [];
  if (me.is_admin) return (ctx.reviri || []).map((r) => r.id);
  return [...new Set((ctx.lovocuvari || []).filter((l) => l.korisnik_id === me.id).map((l) => l.revir_id))];
}

const STATUS_RED = { nova: 0, preuzeta: 1, rijesena: 2 };
// Za lovočuvara: nove prve, pa preuzete, pa riješene; unutar toga najnovije prve.
export function sortForKeeper(list = []) {
  return [...list].sort((a, b) => (STATUS_RED[a.status] ?? 9) - (STATUS_RED[b.status] ?? 9)
    || String(b.created_at).localeCompare(String(a.created_at)));
}

export function mergeDojave(local = [], remote = []) {
  const by = new Map(local.map((d) => [d.id, d]));
  for (const r of remote) by.set(r.id, { ...by.get(r.id), ...r, sinhronizovano: true });
  return [...by.values()];
}

// Šta je novo za obavijest: tuđe nove dojave mog revira (lovočuvar) i promjene statusa mojih (autor).
export function dojavaAlerts(prev = [], next = [], { myId, revirs = [] } = {}) {
  const old = new Map(prev.map((d) => [d.id, d]));
  return next.filter((d) => {
    const p = old.get(d.id);
    if (d.autor_id !== myId && revirs.includes(d.revir_id)) return !p && d.status === 'nova';
    if (d.autor_id === myId) return p && p.status !== d.status;
    return false;
  });
}

// Ko smije ukloniti dojavu: autor svoju, lovočuvar revira i admin (server provodi isto kroz RLS).
export function canRemoveDojava(d, myId, keeperRevirIds = [], isAdmin = false) {
  if (!d || !myId) return false;
  return d.autor_id === myId || isAdmin || keeperRevirIds.includes(d.revir_id);
}

// Uklonjene (mekano) se ne prikazuju nigdje.
export const liveDojave = (list = []) => list.filter((d) => !d.uklonjena);
