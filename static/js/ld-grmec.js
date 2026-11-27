// Tab "LD Grmeč" (čista logika): ko je ko u udruženju — predsjednik, lovočuvari, lovovođa udruženja, lovovođe revira,
// lovovođe sekcija i grupovođe. Podaci su iz keša sekcija (`cachedSekcije`); server (RLS) odlučuje šta ko smije vidjeti.
import { MAX_LOVOCUVARA } from './hijerarhija.js';

// Tab vide rukovodioci: admin, predsjednik, lovočuvari, lovovođe (udruženja, revira, sekcije). Uloga se nikad ne izvodi iz imena.
export function canSeeLd(me, ctx = {}) {
  if (!me?.id) return false;
  if (me.is_admin) return true;
  return (ctx.drustvoUloge || []).some((u) => u.korisnik_id === me.id)
    || (ctx.revirVodje || []).some((v) => v.korisnik_id === me.id)
    || (ctx.lovocuvari || []).some((l) => l.korisnik_id === me.id)
    || (ctx.sekcije || []).some((s) => s.aktivno !== false && (s.grupovodja_id === me.id || s.lovocuvar_id === me.id));
}

const byName = (a, b) => String(a || '').localeCompare(String(b || ''), 'bs');

// Hijerarhijsko stablo: predsjednik → (lovočuvari, lovovođa udruženja → revir → sekcija → grupa).
// Čvor: { nivo, uloga, ime, napomena, djeca }; prazno mjesto ima `ime: ''` (UI kaže "Nije postavljen" / "Slobodno mjesto").
// nameOf(id) daje ime i prezime ('' ako je nepoznato).
export function ldTree(ctx = {}, nameOf = () => '') {
  const uloge = ctx.drustvoUloge || [];
  const ime = (id) => nameOf(id) || 'Nepoznat član';
  const sa = (uloga) => uloge.filter((u) => u.uloga === uloga).map((u) => ime(u.korisnik_id)).sort(byName);
  const ids = (uloga) => uloge.filter((u) => u.uloga === uloga).map((u) => u.korisnik_id).sort((a, b) => byName(nameOf(a), nameOf(b)));
  const clanovi = ctx.clanovi || [];
  const skriveni = new Set((ctx.izvanPregleda || []).map((x) => x.korisnik_id)); // sklonjeni iz pregleda (migracija 049)
  const odobreni = (sid) => clanovi.filter((c) => c.sekcija_id === sid && c.status === 'odobren' && !skriveni.has(c.korisnik_id));
  const reviri = (ctx.reviri || []).filter((r) => r.aktivno !== false).sort((a, b) => byName(a.naziv, b.naziv));
  const sekcije = (ctx.sekcije || []).filter((s) => s.aktivno !== false);
  let brojGrupa = 0;
  let brojSekcija = 0;
  const reviriCvorovi = reviri.map((r) => {
    const v = (ctx.revirVodje || []).find((x) => x.revir_id === r.id);
    const djeca = sekcije.filter((s) => s.revir_id === r.id).sort((a, b) => byName(a.naziv, b.naziv)).map((s) => {
      brojSekcija += 1;
      const lovac = (id) => ({ nivo: 'lovac', uloga: 'Lovac', ime: ime(id), napomena: '', djeca: [] });
      const odob = odobreni(s.id);
      const grupe = (ctx.grupe || []).filter((g) => g.sekcija_id === s.id)
        .map((g) => {
          const clanoviGrupe = odob.filter((c) => c.grupa_id === g.id);
          // grupovođa je u svojoj grupi i kad mu red u članstvu nema grupu (grupa napravljena bez dodjele)
          const brojLovaca = clanoviGrupe.length + (clanoviGrupe.some((c) => c.korisnik_id === g.grupovodja_id) ? 0 : 1);
          // grupovođa je čvor same grupe; ispod njega su ostali lovci grupe (samo odobreni članovi)
          const lovci = clanoviGrupe.filter((c) => c.korisnik_id !== g.grupovodja_id).map((c) => lovac(c.korisnik_id)).sort((a, b) => byName(a.ime, b.ime));
          return { nivo: 'grupa', kljuc: `g:${g.id}`, meta: { uloga: 'grupovodja_grupe', korisnikId: g.grupovodja_id, grupaId: g.id, sekcijaId: s.id }, grupaTekst: `grupovođa ${ime(g.grupovodja_id)}`, uloga: 'Grupovođa', ime: ime(g.grupovodja_id), napomena: `${brojLovaca} lovaca`, djeca: lovci };
        })
        .sort((a, b) => byName(a.ime, b.ime));
      // članovi sekcije koji još nisu ni u jednoj grupi
      const poznate = new Set(grupe.map((g) => g.meta.grupaId));
      const vode = new Set((ctx.grupe || []).filter((g) => g.sekcija_id === s.id).map((g) => g.grupovodja_id));
      const bez = odob.filter((c) => (!c.grupa_id || !poznate.has(c.grupa_id)) && !vode.has(c.korisnik_id)).map((c) => lovac(c.korisnik_id)).sort((a, b) => byName(a.ime, b.ime));
      if (bez.length) grupe.push({ nivo: 'bez-grupe', kljuc: `b:${s.id}`, uloga: 'Bez grupe', ime: 'Članovi bez grupe', napomena: `${bez.length} lovaca`, djeca: bez });
      brojGrupa += grupe.filter((g) => g.nivo === 'grupa').length;
      return { nivo: 'sekcija', kljuc: `s:${s.id}`, meta: { uloga: 'lovovodja_sekcije', korisnikId: s.grupovodja_id || null, sekcijaId: s.id, revirId: r.id, dodajGrupu: true }, uloga: s.naziv, ulogaOznaka: 'Lovovođa sekcije', ime: s.grupovodja_id ? ime(s.grupovodja_id) : '', napomena: `${odobreni(s.id).length} članova`, djeca: grupe };
    });
    return { nivo: 'revir', kljuc: `r:${r.id}`, meta: { uloga: 'lovovodja_revira', korisnikId: v?.korisnik_id || null, revirId: r.id }, uloga: `Revir ${r.naziv}`, ulogaOznaka: 'Lovovođa revira', ime: v ? ime(v.korisnik_id) : '', napomena: '', djeca };
  });
  const lc = sa('lovocuvar');
  const idsLc = ids('lovocuvar');
  const lovocuvari = Array.from({ length: Math.max(MAX_LOVOCUVARA, lc.length) }, (_, i) => ({
    nivo: 'lovocuvar', meta: { uloga: 'lovocuvar', korisnikId: idsLc[i] || null }, uloga: `Lovočuvar udruženja ${i + 1}`, ime: lc[i] || '', napomena: '', prazno: 'Slobodno mjesto', djeca: [],
  }));
  const lovovodja = { nivo: 'lovovodja', meta: { uloga: 'lovovodja_drustva', korisnikId: ids('lovovodja_drustva')[0] || null }, uloga: 'Lovovođa udruženja', ime: sa('lovovodja_drustva')[0] || '', napomena: '', djeca: reviriCvorovi };
  const korijen = { nivo: 'predsjednik', meta: { uloga: 'predsjednik', korisnikId: ids('predsjednik')[0] || null }, uloga: 'Predsjednik', ime: sa('predsjednik')[0] || '', napomena: '', djeca: [...lovocuvari, lovovodja] };
  // Mjesta za popuniti: svako mjesto na stablu osim grupa (grupa postoji tek kad ima grupovođu).
  let ukupno = 0;
  let popunjeno = 0;
  const brojMjesta = (c) => { if (!['grupa', 'lovac', 'bez-grupe'].includes(c.nivo)) { ukupno += 1; if (c.ime) popunjeno += 1; } c.djeca.forEach(brojMjesta); };
  brojMjesta(korijen);
  return { korijen, sazetak: { reviri: reviri.length, sekcija: brojSekcija, grupa: brojGrupa, mjesta: ukupno, popunjeno, slobodno: ukupno - popunjeno } };
}

