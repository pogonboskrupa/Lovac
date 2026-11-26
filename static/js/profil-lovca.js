// Profil lovca (čista logika): oprema i provjera unosa.

export const OPREMA_VRSTE = {
  puska: 'Puška',
  optika: 'Optika / dalekozor',
  municija: 'Municija',
  pribor: 'Pribor (nož, svjetiljka, rog…)',
  odjeca: 'Odjeća i obuća',
  ostalo: 'Ostalo',
};

export const MAX_OPREMA = 30;

// Čisti spisak opreme: nepoznata vrsta → ostalo, prazni se izbacuju, najviše MAX_OPREMA komada.
export function normalizeOprema(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((x) => ({ vrsta: Object.hasOwn(OPREMA_VRSTE, x?.vrsta) ? x.vrsta : 'ostalo', opis: String(x?.opis ?? '').trim().slice(0, 80) }))
    .filter((x) => x.opis)
    .slice(0, MAX_OPREMA);
}

export function validatePasIme(s) {
  return String(s ?? '').trim().length > 40 ? 'Ime psa je predugo (najviše 40 znakova)' : null;
}

export function emptyProfile() {
  return { avatar: null, pas_ime: '', pas_slika: null, oprema: [], dozvola: '', neposlano: false };
}

export function normalizeProfile(raw) {
  return {
    ...emptyProfile(),
    ...(raw || {}),
    pas_ime: String(raw?.pas_ime ?? '').trim().slice(0, 40),
    dozvola: String(raw?.dozvola ?? '').trim().slice(0, 40),
    oprema: normalizeOprema(raw?.oprema),
  };
}

export function validateDozvola(s) {
  return String(s ?? '').trim().length > 40 ? 'Broj dozvole je predugačak (najviše 40 znakova)' : null;
}
