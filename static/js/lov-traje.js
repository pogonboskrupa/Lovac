// Organizacija lova iz ploče "+" (čista logika): ko smije dodati lov, šta "+" nudi i pregled učesnika
// u lovu koji traje (svježina pozicije, poruke i slike svakog lovca).
import { myStatus } from './sekcije.js';
import { freshnessOf } from './istrazivac-pregled.js';

// Lov dodaju grupovođa svoje sekcije i administrator (svaka sekcija); server to i provjerava (RLS).
export function organizableSections(ctx = {}, me = null) {
  if (!me?.id) return [];
  return (ctx.sekcije || []).filter((s) => s.aktivno !== false
    && ['grupovodja', 'admin'].includes(myStatus(s, ctx.clanovi || [], me.id, Boolean(me.is_admin), ctx.lovocuvari || [])))
    .sort((a, b) => String(a.naziv).localeCompare(String(b.naziv), 'bs'));
}

// "+" nudi "Lov traje" dok traje lov u kojem sam; inače "Dodaj lov" ako smijem organizovati.
export function huntButtons({ aktivan = null, organizator = false } = {}) {
  if (aktivan) return { traje: true, dodaj: false };
  return { traje: false, dodaj: Boolean(organizator) };
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
