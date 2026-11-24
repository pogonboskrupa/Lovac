// Potraga za ranjenom divljači: čista logika (znakovi, sažetak za panel, ishod). Sve radi bez interneta.
// Savjeti su orijentacioni — odluku o čekanju i toku potrage donosi vodič psa krvara / lovočuvar.
import { distanceM, bearingDeg, formatMemberDistance } from './istrazivac.js';
import { compassName } from './geo.js';

// Znakovi na nastrijelu (višestruki izbor).
export const ZNAKOVI_NASTRIJELA = [
  { kod: 'krv_svijetla', naziv: 'Svijetla, pjenasta krv' },
  { kod: 'krv_tamna', naziv: 'Tamna krv' },
  { kod: 'sadrzaj', naziv: 'Sadržaj buraga/crijeva' },
  { kod: 'dlaka', naziv: 'Dlaka' },
  { kod: 'kost', naziv: 'Komadići kosti' },
  { kod: 'bez_znaka', naziv: 'Nema znaka' },
];

// Znakovi na tragu tokom potrage.
export const ZNAKOVI_TRAGA = [
  { kod: 'krv', naziv: 'Krv' },
  { kod: 'dlaka', naziv: 'Dlaka' },
  { kod: 'kost', naziv: 'Kost' },
  { kod: 'lezaj', naziv: 'Ležaj / zastoj' },
  { kod: 'drugo', naziv: 'Drugo' },
];

export const PRIJE_PUCNJA = [[0, 'Upravo'], [15, '15 min'], [30, '30 min'], [60, '1 h'], [120, '2 h+']];

export const ISHODI = [
  { kod: 'pronadjena', naziv: 'Divljač pronađena' },
  { kod: 'nije_pronadjena', naziv: 'Nije pronađena' },
  { kod: 'prekinuta', naziv: 'Potraga prekinuta' },
];
export const ishodNaziv = (kod) => ISHODI.find((i) => i.kod === kod)?.naziv || '';
export const znakNaziv = (kod) => (ZNAKOVI_TRAGA.find((z) => z.kod === kod) || ZNAKOVI_NASTRIJELA.find((z) => z.kod === kod))?.naziv || 'Krv';

// Orijentacioni savjet po znakovima nastrijela (ne pravilo): šta znaci obično znače i koliko je oprez važan.
export function shotHint(znakovi = []) {
  const z = new Set(znakovi);
  if (z.has('sadrzaj') || z.has('krv_tamna')) {
    return 'Tamna krv ili sadržaj buraga obično znače pogodak u trbuh ili jetru: divljač može otići daleko. Ne požuruj — dogovori se sa vodičem psa krvara.';
  }
  if (z.has('kost')) return 'Komadići kosti mogu značiti pogodak u noge: divljač često ide daleko. Pas krvar je najsigurniji put.';
  if (z.has('krv_svijetla')) return 'Svijetla, pjenasta krv obično znači pogodak u pluća. I tada prilazi oprezno.';
  if (z.has('bez_znaka')) return 'Bez znaka ne znači promašaj: provjeri šire oko nastrijela i javi vodiču psa krvara.';
  return '';
}

// Vrijeme pucnja: tačka nastrijela minus "prije koliko minuta".
export const shotTime = (tr) => (tr?.nastrijel ? (tr.nastrijel.t ?? 0) - (tr.nastrijel.prije_min || 0) * 60000 : null);

export function sinceShotText(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

// Znakovi na tragu po vremenu (stari zapisi nemaju `tip` = krv).
export const signsOf = (tr) => [...(tr?.krv || [])].map((k) => ({ ...k, tip: k.tip || 'krv' })).sort((a, b) => (a.t ?? 0) - (b.t ?? 0));

// Putanja znakova: nastrijel → znakovi po redu (isprekidana linija na karti).
export function signsPath(tr) {
  const pts = [];
  if (tr?.nastrijel) pts.push([tr.nastrijel.lat, tr.nastrijel.lon]);
  for (const s of signsOf(tr)) pts.push([s.lat, s.lon]);
  return pts;
}

// Kratak red za panel potrage.
export function searchSummary(tr, fix, now = Date.now()) {
  if (!tr?.nastrijel) return '';
  const parts = [];
  if (fix) {
    const d = distanceM(fix, tr.nastrijel);
    parts.push(`nastrijel ${formatMemberDistance(d)}${d >= 10 ? ` ${compassName(bearingDeg(fix, tr.nastrijel))}` : ''}`);
  }
  const s = signsOf(tr);
  parts.push(`znakova ${s.length}`);
  if (fix && s.length) parts.push(`zadnji ${formatMemberDistance(distanceM(fix, s[s.length - 1]))}`);
  const t = shotTime(tr);
  if (t) parts.push(`od pucnja ${sinceShotText(now - t)}`);
  return parts.join(' · ');
}
