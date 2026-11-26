// Izbor grupe odmah poslije registracije (čista logika): lovac koji čeka ulaz u sekciju, a nije izabrao grupu, dobije pitanje.
export const PITANO_KEY = (sekcijaId) => `lovac.grupa.pitano.${sekcijaId}`;

// Sekcije u kojima JA čekam odobrenje (ili sam već član) bez grupe i bez izabrane željene grupe, a još nisam odgovorio.
// `pitano(sekcijaId)` vraća true ako je lovac već odlučio (izabrao ili rekao da nema preferenciju).
export function sectionsToAsk(clanovi = [], myId, pitano = () => false) {
  if (!myId) return [];
  return clanovi
    .filter((c) => c.korisnik_id === myId && ['ceka', 'odobren'].includes(c.status) && !c.grupa_id && !c.zeljena_grupa_id)
    .map((c) => c.sekcija_id)
    .filter((id) => !pitano(id));
}
