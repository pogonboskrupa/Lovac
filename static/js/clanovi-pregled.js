// Pregled svih članova i grupa za vodstvo društva (čista logika). Šta ko vidi provodi server (RLS, migracija 048);
// ovdje se samo bira opseg i sastavlja stablo revir → sekcija → grupa → članovi.
// Opseg: administrator, predsjednik, lovočuvari udruženja i lovovođa udruženja vide CIJELO društvo; lovovođa revira
// (i lovočuvar pojedinog revira) samo svoj revir. Lovovođa sekcije i lovac imaju vlastite ekrane (tab sekcije / grupe).

const ULOGE = ['Administrator', 'Predsjednik', 'Lovovođa udruženja', 'Lovočuvar udruženja', 'Lovovođa revira', 'Lovočuvar revira'];

// { sve, reviri: Set, uloga } ili null kad korisnik nema pravo na ovaj pregled.
export function overviewScope(me, ctx = {}) {
  if (!me?.id) return null;
  const found = [];
  const reviri = new Set();
  if (me.is_admin) found.push('Administrator');
  for (const u of (ctx.drustvoUloge || []).filter((x) => x.korisnik_id === me.id)) {
    found.push({ predsjednik: 'Predsjednik', lovovodja_drustva: 'Lovovođa udruženja', lovocuvar: 'Lovočuvar udruženja' }[u.uloga]);
  }
  for (const v of (ctx.revirVodje || []).filter((x) => x.korisnik_id === me.id)) { found.push('Lovovođa revira'); reviri.add(v.revir_id); }
  // lovocuvari su raspisani po revirima; unosi sa `drustvo` dolaze iz uloga udruženja (već gore)
  for (const l of (ctx.lovocuvari || []).filter((x) => x.korisnik_id === me.id && !x.drustvo)) { found.push('Lovočuvar revira'); reviri.add(l.revir_id); }
  for (const s of (ctx.sekcije || []).filter((x) => x.lovocuvar_id === me.id)) { found.push('Lovočuvar revira'); reviri.add(s.revir_id); }
  const roles = found.filter(Boolean);
  if (!roles.length) return null;
  const wide = roles.some((r) => ['Administrator', 'Predsjednik', 'Lovovođa udruženja', 'Lovočuvar udruženja'].includes(r));
  const uloga = ULOGE.find((u) => roles.includes(u));
  return { sve: wide, reviri, uloga, opis: wide ? 'Cijelo društvo: svi reviri, sekcije i grupe.' : 'Tvoj revir: sekcije, grupe i članovi.' };
}

const byName = (a, b) => String(a || '').localeCompare(String(b || ''), 'bs');

// Stablo za opseg. nameOf(id) daje ime lovca. Članovi koji čekaju odobrenje se samo broje (imena ne čitamo).
export function buildOverview(ctx, scope, nameOf = (id) => id) {
  if (!scope) return { reviri: [], totals: { reviri: 0, sekcija: 0, grupa: 0, clanova: 0, bezGrupe: 0, cekaju: 0 } };
  const skriveni = new Set((ctx.izvanPregleda || []).map((x) => x.korisnik_id)); // admin ih je sklonio iz pregleda (migracija 049)
  const reviri = (ctx.reviri || []).filter((r) => r.aktivno !== false && (scope.sve || scope.reviri.has(r.id))).sort((a, b) => byName(a.naziv, b.naziv));
  const out = reviri.map((r) => {
    const sekcije = (ctx.sekcije || []).filter((s) => s.revir_id === r.id && s.aktivno !== false).sort((a, b) => byName(a.naziv, b.naziv)).map((s) => {
      const rows = (ctx.clanovi || []).filter((c) => c.sekcija_id === s.id);
      const odobreni = rows.filter((c) => c.status === 'odobren' && !skriveni.has(c.korisnik_id));
      const gs = (ctx.grupe || []).filter((g) => g.sekcija_id === s.id);
      const known = new Set(gs.map((g) => g.id));
      const vode = new Set(gs.map((g) => g.grupovodja_id));
      const grupe = gs.map((g) => {
        const clanovi = odobreni.filter((c) => c.grupa_id === g.id).map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id), vodja: c.korisnik_id === g.grupovodja_id }));
        // grupovođa je u svojoj grupi i kad mu red u članstvu nema grupu
        if (g.grupovodja_id && !clanovi.some((m) => m.vodja)) clanovi.push({ id: g.grupovodja_id, ime: nameOf(g.grupovodja_id), vodja: true });
        return { id: g.id, grupovodja_id: g.grupovodja_id, grupovodja: nameOf(g.grupovodja_id), clanovi: clanovi.sort((a, b) => Number(b.vodja) - Number(a.vodja) || byName(a.ime, b.ime)) };
      }).sort((a, b) => byName(a.grupovodja, b.grupovodja));
      const bezGrupe = odobreni.filter((c) => (!c.grupa_id || !known.has(c.grupa_id)) && !vode.has(c.korisnik_id)).map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id) })).sort((a, b) => byName(a.ime, b.ime));
      return {
        id: s.id, naziv: s.naziv, vodja: s.grupovodja_id ? { id: s.grupovodja_id, ime: nameOf(s.grupovodja_id) } : null,
        clanova: odobreni.length, grupe, bezGrupe, cekaju: rows.filter((c) => c.status === 'ceka').length,
      };
    });
    return { id: r.id, naziv: r.naziv, sekcije, clanova: sekcije.reduce((n, s) => n + s.clanova, 0) };
  });
  const all = out.flatMap((r) => r.sekcije);
  return {
    reviri: out,
    totals: {
      reviri: out.length, sekcija: all.length, grupa: all.reduce((n, s) => n + s.grupe.length, 0), clanova: all.reduce((n, s) => n + s.clanova, 0),
      bezGrupe: all.reduce((n, s) => n + s.bezGrupe.length, 0), cekaju: all.reduce((n, s) => n + s.cekaju, 0),
    },
  };
}

