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
  const odobreni = (sid) => clanovi.filter((c) => c.sekcija_id === sid && c.status === 'odobren');
  const reviri = (ctx.reviri || []).filter((r) => r.aktivno !== false).sort((a, b) => byName(a.naziv, b.naziv));
  const sekcije = (ctx.sekcije || []).filter((s) => s.aktivno !== false);
  let brojGrupa = 0;
  let brojSekcija = 0;
  const reviriCvorovi = reviri.map((r) => {
    const v = (ctx.revirVodje || []).find((x) => x.revir_id === r.id);
    const djeca = sekcije.filter((s) => s.revir_id === r.id).sort((a, b) => byName(a.naziv, b.naziv)).map((s) => {
      brojSekcija += 1;
      const grupe = (ctx.grupe || []).filter((g) => g.sekcija_id === s.id)
        .map((g) => ({ nivo: 'grupa', meta: { uloga: 'grupovodja_grupe', korisnikId: g.grupovodja_id, grupaId: g.id, sekcijaId: s.id }, uloga: 'Grupovođa', ime: ime(g.grupovodja_id), napomena: `${odobreni(s.id).filter((c) => c.grupa_id === g.id).length} lovaca`, djeca: [] }))
        .sort((a, b) => byName(a.ime, b.ime));
      brojGrupa += grupe.length;
      return { nivo: 'sekcija', meta: { uloga: 'lovovodja_sekcije', korisnikId: s.grupovodja_id || null, sekcijaId: s.id, revirId: r.id, dodajGrupu: true }, uloga: s.naziv, ulogaOznaka: 'Lovovođa sekcije', ime: s.grupovodja_id ? ime(s.grupovodja_id) : '', napomena: `${odobreni(s.id).length} članova`, djeca: grupe };
    });
    return { nivo: 'revir', meta: { uloga: 'lovovodja_revira', korisnikId: v?.korisnik_id || null, revirId: r.id }, uloga: `Revir ${r.naziv}`, ulogaOznaka: 'Lovovođa revira', ime: v ? ime(v.korisnik_id) : '', napomena: '', djeca };
  });
  const lc = sa('lovocuvar');
  const idsLc = ids('lovocuvar');
  const lovocuvari = Array.from({ length: Math.max(MAX_LOVOCUVARA, lc.length) }, (_, i) => ({
    nivo: 'lovocuvar', meta: { uloga: 'lovocuvar', korisnikId: idsLc[i] || null }, uloga: `Lovočuvar udruženja ${i + 1}`, ime: lc[i] || '', napomena: '', prazno: 'Slobodno mjesto', djeca: [],
  }));
  const lovovodja = { nivo: 'lovovodja', meta: { uloga: 'lovovodja_drustva', korisnikId: ids('lovovodja_drustva')[0] || null }, uloga: 'Lovovođa udruženja', ime: sa('lovovodja_drustva')[0] || '', napomena: '', djeca: reviriCvorovi };
  return {
    korijen: { nivo: 'predsjednik', meta: { uloga: 'predsjednik', korisnikId: ids('predsjednik')[0] || null }, uloga: 'Predsjednik', ime: sa('predsjednik')[0] || '', napomena: '', djeca: [...lovocuvari, lovovodja] },
    sazetak: { reviri: reviri.length, sekcija: brojSekcija, grupa: brojGrupa },
  };
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
