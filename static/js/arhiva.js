// Arhiva lova (čista logika): spisak lovova, vrijeme, šta se lovilo, ko smije dodavati slike.

import { matchesQuery } from './pretraga.js';
import { summarizeHarvest, formatDecimalBs } from './odstrel.js';
import { trailMeters } from './istrazivac-pregled.js';

export const MAX_PHOTOS_PER_HUNT = 40;

// Lovovi u toku i završeni (novije prvo); planirani nisu u arhivi.
export function archiveHunts(lovovi) {
  return lovovi
    .filter((z) => ['zavrsen', 'u_toku'].includes(z.lov.status))
    .sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)) || String(b.lov.pocetak || '').localeCompare(String(a.lov.pocetak || '')));
}

const p2 = (n) => String(n).padStart(2, '0');
const hm = (iso) => `${p2(new Date(iso).getHours())}:${p2(new Date(iso).getMinutes())}`;

export function huntDate(datum) {
  const [y, m, d] = String(datum).slice(0, 10).split('-');
  return y && m && d ? `${d}.${m}.${y}.` : String(datum);
}

export function huntTimeRange(lov) {
  if (!lov.pocetak) return 'Vrijeme nije zabilježeno';
  if (lov.status === 'u_toku' || !lov.kraj) return `od ${hm(lov.pocetak)} · u toku`;
  const min = Math.max(0, Math.round((Date.parse(lov.kraj) - Date.parse(lov.pocetak)) / 60000));
  return `${hm(lov.pocetak)} – ${hm(lov.kraj)} (${min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${p2(min % 60)} min`})`;
}

// "Divlja svinja 2, Lisica 1" iz odstrela lova; nameOf(kod) daje naziv vrste.
export function huntedText(odstrel, nameOf) {
  const s = summarizeHarvest(odstrel.map((o) => ({ vrsta: o.vrsta, tezina: o.tezina })));
  return s.length ? s.map((x) => `${nameOf(x.vrsta)} ${x.komada}`).join(', ') : '';
}

// Slike dodaju učesnici lova i upravljač (organizator, grupovođa sekcije, admin); najviše MAX_PHOTOS_PER_HUNT po lovu.
export function canAddMedia(zapis, myId, isManager, photoCount = 0) {
  if (!zapis || photoCount >= MAX_PHOTOS_PER_HUNT) return false;
  return isManager || Boolean(zapis.ucesnici?.some((u) => u.korisnik_id === myId));
}

export function matchesArchive(zapis, query, extraText = '') {
  const l = zapis.lov;
  return matchesQuery([l.naziv, huntDate(l.datum), l.datum, zapis.sekcija?.naziv, zapis.revir?.naziv, l.rezultat, extraText], query);
}

// Pregled arhive: broj lovova, ukupno komada ulova i slika (samo iz detalja koji su na telefonu).
export function archiveOverview(hunts, detailsOf) {
  let komada = 0;
  let slika = 0;
  for (const z of hunts) {
    const d = detailsOf(z.id);
    if (!d) continue;
    komada += (d.odstrel || []).length;
    slika += (d.slike || []).length;
  }
  return { lovova: hunts.length, komada, slika };
}

// ---------- pogoci i kretanje u završenom lovu ----------
// Gdje je divljač ustrijeljena: odstrel sa tačkom (lat/lon, migracija 043) ide na kartu, ostali se samo navode (`bez`).
export function shotsOnMap(odstrel = [], nameOf = (id) => id, speciesOf = (k) => k) {
  const sa = [];
  let bez = 0;
  [...odstrel].sort((a, b) => String(a.vrijeme).localeCompare(String(b.vrijeme))).forEach((o) => {
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon)) { bez++; return; }
    sa.push({
      id: o.id, lat: o.lat, lon: o.lon, vrsta: o.vrsta, naziv: speciesOf(o.vrsta), kategorija: o.kategorija || '',
      lovac: nameOf(o.korisnik_id), vrijeme: o.vrijeme, tezina: o.tezina ?? null, stan: o.stan_broj ?? null,
    });
  });
  return { sa, bez };
}

// "Divlja svinja · Lovro Lovac · 10:42 · 85,5 kg · stan 3"
export function shotLine(s) {
  const dio = [s.naziv, s.lovac];
  if (s.vrijeme && Number.isFinite(Date.parse(s.vrijeme))) dio.push(hm(s.vrijeme));
  if (Number.isFinite(s.tezina)) dio.push(`${formatDecimalBs(Math.round(s.tezina * 10) / 10)} kg`);
  if (Number.isFinite(s.stan)) dio.push(`stan ${s.stan}`);
  return dio.join(' · ');
}

export function formatKmM(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2).replace('.', ',')} km`;
}

export function formatMinutes(min) {
  const m = Math.max(0, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${p2(m % 60)} min`;
}

// Kretanje lovaca iz traga lova (redovi lov_tragovi): pređeno i vrijeme od prve do zadnje tačke, po lovcu, najduži prvi.
export function huntMovement(rows = [], nameOf = (id) => id) {
  const by = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r?.lat) || !Number.isFinite(r?.lon)) continue;
    if (!by.has(r.korisnik_id)) by.set(r.korisnik_id, []);
    by.get(r.korisnik_id).push(r);
  }
  return [...by.entries()].map(([id, pts]) => {
    pts.sort((a, b) => String(a.t).localeCompare(String(b.t)));
    const t0 = Date.parse(pts[0].t);
    const t1 = Date.parse(pts[pts.length - 1].t);
    return { id, ime: nameOf(id), tacaka: pts.length, metara: trailMeters(pts), minuta: Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0, (t1 - t0) / 60000) : 0 };
  }).sort((a, b) => b.metara - a.metara);
}
