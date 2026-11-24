// Čista logika opažanja divljači: filter, gustina, zbir, periodi.

const M_PER_DEG_LAT = 111320;

export function clampCount(n) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(999, v);
}

export function filterObservations(list, { vrsta = null, od = null, do: doT = null } = {}) {
  return list.filter((o) => (!vrsta || o.vrsta === vrsta)
    && (od == null || o.vrijeme >= od)
    && (doT == null || o.vrijeme <= doT));
}

// Mreža kvadrata ~cellM metara; intenzitet 0–1 relativno na najgušću ćeliju.
export function densityGrid(list, cellM = 500) {
  if (!list.length) return [];
  const refLat = list.reduce((s, o) => s + o.lat, 0) / list.length;
  const dLat = cellM / M_PER_DEG_LAT;
  const dLon = cellM / (M_PER_DEG_LAT * Math.cos(refLat * Math.PI / 180));
  const cells = new Map();
  for (const o of list) {
    const i = Math.floor(o.lat / dLat);
    const j = Math.floor(o.lon / dLon);
    const key = `${i}:${j}`;
    const c = cells.get(key) || { lat0: i * dLat, lon0: j * dLon, lat1: (i + 1) * dLat, lon1: (j + 1) * dLon, count: 0 };
    c.count += o.broj || 1;
    cells.set(key, c);
  }
  const max = Math.max(...[...cells.values()].map((c) => c.count));
  return [...cells.values()].map((c) => ({ ...c, intensity: c.count / max }));
}

export function summarizeBySpecies(list) {
  const m = new Map();
  for (const o of list) {
    const s = m.get(o.vrsta) || { vrsta: o.vrsta, opazanja: 0, grla: 0 };
    s.opazanja += 1;
    s.grla += o.broj || 1;
    m.set(o.vrsta, s);
  }
  return [...m.values()].sort((a, b) => b.grla - a.grla);
}

export function periodRange(kind, now = Date.now()) {
  if (kind === 'sve') return { od: null, do: null };
  if (kind === 'godina') {
    const y = new Date(now).getFullYear();
    return { od: new Date(y, 0, 1).getTime(), do: now };
  }
  const days = Number(kind) || 30;
  return { od: now - days * 86400000, do: now };
}

// "Vidio": moje opažanje piše "ti (Ime Prezime)", podijeljeno tuđe ime vlasnika.
export function observerLabel(o, me, nameOf) {
  if (!o.tudji) return me ? `ti (${me.ime} ${me.prezime})` : 'ti';
  return nameOf(o.vlasnik_id);
}

// "u 1 opažanju", "u 2 opažanja", "u 5 opažanja" (lokativ jednine, genitiv za ostale brojeve).
export function inObservationsText(n) {
  const k = Math.abs(n) % 100;
  return `u ${n} ${n % 10 === 1 && k !== 11 ? 'opažanju' : 'opažanja'}`;
}

// Starost opažanja za izgled oznake na karti: danas (< 24 h), sedmica (< 7 dana), mjesec (< 30 dana), staro.
export function observationAge(vrijeme, now = Date.now()) {
  const d = (now - Number(vrijeme)) / 86400000;
  if (!Number.isFinite(d)) return 'staro';
  if (d < 1) return 'danas';
  if (d < 7) return 'sedmica';
  return d < 30 ? 'mjesec' : 'staro';
}

// Broj grla na oznaci: 1 se ne piše (emblem je dovoljan), preko 99 skraćeno.
export function markerCountText(n) {
  const k = Math.floor(Number(n));
  if (!Number.isFinite(k) || k <= 1) return '';
  return k > 99 ? '99+' : String(k);
}
