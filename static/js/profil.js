// Profil u Postavkama: inicijali i uloge (admin, grupovođa, lovočuvar) iz keširanih podataka.

export function initialsOfProfile(p) {
  if (!p) return '?';
  return `${(p.ime || '?')[0]}${(p.prezime || '')[0] || ''}`.toUpperCase();
}

// ctx: { reviri, sekcije, grupovodje, lovocuvari } (keš sekcija). Uloga se NIKAD ne izvodi iz imena.
export function profileRoles(p, ctx = {}) {
  if (!p) return [];
  if (!p.odobren) return [{ kod: 'ceka', tekst: 'Čeka odobrenje' }];
  const reviri = ctx.reviri || [];
  const naziv = (id) => reviri.find((r) => r.id === id)?.naziv || 'revir';
  const out = [];
  if (p.is_admin) out.push({ kod: 'admin', tekst: 'Administrator' });
  for (const g of (ctx.grupovodje || []).filter((x) => x.korisnik_id === p.id)) out.push({ kod: 'grupovodja', tekst: `Grupovođa · ${naziv(g.revir_id)}` });
  for (const s of (ctx.sekcije || []).filter((x) => x.grupovodja_id === p.id)) out.push({ kod: 'sekcija', tekst: `Vodi sekciju ${s.naziv}` });
  for (const l of (ctx.lovocuvari || []).filter((x) => x.korisnik_id === p.id)) out.push({ kod: 'lovocuvar', tekst: `Lovočuvar · ${naziv(l.revir_id)}` });
  if (!out.length) out.push({ kod: 'lovac', tekst: 'Lovac' });
  return out;
}