// Ko se može dodijeliti ulozi: odobreni korisnici bez onih koji je već imaju; za novu grupu samo članovi te sekcije bez grupe koju vode.
// users: [{ id, odobren }] (spisak članova društva); `popuna` je 'grupa' za dodavanje grupe u sekciji.
export function ldCandidates(meta, ctx = {}, users = [], nameOf = () => '', popuna = '') {
  const ime = (id) => nameOf(id) || '';
  let ids;
  if (popuna === 'grupa') {
    const vode = new Set((ctx.grupe || []).filter((g) => g.sekcija_id === meta.sekcijaId).map((g) => g.grupovodja_id));
    ids = (ctx.clanovi || []).filter((c) => c.sekcija_id === meta.sekcijaId && c.status === 'odobren' && !vode.has(c.korisnik_id)).map((c) => c.korisnik_id);
  } else {
    const drzi = new Set([meta.korisnikId, ...(meta.uloga === 'lovocuvar' ? (ctx.drustvoUloge || []).filter((u) => u.uloga === 'lovocuvar').map((u) => u.korisnik_id) : [])]);
    ids = users.filter((u) => u.odobren !== false && !drzi.has(u.id)).map((u) => u.id);
  }
  return [...new Set(ids)].filter((id) => ime(id)).map((id) => ({ id, ime: ime(id) })).sort(byName2);
}
const byName2 = (a, b) => String(a.ime).localeCompare(String(b.ime), 'bs');

// Ko smije dodati lovca u grupu (novi nalog ili postojeći član): administrator, lovovođa te sekcije, lovovođa revira i lovovođa društva.
// Grupa koja nema grupovođu ne postoji, pa je uslov "prvo grupovođa" ispunjen samim postojanjem grupe.
export function canAddToGroup(me, ctx = {}, sekcijaId) {
  if (!me?.id) return false;
  if (me.is_admin) return true;
  const s = (ctx.sekcije || []).find((x) => x.id === sekcijaId);
  if (!s) return false;
  return s.grupovodja_id === me.id
    || (ctx.revirVodje || []).some((v) => v.korisnik_id === me.id && v.revir_id === s.revir_id)
    || (ctx.drustvoUloge || []).some((u) => u.korisnik_id === me.id && u.uloga === 'lovovodja_drustva');
}

// Članovi sekcije koji još nisu ni u jednoj grupi (mogu se dodati u grupu).
export function groupAddable(sekcijaId, ctx = {}, nameOf = () => '') {
  const gs = (ctx.grupe || []).filter((g) => g.sekcija_id === sekcijaId);
  const ids = new Set(gs.map((g) => g.id));
  const vode = new Set(gs.map((g) => g.grupovodja_id)); // grupovođa već vodi grupu: ne nudi se za dodavanje u grupu
  return (ctx.clanovi || []).filter((c) => c.sekcija_id === sekcijaId && c.status === 'odobren' && !ids.has(c.grupa_id) && !vode.has(c.korisnik_id))
    .map((c) => ({ id: c.korisnik_id, ime: nameOf(c.korisnik_id) })).filter((x) => x.ime)
    .sort((a, b) => String(a.ime).localeCompare(String(b.ime), 'bs'));
}
