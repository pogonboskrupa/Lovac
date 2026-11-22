// Arhiva lova (čista logika): spisak lovova, vrijeme, šta se lovilo, ko smije dodavati slike.

import { matchesQuery } from './pretraga.js';
import { summarizeHarvest } from './odstrel.js';

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
