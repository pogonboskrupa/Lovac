// Prijava ulova društvu (čista logika): iz lokalnog zapisa odstrela pravi se red za server (osnovni podaci, bez
// tačne lokacije i napomena), određuje se u koji revir/sekciju se prijavljuje i vodi izlazna kutija.

import { myStatus } from './sekcije.js';

export const REPORT_OUTBOX_KEY = 'lovac.prijave.red';
export const REPORT_SENT_KEY = 'lovac.prijave.poslane';
export const REPORT_WITHDRAWN_KEY = 'lovac.prijave.povucene';

// Moguće odredište prijave: zapis iz lova nosi revir/sekciju; inače lovac bira među svojim sekcijama.
export function reportTargets(rec, ctx, myId, isAdmin = false) {
  if (rec?.revir_id) {
    return [{ revirId: rec.revir_id, sekcijaId: rec.sekcija_id || null, lovId: rec.lov_id || null, fixed: true }];
  }
  const out = [];
  for (const s of ctx.sekcije || []) {
    if (s.aktivno === false) continue;
    const st = myStatus(s, ctx.clanovi || [], myId, false, ctx.lovocuvari || []);
    if (st === 'clan' || st === 'grupovodja') out.push({ revirId: s.revir_id, sekcijaId: s.id, lovId: null, fixed: false });
  }
  if (!out.length && isAdmin) {
    for (const r of ctx.reviri || []) out.push({ revirId: r.id, sekcijaId: null, lovId: null, fixed: false });
  }
  return out;
}

export function targetLabel(t, ctx) {
  const revir = (ctx.reviri || []).find((r) => r.id === t.revirId)?.naziv || 'revir';
  const sek = (ctx.sekcije || []).find((s) => s.id === t.sekcijaId)?.naziv;
  return sek ? `${revir} · ${sek}` : revir;
}

// Red za tabelu ulov_prijave. Samo ono što društvu treba: vrsta, kategorija, težina, vrijeme.
export function buildReport(rec, target, myId) {
  const kg = Number(rec.tezina);
  return {
    id: rec.id,
    lovac_id: myId,
    revir_id: target.revirId,
    sekcija_id: target.sekcijaId || null,
    lov_id: target.lovId || null,
    vrsta: rec.vrsta,
    kategorija: rec.kategorija && rec.kategorija !== 'nepoznato' ? rec.kategorija : null,
    tezina: Number.isFinite(kg) && rec.tezina != null ? kg : null,
    vrijeme: new Date(rec.vrijeme).toISOString(),
  };
}

// Stanje prijave jednog zapisa: 'nema' | 'ceka' (u izlaznoj kutiji) | 'poslana' | 'povucena' (konačno: server ne vraća povučenu).
export function reportState(id, outbox = [], sent = [], withdrawn = []) {
  if (withdrawn.includes(id)) return 'povucena';
  if (sent.includes(id)) return 'poslana';
  if (outbox.some((r) => r.id === id)) return 'ceka';
  return 'nema';
}

export function addToOutbox(outbox, row) {
  return outbox.some((r) => r.id === row.id) ? outbox : [...outbox, row];
}

export function markSent(outbox, sent, ids) {
  const done = new Set(ids);
  return { outbox: outbox.filter((r) => !done.has(r.id)), sent: [...new Set([...sent, ...ids])].slice(-500) };
}