export const FILTERI = [
  { id: 'svi', naziv: 'Svi' }, { id: 'bez-grupe', naziv: 'Bez grupe' }, { id: 'cekaju', naziv: 'Čekaju' }, { id: 'vodstvo', naziv: 'Vodstvo' },
];

// Suženo stablo: pretraga (matches([polja], upit), npr. pretraga.js matchesQuery) po lovcu, grupovođi i sekciji; filter Bez grupe / Čekaju / Vodstvo.
export function filterOverview(ov, { query = '', filter = 'svi' } = {}, matches = (polja, q) => polja.some((t) => String(t).toLowerCase().includes(String(q).toLowerCase()))) {
  const q = String(query || '').trim();
  const reviri = ov.reviri.map((r) => {
    const sekcije = r.sekcije.map((s) => {
      const sekHit = q && matches([s.naziv], q);
      const memberHit = (m, g) => !q || sekHit || matches([m.ime], q) || (g && matches([g.grupovodja], q));
      let grupe = s.grupe.map((g) => ({ ...g, clanovi: g.clanovi.filter((m) => memberHit(m, g)) }));
      let bezGrupe = s.bezGrupe.filter((m) => memberHit(m, null));
      if (filter === 'bez-grupe') grupe = [];
      if (filter === 'vodstvo') { grupe = grupe.map((g) => ({ ...g, clanovi: g.clanovi.filter((m) => m.vodja) })); bezGrupe = []; }
      grupe = grupe.filter((g) => g.clanovi.length || (!q && filter === 'svi'));
      if (filter === 'cekaju' && !s.cekaju) return null;
      const hit = filter === 'cekaju' ? true : grupe.length || bezGrupe.length || (filter === 'svi' && !q) || sekHit;
      return hit ? { ...s, grupe, bezGrupe } : null;
    }).filter(Boolean);
    return sekcije.length ? { ...r, sekcije } : null;
  }).filter(Boolean);
  return { ...ov, reviri };
}

// Redovi za CSV (Excel): revir, sekcija, grupa (grupovođa), član, uloga.
export const CSV_COLUMNS = [
  { key: 'revir', label: 'Revir' }, { key: 'sekcija', label: 'Sekcija' }, { key: 'grupa', label: 'Grupa (grupovođa)' },
  { key: 'clan', label: 'Član' }, { key: 'uloga', label: 'Uloga' },
];
export function csvRows(ov) {
  const rows = [];
  for (const r of ov.reviri) {
    for (const s of r.sekcije) {
      if (s.vodja) rows.push({ revir: r.naziv, sekcija: s.naziv, grupa: '', clan: s.vodja.ime, uloga: 'Lovovođa sekcije' });
      for (const g of s.grupe) for (const m of g.clanovi) rows.push({ revir: r.naziv, sekcija: s.naziv, grupa: g.grupovodja, clan: m.ime, uloga: m.vodja ? 'Grupovođa' : 'Lovac' });
      for (const m of s.bezGrupe) rows.push({ revir: r.naziv, sekcija: s.naziv, grupa: '', clan: m.ime, uloga: 'Lovac bez grupe' });
    }
  }
  return rows;
}
export const csvName = (now = new Date()) => `clanovi-i-grupe-${now.toISOString().slice(0, 10)}.csv`;

// Kratki tekst za pločicu u Meniju.
export function menuText(ov) {
  const t = ov.totals;
  return t.clanova ? `${t.clanova} članova · ${t.grupa} grupa${t.bezGrupe ? ` · ${t.bezGrupe} bez grupe` : ''}` : 'Reviri, sekcije, grupe i članovi';
}
