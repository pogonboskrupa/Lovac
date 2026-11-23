// "Lov danas" (ploča iz dugmeta + dok je lov u toku): sažetak današnjeg lova iz keša, radi i bez interneta.

export const ULOGE_LOVA = { vodja: 'Vođa lova', strijelac: 'Strijelac', pogonic: 'Pogonič' };
const ULOGA_RED = { vodja: 0, strijelac: 1, pogonic: 2 };

export function durationText(fromIso, now = Date.now()) {
  const t = Date.parse(fromIso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((now - t) / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

export function clockText(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });
}

// rec = keš lova { lov, ucesnici, stanovi, revir, sekcija }
export function todayHuntSummary(rec, myId, nameOf = (id) => id, now = Date.now()) {
  if (!rec?.lov) return null;
  const { lov } = rec;
  const stanovi = rec.stanovi || [];
  const standOf = (uid) => stanovi.find((s) => s.korisnik_id === uid) || null;
  const ucesnici = (rec.ucesnici || []).map((u) => ({
    id: u.korisnik_id,
    ime: nameOf(u.korisnik_id),
    uloga: u.uloga || 'strijelac',
    ulogaTekst: ULOGE_LOVA[u.uloga] || ULOGE_LOVA.strijelac,
    stan: standOf(u.korisnik_id)?.broj ?? null,
    ja: u.korisnik_id === myId,
  })).sort((a, b) => (ULOGA_RED[a.uloga] ?? 9) - (ULOGA_RED[b.uloga] ?? 9) || a.ime.localeCompare(b.ime, 'bs'));
  const moj = ucesnici.find((u) => u.ja) || null;
  return {
    naziv: lov.naziv,
    mjesto: [rec.sekcija?.naziv, rec.revir?.naziv].filter(Boolean).join(' · '),
    uToku: lov.status === 'u_toku',
    pocetak: clockText(lov.pocetak),
    trajanje: durationText(lov.pocetak, now),
    napomena: lov.napomena || '',
    vodje: ucesnici.filter((u) => u.uloga === 'vodja').map((u) => u.ime),
    ucesnici,
    moj,
    brojevi: { ucesnika: ucesnici.length, stanova: stanovi.length, pogonica: ucesnici.filter((u) => u.uloga === 'pogonic').length },
  };
}
