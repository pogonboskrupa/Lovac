// Moja grupa (čista logika): grupa je glavna jedinica lova, pa je ovo ekran lovca i grupovođe. Lovac je u jednoj grupi
// po sekciji (`sekcija_clanovi.grupa_id`); ko nije tačno taj (lovovođa sekcije, lovočuvar, admin, viši u lancu) ostaje
// na tabu sekcije. Server (RLS) provodi ko šta vidi, ovdje se samo bira šta prikazati.
import { myStatus } from './sekcije.js';
import { currentHunt, memberActivity } from './sekcija-podaci.js';

// Ko je iznad grupe u lancu: za njega tab ostaje cijela sekcija.
const aboveGroup = (ctx, user) => Boolean(user?.is_admin)
  || (ctx.drustvoUloge || []).some((u) => u.korisnik_id === user?.id)
  || (ctx.revirVodje || []).some((v) => v.korisnik_id === user?.id);

// Moja grupa: { sekcija, grupaId } ili null. Ne ovisi o tabeli `grupe` (lovac je ne mora imati u kešu) nego o mom redu
// u `sekcija_clanovi`, pa tab zna kuda vodi i prije prvog preuzimanja grupa.
export function myGroupSlot(ctx, user, prefSekcijaId = null) {
  if (!user?.id || aboveGroup(ctx, user)) return null;
  const mine = (ctx.clanovi || []).filter((c) => c.korisnik_id === user.id && c.status === 'odobren' && c.grupa_id);
  const slots = mine.map((c) => ({ c, sekcija: (ctx.sekcije || []).find((s) => s.id === c.sekcija_id) }))
    .filter((x) => x.sekcija && x.sekcija.aktivno !== false
      && myStatus(x.sekcija, ctx.clanovi, user.id, false, ctx.lovocuvari || []) === 'clan');
  const pick = slots.find((x) => x.sekcija.id === prefSekcijaId) || slots[0];
  return pick ? { sekcija: pick.sekcija, grupaId: pick.c.grupa_id } : null;
}

// Odobreni članovi grupe: grupovođa prvi, ostali po imenu. nameOf(id) daje ime.
export function groupMembers(ctx, grupaId, nameOf = (id) => id) {
  const g = (ctx.grupe || []).find((x) => x.id === grupaId);
  const ids = (ctx.clanovi || []).filter((c) => c.grupa_id === grupaId && c.status === 'odobren').map((c) => c.korisnik_id);
  if (g?.grupovodja_id && !ids.includes(g.grupovodja_id)) ids.unshift(g.grupovodja_id);
  return ids.map((id) => ({ id, ime: nameOf(id), grupovodja: id === g?.grupovodja_id }))
    .sort((a, b) => Number(b.grupovodja) - Number(a.grupovodja) || a.ime.localeCompare(b.ime, 'bs'));
}

// Lovovi koji se tiču grupe: lov same grupe i lov cijele sekcije (bez `grupa_id`). Tuđa grupa se ne prikazuje.
export function groupHunts(lovovi, sekcijaId, grupaId) {
  return lovovi.filter((z) => z.lov.sekcija_id === sekcijaId && (!z.lov.grupa_id || z.lov.grupa_id === grupaId));
}

// Lov u toku, inače sljedeći planirani (isto pravilo kao tab sekcije, ali samo nad lovovima grupe).
export function currentGroupHunt(lovovi, sekcijaId, grupaId, now = Date.now()) {
  return currentHunt(groupHunts(lovovi, sekcijaId, grupaId), sekcijaId, now);
}

// Ko dolazi na lov: lov se mijenja od puta do puta, pa se prisustvo gleda po lovu. Prisutan = u učesnicima (uključuje
// samoprijavu), "ne" = javio da ne dolazi, inače nije odgovorio.
export function attendance(members, ucesnici = [], odazivi = []) {
  const in_ = new Set(ucesnici.map((u) => u.korisnik_id));
  const odg = new Map(odazivi.map((o) => [o.korisnik_id, o.odgovor]));
  const rows = members.map((m) => ({ ...m, stanje: in_.has(m.id) || odg.get(m.id) === 'da' ? 'prisutan' : odg.get(m.id) === 'ne' ? 'ne' : 'nema' }));
  const order = { prisutan: 0, nema: 1, ne: 2 };
  rows.sort((a, b) => order[a.stanje] - order[b.stanje] || a.ime.localeCompare(b.ime, 'bs'));
  const count = (s) => rows.filter((r) => r.stanje === s).length;
  return { rows, prisutnih: count('prisutan'), ne: count('ne'), nema: count('nema'), ukupno: rows.length };
}

// Moj stanje za lov: 'prisutan' (u učesnicima), 'ne' (javio ne), 'nema' (nije odgovorio); dodao me grupovođa → ne mogu se sam odjaviti.
export function myAttendance(zapis, myId, myAnswer) {
  const u = zapis.ucesnici.find((x) => x.korisnik_id === myId);
  if (u) return { stanje: 'prisutan', mozeOdjava: Boolean(u.samoprijava) };
  return { stanje: myAnswer === 'ne' ? 'ne' : 'nema', mozeOdjava: false };
}

// Statistika grupe iz lovova grupe na telefonu: broj lovova, prosječna prisutnost (prisutni članovi / članovi grupe) i
// koliko je lovova svaki lovac imao. Radi offline; članovi su današnji sastav grupe.
export function groupStats(lovovi, sekcijaId, grupaId, members) {
  const mine = lovovi.filter((z) => z.lov.sekcija_id === sekcijaId && z.lov.grupa_id === grupaId && z.lov.status !== 'planiran');
  const ids = new Set(members.map((m) => m.id));
  const po = new Map(members.map((m) => [m.id, 0]));
  let sum = 0;
  for (const z of mine) {
    const present = z.ucesnici.filter((u) => ids.has(u.korisnik_id));
    sum += ids.size ? present.length / ids.size : 0;
    for (const u of present) po.set(u.korisnik_id, (po.get(u.korisnik_id) || 0) + 1);
  }
  const poClanu = members.map((m) => ({ id: m.id, ime: m.ime, lovova: po.get(m.id) || 0, procenat: mine.length ? Math.round(((po.get(m.id) || 0) / mine.length) * 100) : 0 }))
    .sort((a, b) => b.lovova - a.lovova || a.ime.localeCompare(b.ime, 'bs'));
  return { lovova: mine.length, prosjek: mine.length ? Math.round((sum / mine.length) * 100) : 0, poClanu };
}

// Aktivnost člana grupe u tekućem lovu (isto kao tab sekcije).
export const groupActivity = (id, lov, ucesnici, pozicije) => memberActivity(id, lov, ucesnici, pozicije);

// Nepročitane poruke grupe (za značku na tabu): tuđe poruke kanala 'grupa' ove grupe poslije zadnjeg čitanja.
export const GROUP_READ_KEY = (grupaId) => `lovac.grupa.procitano.${grupaId}`;
export function groupUnread(poruke, grupaId, myId, lastRead = null) {
  if (!grupaId) return 0;
  return poruke.filter((m) => m.kanal === 'grupa' && m.grupa_id === grupaId && m.autor_id !== myId && (!lastRead || m.created_at > lastRead)).length;
}
