// Pregled Odstrela i Opažanja (čista logika): emblem vrste, stupci po mjesecima, najveći komad, sortiranje, grupisanje
// po mjesecima, filter po prijavi, doba dana opažanja (zora/dan/sumrak/noć iz položaja sunca) i "zadnje opažanje".

import { VRSTE_DIVLJACI } from './divljac.js';
import { sunTimes, daylightStatus } from './sunce.js';

const DAY_MS = 86400000;
const BOJE = ['#6b3f26', '#92400e', '#44403c', '#334155', '#854d0e', '#9f1239', '#4d7c0f', '#155e75', '#6d28d9', '#065f46'];
const MJESECI_NAZIV = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Juni', 'Juli', 'August', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];

// Emblem vrste: boje i znak iz Divljači ako je vrsta tamo, inače boja iz haša koda i prva dva slova naziva.
export function speciesBadge(kod, naziv = '') {
  const v = VRSTE_DIVLJACI.find((x) => x.kod === kod);
  if (v) return { boja: v.boja, znak: v.znak };
  let h = 0;
  for (const ch of String(kod)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const slova = String(naziv || kod).replace(/[^\p{L}]/gu, '').slice(0, 2);
  return { boja: BOJE[h % BOJE.length], znak: (slova || '?').toUpperCase() };
}

// Zadnjih n mjeseci (najstariji prvi, zadnji = tekući): [{godina, mjesec (1–12), vrijednost}].
export function lastMonths(items, timeOf, valueOf = () => 1, now = Date.now(), n = 12) {
  const d = new Date(now);
  const slots = Array.from({ length: n }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1);
    return { godina: m.getFullYear(), mjesec: m.getMonth() + 1, vrijednost: 0 };
  });
  for (const it of items) {
    const t = new Date(timeOf(it));
    const s = slots.find((x) => x.godina === t.getFullYear() && x.mjesec === t.getMonth() + 1);
    if (s) s.vrijednost += valueOf(it);
  }
  return slots;
}

export function biggestHarvest(items) {
  const withKg = items.filter((o) => Number(o.tezina) > 0);
  return withKg.length ? withKg.reduce((a, b) => (Number(b.tezina) > Number(a.tezina) ? b : a)) : null;
}

export function sortHarvest(items, mode) {
  const list = [...items];
  if (mode === 'teze') return list.sort((a, b) => (Number(b.tezina) || 0) - (Number(a.tezina) || 0) || b.vrijeme - a.vrijeme);
  return list.sort((a, b) => b.vrijeme - a.vrijeme);
}

export function sortObservations(items, mode) {
  const list = [...items];
  if (mode === 'grla') return list.sort((a, b) => (b.broj || 1) - (a.broj || 1) || b.vrijeme - a.vrijeme);
  return list.sort((a, b) => b.vrijeme - a.vrijeme);
}

// Grupe po mjesecu u redoslijedu liste (lista mora biti sortirana po vremenu).
export function groupByMonthOf(items, timeOf) {
  const out = [];
  for (const it of items) {
    const d = new Date(timeOf(it));
    const kljuc = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = out[out.length - 1];
    if (!g || g.kljuc !== kljuc) { g = { kljuc, naziv: `${MJESECI_NAZIV[d.getMonth()]} ${d.getFullYear()}.`, items: [] }; out.push(g); }
    g.items.push(it);
  }
  return out;
}

export const PRIJAVA_FILTERI = [['svi', 'Svi'], ['neprijavljeni', 'Neprijavljeni'], ['prijavljeni', 'Prijavljeni']];

// stateOf(id) vraća 'nema' | 'ceka' | 'poslana' | 'povucena' | 'odbijena'.
export function filterReported(items, mode, stateOf) {
  const reported = (o) => ['ceka', 'poslana'].includes(stateOf(o.id));
  if (mode === 'prijavljeni') return items.filter(reported);
  if (mode === 'neprijavljeni') return items.filter((o) => !reported(o) && !o.tudji);
  return items;
}

// Doba dana opažanja po položaju sunca na toj lokaciji: 'zora' | 'dan' | 'sumrak' | 'noc'.
export function observationLight(o) {
  if (!Number.isFinite(o?.lat) || !Number.isFinite(o?.lon)) return null;
  const d = new Date(o.vrijeme);
  const noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
  const st = daylightStatus(o.vrijeme, sunTimes(noon, o.lat, o.lon)).stanje;
  return st === 'nepoznato' ? null : st;
}

export const DOBA_DANA_OPAZANJA = [['zora', 'Zora'], ['dan', 'Dan'], ['sumrak', 'Sumrak'], ['noc', 'Noć']];

// Koliko grla je viđeno u kojem dobu dana.
export function lightDistribution(list) {
  const out = { zora: 0, dan: 0, sumrak: 0, noc: 0 };
  for (const o of list) {
    const k = observationLight(o);
    if (k) out[k] += o.broj || 1;
  }
  return out;
}

export function lastSeenText(list, now = Date.now()) {
  if (!list.length) return '—';
  const t = Math.max(...list.map((o) => o.vrijeme));
  const days = Math.floor((now - t) / DAY_MS);
  if (days <= 0) return 'danas';
  if (days === 1) return 'jučer';
  return `prije ${days} d`;
}
