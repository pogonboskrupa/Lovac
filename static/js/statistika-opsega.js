// Statistika po opsegu (sekcija, revir, cijelo društvo): izbor opsega po ulozi i sabiranje zbirki sa servera
// (statistika_ulov, statistika_lovovi). Čista logika, bez DOM-a.

import { myStatus } from './sekcije.js';

// Opsezi koje korisnik smije birati. Server to ponovo provjerava (izvan opsega vraća prazno).
export function scopeOptions(me, ctx) {
  const reviri = ctx.reviri || [];
  const sekcije = (ctx.sekcije || []).filter((s) => s.aktivno !== false);
  const sekLabel = (s) => `${reviri.find((r) => r.id === s.revir_id)?.naziv || 'Revir'} · ${s.naziv}`;
  if (!me?.id || !me.odobren) return [];
  if (me.is_admin) {
    return [{ kljuc: 'drustvo', naziv: 'Cijelo društvo', sek: null, revir: null },
      ...reviri.filter((r) => r.aktivno !== false).map((r) => ({ kljuc: `revir:${r.id}`, naziv: `Revir ${r.naziv}`, sek: null, revir: r.id })),
      ...sekcije.map((s) => ({ kljuc: `sekcija:${s.id}`, naziv: `Sekcija ${sekLabel(s)}`, sek: s.id, revir: null }))];
  }
  const out = [];
  const lcReviri = new Set([
    ...(ctx.lovocuvari || []).filter((l) => l.korisnik_id === me.id).map((l) => l.revir_id),
    ...sekcije.filter((s) => s.lovocuvar_id === me.id).map((s) => s.revir_id),
  ]);
  for (const id of lcReviri) {
    const r = reviri.find((x) => x.id === id);
    if (r) out.push({ kljuc: `revir:${id}`, naziv: `Revir ${r.naziv}`, sek: null, revir: id });
  }
  for (const s of sekcije) {
    const st = myStatus(s, ctx.clanovi || [], me.id, false, ctx.lovocuvari || []);
    if (['clan', 'grupovodja', 'lovocuvar'].includes(st)) out.push({ kljuc: `sekcija:${s.id}`, naziv: `Sekcija ${sekLabel(s)}`, sek: s.id, revir: null });
  }
  return out;
}

// Odluka vlasnika: statistika i rejting se vode tek od 2026. (ranije nije bilo evidencije u aplikaciji).
export const EVIDENCIJA_OD = 2026;

// Godine za izbor: od tekuće unazad do EVIDENCIJA_OD.
export function ratingYears(now = new Date()) {
  const y = Math.max(now.getFullYear(), EVIDENCIJA_OD);
  return Array.from({ length: y - EVIDENCIJA_OD + 1 }, (_, i) => String(y - i));
}

// Raspon datuma za server: godina ili "sve" — nikad prije EVIDENCIJA_OD.
export function periodDates(godina) {
  const od = `${EVIDENCIJA_OD}-01-01`;
  if (godina == null || godina === 'sve') return { od, do: null };
  const y = Number(godina);
  if (!Number.isFinite(y) || y < EVIDENCIJA_OD) return { od, do: `${EVIDENCIJA_OD}-12-31` };
  return { od: `${y}-01-01`, do: `${y}-12-31` };
}

const r1 = (n) => Math.round(n * 10) / 10;

// Zbirke: ulov = redovi statistika_ulov, lovovi = redovi statistika_lovovi.
export function buildStats({ ulov = [], lovovi = [] }) {
  const bySek = new Map();
  const get = (sek, revir) => {
    if (!bySek.has(sek)) bySek.set(sek, { sekcija_id: sek, revir_id: revir, lovova: 0, ucesca: 0, clanova: 0, komada: 0, kg: 0 });
    return bySek.get(sek);
  };
  for (const l of lovovi) { const g = get(l.sekcija_id, l.revir_id); g.lovova += l.lovova; g.ucesca += l.ucesca; g.clanova += l.clanova; }
  for (const u of ulov) { const g = get(u.sekcija_id, u.revir_id); g.komada += u.komada; g.kg = r1(g.kg + Number(u.kg)); }
  const sekcije = [...bySek.values()].map((g) => ({ ...g, odaziv: g.lovova && g.clanova ? Math.min(100, r1((g.ucesca / (g.lovova * g.clanova)) * 100)) : null }))
    .sort((a, b) => b.komada - a.komada || b.lovova - a.lovova);

  const byRevir = new Map();
  for (const s of sekcije) {
    const g = byRevir.get(s.revir_id) || { revir_id: s.revir_id, sekcija: 0, lovova: 0, ucesca: 0, clanova: 0, komada: 0, kg: 0, _slots: 0 };
    g.sekcija += 1; g.lovova += s.lovova; g.ucesca += s.ucesca; g.clanova += s.clanova; g.komada += s.komada; g.kg = r1(g.kg + s.kg);
    g._slots += s.lovova * s.clanova;
    byRevir.set(s.revir_id, g);
  }
  const reviri = [...byRevir.values()].map(({ _slots, ...g }) => ({ ...g, odaziv: _slots ? Math.min(100, r1((g.ucesca / _slots) * 100)) : null }))
    .sort((a, b) => b.komada - a.komada || b.lovova - a.lovova);

  const vrste = new Map();
  for (const u of ulov) {
    const g = vrste.get(u.vrsta) || { vrsta: u.vrsta, komada: 0, kg: 0 };
    g.komada += u.komada; g.kg = r1(g.kg + Number(u.kg));
    vrste.set(u.vrsta, g);
  }
  const mjeseci = Array(12).fill(0);
  for (const u of ulov) mjeseci[Number(String(u.mjesec).slice(5, 7)) - 1] += u.komada;

  const slots = sekcije.reduce((s, g) => s + g.lovova * g.clanova, 0);
  const ucesca = sekcije.reduce((s, g) => s + g.ucesca, 0);
  return {
    ukupno: {
      lovova: sekcije.reduce((s, g) => s + g.lovova, 0),
      ucesca,
      clanova: sekcije.reduce((s, g) => s + g.clanova, 0),
      odaziv: slots ? Math.min(100, r1((ucesca / slots) * 100)) : null,
      komada: sekcije.reduce((s, g) => s + g.komada, 0),
      kg: r1(sekcije.reduce((s, g) => s + g.kg, 0)),
      vrsta: vrste.size,
    },
    sekcije, reviri, vrste: [...vrste.values()].sort((a, b) => b.komada - a.komada || b.kg - a.kg), mjeseci,
  };
}

// Udio vrijednosti u najvećoj (za trake poređenja), 0–100; najveća grupa je uvijek 100 %.
export function shareOfMax(n, max) {
  return max > 0 ? Math.round((Math.max(0, n) / max) * 100) : 0;
}

// Mjesec sa najviše ulova ({ mjesec 1–12, komada }) ili null kad nema ulova.
export function bestMonth(mjeseci) {
  let best = null;
  mjeseci.forEach((n, i) => { if (n > 0 && (!best || n > best.komada)) best = { mjesec: i + 1, komada: n }; });
  return best;
}
