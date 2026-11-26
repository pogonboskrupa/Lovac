// Organizacija lova iz ploče "+" (čista logika): ko smije dodati lov, šta "+" nudi i pregled učesnika
// u lovu koji traje (svježina pozicije, poruke i slike svakog lovca).
import { myStatus } from './sekcije.js';
import { freshnessOf } from './istrazivac-pregled.js';

// Lov dodaju lovovođa sekcije svoje sekcije i administrator (svaka sekcija); server to i provjerava (RLS).
export function organizableSections(ctx = {}, me = null) {
  if (!me?.id) return [];
  return (ctx.sekcije || []).filter((s) => s.aktivno !== false
    && ['grupovodja', 'admin'].includes(myStatus(s, ctx.clanovi || [], me.id, Boolean(me.is_admin), ctx.lovocuvari || [])))
    .sort((a, b) => String(a.naziv).localeCompare(String(b.naziv), 'bs'));
}

// "+": dok traje lov u kojem sam → "Lov traje"; lov planiran za danas → "Lov danas"; inače "Dodaj lov" ako smijem organizovati.
export function huntButtons({ aktivan = null, planiran = null, organizator = false } = {}) {
  if (aktivan) return { traje: true, planiran: false, dodaj: false };
  if (planiran) return { traje: false, planiran: true, dodaj: false };
  return { traje: false, planiran: false, dodaj: Boolean(organizator) };
}

const inHunt = (rec, myId) => rec?.lov?.organizator_id === myId || (rec?.ucesnici || []).some((u) => u.korisnik_id === myId);

// Današnji planirani (još nepokrenut) lov u kojem sam učesnik ili organizator; najnoviji ako ih je više.
export function todayPlannedHunt(lovovi = [], myId, today) {
  return lovovi.filter((r) => r.lov?.status === 'planiran' && r.lov.datum === today && inHunt(r, myId))
    .sort((a, b) => String(b.lov.created_at || b.lov.promijenjeno || '').localeCompare(String(a.lov.created_at || a.lov.promijenjeno || '')))[0] || null;
}

// Upravlja lovom: administrator, organizator lova i lovovođa sekcije lova (server to provjerava kroz RLS).
export function canManageHunt(rec, ctx = {}, me = null) {
  if (!rec?.lov || !me?.id) return false;
  if (me.is_admin || rec.lov.organizator_id === me.id) return true;
  return organizableSections(ctx, me).some((s) => s.id === rec.lov.sekcija_id);
}

// "Kao zadnji lov": lovci i uloge iz zadnjeg lova te sekcije (bez mene), za brže pravljenje novog.
export function lastHuntPreset(lovovi = [], sekcijaId, myId) {
  const zadnji = lovovi.filter((r) => r.lov?.sekcija_id === sekcijaId && (r.ucesnici || []).length > 1)
    .sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)) || String(b.lov.pocetak || '').localeCompare(String(a.lov.pocetak || '')))[0];
  if (!zadnji) return null;
  const ucesnici = zadnji.ucesnici.filter((u) => u.korisnik_id !== myId);
  return {
    naziv: zadnji.lov.naziv,
    ids: ucesnici.map((u) => u.korisnik_id),
    uloge: Object.fromEntries(ucesnici.map((u) => [u.korisnik_id, u.uloga === 'pogonic' ? 'pogonic' : 'strijelac'])),
  };
}

export const SVJEZINA_TEKST = { uzivo: 'Uživo', zastarjelo: 'Zastarjelo', 'bez-signala': 'Bez signala', nema: 'Ne dijeli lokaciju' };

// ucesnici: [{ id, ime, ulogaTekst, stan, ja }] (iz todayHuntSummary); pozicije: [{ korisnik_id, t }]
export function participantRows(ucesnici = [], { pozicije = [], poruke = [], slike = [], now = Date.now() } = {}) {
  return ucesnici.map((u) => {
    const p = pozicije.find((x) => x.korisnik_id === u.id);
    const t = p ? Date.parse(p.t) : NaN;
    const svjezina = u.ja ? 'ja' : Number.isFinite(t) && now - t <= 30 * 60000 ? freshnessOf((now - t) / 60000) : 'nema';
    const moje = poruke.filter((m) => m.autor_id === u.id);
    return {
      ...u,
      svjezina,
      pozicija: p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? { lat: p.lat, lon: p.lon } : null,
      poruka: moje.length,
      zadnjaPoruka: moje.length ? moje[moje.length - 1] : null,
      slika: slike.filter((s) => s.autor_id === u.id).length,
    };
  });
}

// Poruke lova: samo one poslane u ovom lovu, po vremenu.
export function huntMessages(poruke = [], lovId) {
  return poruke.filter((m) => m.lov_id === lovId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// Slike lova: poslane (server/keš) + one koje čekaju slanje, bez duplikata, najnovije prve.
export function huntPhotos(slike = [], cekaju = []) {
  const by = new Map();
  for (const s of slike) by.set(s.id, { ...s, ceka: false });
  for (const s of cekaju) if (!by.has(s.id)) by.set(s.id, { ...s, ceka: true });
  return [...by.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
