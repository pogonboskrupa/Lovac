// Pregled po ulozi (čista logika): ko je gledalac (administrator, lovočuvar, lovovođa sekcije, lovac) i agregati prijavljenog ulova.
// Šta ko vidi provodi SERVER (RLS na ulov_prijave); ovdje se samo sabira ono što je stiglo.

export const ULOGE_OPIS = {
  admin: { naziv: 'Administrator', opis: 'Cijelo društvo: svi reviri, sekcije, prijavljeni ulovi i statistike. Ne vidi privatne zapise lovaca, samo ono što je prijavljeno.' },
  lovocuvar: { naziv: 'Lovočuvar', opis: 'Prati stanje svog revira: sekcije, prijavljene ulove i aktivnost. Ostale revire ne vidi.' },
  grupovodja: { naziv: 'Lovovođa sekcije', opis: 'Vodi sekciju: članovi, lovovi i prijavljeni ulovi njegove sekcije.' },
  lovac: { naziv: 'Lovac', opis: 'Radi unutar sekcije: evidencija, lov i prijava ulova društvu.' },
};

// Najviša uloga; `ctx` je keš sekcija. Uloga se izvodi iz podataka, nikad iz imena.
export function viewerRole(me, ctx = {}) {
  if (!me?.id || !me.odobren) return 'lovac';
  if (me.is_admin) return 'admin';
  const reviri = (ctx.lovocuvari || []).filter((l) => l.korisnik_id === me.id).map((l) => l.revir_id);
  const sekLc = (ctx.sekcije || []).filter((s) => s.lovocuvar_id === me.id).map((s) => s.revir_id);
  if (reviri.length || sekLc.length) return 'lovocuvar';
  if ((ctx.sekcije || []).some((s) => s.aktivno !== false && s.grupovodja_id === me.id)) return 'grupovodja';
  return 'lovac';
}

export const activeReports = (rows) => rows.filter((r) => !r.povucena);

export function reportYears(rows) {
  return [...new Set(rows.map((r) => new Date(r.vrijeme).getFullYear()))].sort((a, b) => b - a);
}

export function byYear(rows, year) {
  return year == null || year === 'sve' ? rows : rows.filter((r) => new Date(r.vrijeme).getFullYear() === Number(year));
}

export function totals(rows) {
  return {
    komada: rows.length,
    kg: Math.round(rows.reduce((s, r) => s + (Number(r.tezina) || 0), 0) * 10) / 10,
    vrsta: new Set(rows.map((r) => r.vrsta)).size,
    lovaca: new Set(rows.map((r) => r.lovac_id)).size,
  };
}

// Grupisanje po ključu (revir_id, sekcija_id, vrsta, lovac_id): najviše ulova prvo.
export function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] ?? null;
    const g = m.get(k) || { kljuc: k, komada: 0, kg: 0 };
    g.komada += 1;
    g.kg = Math.round((g.kg + (Number(r.tezina) || 0)) * 10) / 10;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.komada - a.komada || b.kg - a.kg);
}

export function byMonth(rows, year) {
  const out = Array(12).fill(0);
  for (const r of byYear(rows, year)) out[new Date(r.vrijeme).getMonth()] += 1;
  return out;
}

export function latestReports(rows, n = 10) {
  return [...rows].sort((a, b) => String(b.prijavljeno || b.vrijeme).localeCompare(String(a.prijavljeno || a.vrijeme))).slice(0, n);
}

// Brojke društva za administratora iz keša sekcija.
export function societyFigures(ctx) {
  const sek = (ctx.sekcije || []).filter((s) => s.aktivno !== false);
  const members = new Set((ctx.clanovi || []).filter((c) => c.status === 'odobren').map((c) => c.korisnik_id));
  return {
    reviri: (ctx.reviri || []).filter((r) => r.aktivno !== false).length,
    sekcija: sek.length,
    clanova: members.size,
    lovocuvara: new Set((ctx.lovocuvari || []).map((l) => l.korisnik_id)).size,
    grupovodja: new Set(sek.map((s) => s.grupovodja_id).filter(Boolean)).size,
  };
}

// Server vraća najviše ~1000 redova po zahtjevu: stranice se čitaju dok ne stigne kraća od `size`.
export async function collectPages(fetchPage, size = 1000, maxPages = 100) {
  const all = [];
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(i * size, i * size + size - 1);
    all.push(...page);
    if (page.length < size) break;
  }
  return all;
}
