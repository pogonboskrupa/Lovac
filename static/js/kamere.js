// Kamere (fotozamke): vide ih samo lovočuvari revira (čista logika; server provjerava kroz RLS).

// Reviri u kojima sam lovočuvar (revir_lovocuvari ili ranije sekcija.lovocuvar_id).
export function lovocuvarRevirIds(userId, ctx = {}) {
  if (!userId) return [];
  const ids = new Set((ctx.lovocuvari || []).filter((l) => l.korisnik_id === userId).map((l) => l.revir_id));
  for (const s of ctx.sekcije || []) if (s.lovocuvar_id === userId) ids.add(s.revir_id);
  return [...ids];
}

export function validateKamera({ naziv, revir_id: revirId, lat, lon, napomena }) {
  if (!revirId) return 'Izaberi revir';
  const n = String(naziv ?? '').trim();
  if (n.length < 1) return 'Upiši naziv kamere';
  if (n.length > 80) return 'Naziv je predug (najviše 80 znakova)';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Nema pozicije — čekaj GPS ili postavi nišan';
  if (String(napomena ?? '').length > 500) return 'Napomena je preduga (najviše 500 znakova)';
  return null;
}

export function newKamera({ id, revir_id: revirId, naziv, napomena = '', lat, lon, autorId }, now = Date.now()) {
  return {
    id, revir_id: revirId, naziv: String(naziv).trim(), napomena: String(napomena).trim() || null, lat, lon, aktivno: true,
    autor_id: autorId, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString(), sinhronizovano: false,
  };
}

// Neposlana lokalna verzija ima prednost; inače pobjeđuje server. Skinute (aktivno=false) se ne crtaju.
export function mergeKamere(local, remote) {
  const byId = new Map(remote.map((r) => [r.id, { ...r, sinhronizovano: true }]));
  for (const l of local) if (l.sinhronizovano === false) byId.set(l.id, l);
  return [...byId.values()];
}

export const visibleKamere = (list) => list.filter((k) => k.aktivno !== false);
