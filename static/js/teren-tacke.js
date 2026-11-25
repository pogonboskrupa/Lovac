// Imena mjesta na karti Teren (čista logika). Unosi ih samo administrator (server provjerava kroz RLS), vide svi.

// minZoom: važnija mjesta se vide ranije, sitna tek kad je karta dovoljno uvećana (Teren ima zoom 12–16).
export const TACKA_VRSTE = [
  { kod: 'naselje', naziv: 'Naselje / zaselak', minZoom: 12 },
  { kod: 'vrh', naziv: 'Vrh / brdo', minZoom: 13 },
  { kod: 'dolina', naziv: 'Dolina / kotlina', minZoom: 14 },
  { kod: 'voda', naziv: 'Potok / izvor / jezero', minZoom: 14 },
  { kod: 'suma', naziv: 'Šuma / lokalitet', minZoom: 14 },
  { kod: 'ostalo', naziv: 'Ostalo', minZoom: 14 },
];
export const NAZIV_MAX = 60;

const vrstaOf = (kod) => TACKA_VRSTE.find((v) => v.kod === kod) || TACKA_VRSTE.at(-1);
export const vrstaNaziv = (kod) => vrstaOf(kod).naziv;

export function validateTacka({ naziv, vrsta, lat, lon }) {
  const n = String(naziv ?? '').trim();
  if (n.length < 1) return 'Upiši naziv mjesta';
  if (n.length > NAZIV_MAX) return `Naziv je predug (najviše ${NAZIV_MAX} znakova)`;
  if (!TACKA_VRSTE.some((v) => v.kod === vrsta)) return 'Izaberi vrstu mjesta';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'Nema pozicije — odaberi mjesto na karti';
  return null;
}

export function newTacka({ id, naziv, vrsta, lat, lon, autorId }, now = Date.now()) {
  const t = new Date(now).toISOString();
  return { id, naziv: String(naziv).trim(), vrsta, lat, lon, aktivno: true, autor_id: autorId, created_at: t, updated_at: t, sinhronizovano: false };
}

// Izmjena postojeće tačke: ide ponovo u red slanja (upsert po id-u).
export function editTacka(tacka, izmjene, now = Date.now()) {
  const { naziv, vrsta, lat, lon, aktivno } = { ...tacka, ...izmjene };
  return { ...tacka, naziv: String(naziv).trim(), vrsta, lat, lon, aktivno, updated_at: new Date(now).toISOString(), sinhronizovano: false };
}

// Neposlana lokalna verzija ima prednost; inače pobjeđuje server (ako je novija od lokalne).
export function mergeTacke(local = [], remote = []) {
  const byId = new Map(local.map((t) => [t.id, t]));
  for (const r of remote) {
    const l = byId.get(r.id);
    if (l && l.sinhronizovano === false) continue;
    if (l && Date.parse(l.updated_at) > Date.parse(r.updated_at)) continue;
    byId.set(r.id, { ...r, sinhronizovano: true });
  }
  return [...byId.values()];
}

// Za zoom: skinute se ne crtaju, a sitna mjesta tek kad je karta dovoljno uvećana.
export function visibleTacke(rows = [], zoom = 0) {
  return rows
    .filter((t) => t.aktivno !== false && Number.isFinite(t.lat) && Number.isFinite(t.lon) && zoom >= vrstaOf(t.vrsta).minZoom)
    .sort((a, b) => vrstaOf(a.vrsta).minZoom - vrstaOf(b.vrsta).minZoom || a.naziv.localeCompare(b.naziv, 'bs'));
}

// Kursor za inkrementalno preuzimanje po `updated_at` koje postavlja server; preklop 1 min zbog kasnih potvrda transakcija.
export const KURSOR_PREKLOP_MS = 60000;
export function nextTackeCursor(remote = [], prev = null) {
  const max = Math.max(...remote.map((r) => Date.parse(r?.updated_at)).filter(Number.isFinite));
  if (!Number.isFinite(max)) return prev;
  const v = new Date(max - KURSOR_PREKLOP_MS).toISOString();
  return prev && Date.parse(prev) >= Date.parse(v) ? prev : v;
}

// Tabela još ne postoji na serveru (migracija 042 nije pokrenuta): ne ponavljati upite, ništa se ne gubi.
export const missingTable = (err) => ['PGRST205', '42P01'].includes(err?.code) || /relation .* does not exist|could not find the table/i.test(err?.message || '');
