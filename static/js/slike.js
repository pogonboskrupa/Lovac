// Slika na poziciji: čeka, lovački objekat, ulov ili drugo — slika se veže za mjesto gdje je snimljena i prikazuje na karti.

export const SLIKA_KATEGORIJE = {
  cekalo: { naziv: 'Čeka', boja: '#16a34a' },
  objekat: { naziv: 'Lovački objekat', boja: '#2563eb' },
  ulov: { naziv: 'Ulov', boja: '#dc2626' },
  ostalo: { naziv: 'Drugo', boja: '#a16207' },
};

export function pictureCategoryName(kod) {
  return SLIKA_KATEGORIJE[kod]?.naziv || SLIKA_KATEGORIJE.ostalo.naziv;
}

export function validateSlika({ kategorija, foto, lat, lon, opis }) {
  if (!SLIKA_KATEGORIJE[kategorija]) return 'Izaberi šta je na slici';
  if (!foto) return 'Dodaj fotografiju';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Nema pozicije — čekaj GPS ili postavi nišan na mjesto';
  if (String(opis ?? '').length > 300) return 'Opis je predug (najviše 300 znakova)';
  return null;
}

export function newSlika({ id, kategorija, foto, mala, lat, lon, opis = '' }, now = Date.now()) {
  return { id, kategorija, foto, mala, lat, lon, opis: String(opis).trim(), vrijeme: now };
}

// Najnovije prve; za spisak i za redoslijed crtanja (novije iznad starijih).
export function sortSlike(list) {
  return [...list].sort((a, b) => b.vrijeme - a.vrijeme);
}
