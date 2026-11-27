// Pregled lovova u toku za vodstvo (predsjednik, lovočuvari, lovovođe): čista logika. Opseg isti kao u Članovi i grupe
// (`overviewScope`: cijelo društvo ili samo svoj revir). Podaci su iz lokalnog keša lovova, pa radi i bez interneta;
// pozicije lovaca u lovu ovdje nisu (vide ih samo učesnici), nego prisustvo, trajanje i ko vodi.
import { overviewScope } from './clanovi-pregled.js';
import { durationText, clockText } from './lov-danas.js';

const byName = (a, b) => String(a || '').localeCompare(String(b || ''), 'bs');

// recs: keš lovova [{ lov, ucesnici, sekcija, revir }]. Vraća lovove U TOKU u opsegu, grupisane po reviru.
export function supervisedHunts(ctx = {}, recs = [], me, nameOf = (id) => id, now = Date.now()) {
  const scope = overviewScope(me, ctx);
  if (!scope) return { scope: null, reviri: [], ukupno: 0 };
  const sekcije = ctx.sekcije || [];
  const reviri = new Map();
  let ukupno = 0;
  for (const rec of recs) {
    const lov = rec?.lov;
    if (!lov || lov.status !== 'u_toku') continue;
    const sek = sekcije.find((s) => s.id === lov.sekcija_id) || rec.sekcija || null;
    const revirId = lov.revir_id || sek?.revir_id || null;
    if (!scope.sve && !(revirId && scope.reviri.has(revirId))) continue;
    const revir = (ctx.reviri || []).find((r) => r.id === revirId) || rec.revir || null;
    const grupa = lov.grupa_id ? (ctx.grupe || []).find((g) => g.id === lov.grupa_id) : null;
    const ucesnici = rec.ucesnici || [];
    const vodje = ucesnici.filter((u) => u.uloga === 'vodja').map((u) => nameOf(u.korisnik_id)).filter(Boolean);
    const card = {
      id: lov.id,
      naziv: lov.naziv || 'Lov',
      sekcija: sek?.naziv || '',
      grupa: !lov.grupa_id ? 'cijela sekcija' : grupa ? `grupa — grupovođa ${nameOf(grupa.grupovodja_id) || '—'}` : 'grupa',
      pocetak: clockText(lov.pocetak),
      trajanje: durationText(lov.pocetak, now),
      ucesnika: ucesnici.length,
      pogonica: ucesnici.filter((u) => u.uloga === 'pogonic').length,
      vodje,
      napomena: lov.napomena || '',
    };
    const key = revirId || '-';
    if (!reviri.has(key)) reviri.set(key, { id: revirId, naziv: revir?.naziv || 'Bez revira', lovovi: [] });
    reviri.get(key).lovovi.push(card);
    ukupno += 1;
  }
  const list = [...reviri.values()].sort((a, b) => byName(a.naziv, b.naziv));
  for (const r of list) r.lovovi.sort((a, b) => byName(a.sekcija, b.sekcija) || byName(a.naziv, b.naziv));
  return { scope, reviri: list, ukupno, ucesnika: list.reduce((n, r) => n + r.lovovi.reduce((m, l) => m + l.ucesnika, 0), 0) };
}

export const tabLabel = (ukupno) => (ukupno ? `Lov (${ukupno})` : 'Lov');
