// Odaziv na lov (čista logika): na koje lovove pitati "Dolaziš?", red slanja odgovora i sažetak za lovovođu sekcije.
// Server provodi isto pravilo kao samoprijava (moze_prijaviti_prisustvo): odobreni član sekcije lova,
// lov planiran ili u toku; ovdje se samo bira šta pokazati.

export const ODAZIV_KEY = 'lovac.odaziv';        // { [lovId]: { odgovor: 'da'|'ne', t } } — moji odgovori
export const ODAZIV_RED_KEY = 'lovac.odaziv.red'; // [{ lovId, odgovor, t }] — čeka slanje
export const ODAZIV_JAVLJENO_KEY = 'lovac.odaziv.javljeno'; // id-evi lovova za koje je obavijest već prikazana

const approvedIn = (sekcijaId, clanovi, myId) => clanovi.some((c) => c.sekcija_id === sekcijaId && c.korisnik_id === myId && c.status === 'odobren');

// lovovi: zapisi iz keša ({ id, lov, ucesnici }); vraća lovove na koje treba odgovoriti, najbliži datum prvi.
export function huntsToAsk(lovovi = [], { myId, clanovi = [], odgovori = {}, odlozeni = [], today } = {}) {
  if (!myId) return [];
  return lovovi.filter((r) => {
    const l = r?.lov;
    if (!l?.sekcija_id || !['planiran', 'u_toku'].includes(l.status)) return false;
    if (today && String(l.datum) < today) return false;
    if (l.organizator_id === myId) return false;
    if ((r.ucesnici || []).some((u) => u.korisnik_id === myId)) return false;
    if (odgovori[r.id] || odlozeni.includes(r.id)) return false;
    return approvedIn(l.sekcija_id, clanovi, myId);
  }).sort((a, b) => String(a.lov.datum).localeCompare(String(b.lov.datum)));
}

// Isti lov ima jedan odgovor u redu: zadnji pobjeđuje (promjena Da → Ne prije slanja).
export function queueAnswer(red = [], lovId, odgovor, t = Date.now()) {
  return [...red.filter((x) => x.lovId !== lovId), { lovId, odgovor, t }];
}

export const dropAnswer = (red = [], item) => red.filter((x) => !(x.lovId === item.lovId && x.t === item.t));

// Nema tabele na serveru (migracija 034 nije pokrenuta): odgovor čeka u redu, nije odbijen.
export const tableMissing = (err) => ['PGRST205', '42P01'].includes(err?.code);
// Server odbio (lov završen, nisam član, uklonjen iz lova): izbaciti iz reda da ne visi zauvijek.
export const answerRejected = (err) => ['42501', 'PGRST301'].includes(err?.code) || /row-level security/i.test(err?.message || '');

// Za lovovođu sekcije: ko je rekao Da / Ne (Da = i samoprijava u učesnicima).
export function answersSummary(rows = [], nameOf = (id) => id) {
  const da = rows.filter((r) => r.odgovor === 'da').map((r) => nameOf(r.korisnik_id)).sort((a, b) => a.localeCompare(b, 'bs'));
  const ne = rows.filter((r) => r.odgovor === 'ne').map((r) => nameOf(r.korisnik_id)).sort((a, b) => a.localeCompare(b, 'bs'));
  return { da, ne, tekst: rows.length ? `Dolazi: ${da.length} · Ne dolazi: ${ne.length}` : 'Još niko nije odgovorio' };
}
