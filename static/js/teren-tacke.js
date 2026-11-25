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

// ---------- veličina i raspored oznaka na karti ----------
// Oznaka je srazmjerna razmjeri: što je karta manje uvećana, to je manja (15 % po nivou zooma u oba smjera),
// a "radni" zoom 14 je 60 % ranije veličine (odluka vlasnika: umanjiti za 40 %). Ispod 7 px slovo se ne čita.
export const LABEL_BASE_PX = { naselje: 15, default: 13 };
export const LABEL_MIN_PX = 7;
export const LABEL_REF_ZOOM = 14;
export const LABEL_REF_SCALE = 0.6;

export function labelScale(zoom) {
  const k = LABEL_REF_SCALE * 1.15 ** ((Number.isFinite(zoom) ? zoom : LABEL_REF_ZOOM) - LABEL_REF_ZOOM);
  return Math.min(1, Math.max(0.35, k));
}

export function labelFontPx(vrsta, zoom) {
  return Math.max(LABEL_MIN_PX, (LABEL_BASE_PX[vrsta] ?? LABEL_BASE_PX.default) * labelScale(zoom));
}

// Okvir oznake u pikselima ekrana: tačka je u (x, y), tekst desno od nje (naselja su velikim slovima i šira).
export function labelBox({ naziv, vrsta }, x, y, zoom) {
  const px = labelFontPx(vrsta, zoom);
  const znak = vrsta === 'naselje' ? 0.72 : 0.58;
  const w = Math.max(6, px * 0.8) + 5 + String(naziv).length * px * znak;
  const h = px * 1.35;
  return { x1: x - 5, y1: y - h / 2, x2: x - 5 + w, y2: y + h / 2 };
}

const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

// Redom po važnosti (ulaz je već poredan): oznaka koja bi prekrila već postavljenu se ne crta, da karta ostane čitljiva.
// `razmak` je prazan prostor oko oznake (px).
export function placeLabels(items, project, zoom, razmak = 3) {
  const placed = [];
  const out = [];
  for (const t of items) {
    const { x, y } = project(t);
    const b = labelBox(t, x, y, zoom);
    const box = { x1: b.x1 - razmak, y1: b.y1 - razmak, x2: b.x2 + razmak, y2: b.y2 + razmak };
    if (placed.some((p) => overlap(p, box))) continue;
    placed.push(box);
    out.push(t);
  }
  return out;
}
