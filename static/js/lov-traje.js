// Organizacija lova iz ploče "+" (čista logika): ko smije dodati lov, šta "+" nudi i pregled učesnika
// u lovu koji traje (svježina pozicije, poruke i slike svakog lovca).
import { myStatus } from './sekcije.js';
import { freshnessOf } from './istrazivac-pregled.js';

// Lovovođa revira (svog revira) i lovovođa društva (svakog) organizuju lov u cijelom reviru (migracija 045).
export function leadsRevir(ctx = {}, me = null, revirId) {
  if (!me?.id) return false;
  return (ctx.drustvoUloge || []).some((u) => u.korisnik_id === me.id && u.uloga === 'lovovodja_drustva')
    || (ctx.revirVodje || []).some((v) => v.korisnik_id === me.id && v.revir_id === revirId);
}

const sectionRank = (s, ctx, me) => myStatus(s, ctx.clanovi || [], me.id, Boolean(me.is_admin), ctx.lovocuvari || []);
const ledGroups = (s, ctx, me) => (ctx.grupe || []).filter((g) => g.sekcija_id === s.id && g.grupovodja_id === me.id);

// Za šta u sekciji smijem praviti lov: cijela sekcija (lovovođa sekcije, revira, društva, admin) i/ili grupe:
// svoja (grupovođa), a tuđa samo uz dopuštenje grupovođe (lovovođa revira uvijek). Server to isto provjerava (RLS).
export function huntTargets(s, ctx = {}, me = null, nameOf = (id) => id) {
  if (!me?.id || !s) return [];
  const st = sectionRank(s, ctx, me);
  const lead = leadsRevir(ctx, me, s.revir_id);
  const wide = ['grupovodja', 'admin'].includes(st) || lead;
  // Lov se pravi na nivou GRUPE (odluka vlasnika), pa su grupe prve (zadani izbor); cijela sekcija je izuzetak na kraju.
  const out = [];
  for (const g of (ctx.grupe || []).filter((x) => x.sekcija_id === s.id)) {
    if (g.grupovodja_id === me.id || lead || (wide && g.dozvola_visih)) out.push({ grupaId: g.id, tekst: `Grupa — grupovođa ${nameOf(g.grupovodja_id)}` });
  }
  if (wide) out.push({ grupaId: null, tekst: 'Cijela sekcija' });
  return out;
}

// Lov dodaju lovovođa sekcije svoje sekcije, lovovođa revira/društva, grupovođa (za svoju grupu) i administrator.
export function organizableSections(ctx = {}, me = null) {
  if (!me?.id) return [];
  return (ctx.sekcije || []).filter((s) => s.aktivno !== false && huntTargets(s, ctx, me).length > 0)
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

// Upravlja lovom: organizator lova i oni koje server pušta (`moze_praviti_lov`). Lov grupe: grupovođa, lovovođa revira,
// a lovovođa sekcije/društva i admin samo uz dopuštenje grupovođe; lov cijele sekcije: i administrator.
export function canManageHunt(rec, ctx = {}, me = null) {
  if (!rec?.lov || !me?.id) return false;
  const lov = rec.lov;
  if (lov.grupa_id) {
    const g = (ctx.grupe || []).find((x) => x.id === lov.grupa_id);
    if (g?.grupovodja_id === me.id || leadsRevir(ctx, me, lov.revir_id)) return true;
    const s = (ctx.sekcije || []).find((x) => x.id === lov.sekcija_id);
    return Boolean(g?.dozvola_visih && s && (me.is_admin || sectionRank(s, ctx, me) === 'grupovodja'));
  }
  if (me.is_admin || lov.organizator_id === me.id || leadsRevir(ctx, me, lov.revir_id)) return true;
  const s = (ctx.sekcije || []).find((x) => x.id === lov.sekcija_id);
  return Boolean(s && sectionRank(s, ctx, me) === 'grupovodja');
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
