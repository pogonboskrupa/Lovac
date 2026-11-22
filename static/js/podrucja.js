// Preuzeta područja za rad bez interneta (čista logika): spisak, pokrivenost i opis.

export const PODRUCJA_KEY = 'lovac.pred.podrucja';
export const MAX_PODRUCJA = 20;

const BASE_NAZIV = { topo: 'Topo', satelit: 'Satelit' };

// area = { id, base, bounds:{south,west,north,east}, zMin, zMax, plocica, gresaka, t }
export function addArea(list, area, max = MAX_PODRUCJA) {
  const rest = list.filter((a) => a.id !== area.id);
  return [area, ...rest].sort((a, b) => b.t - a.t).slice(0, max);
}

export function removeArea(list, id) {
  return list.filter((a) => a.id !== id);
}

const contains = (outer, inner) => outer.south <= inner.south && outer.north >= inner.north && outer.west <= inner.west && outer.east >= inner.east;

// Pokriva li neko preuzeto područje isti prikaz (ista podloga, isto ili veće približenje, bez grešaka)?
export function coveringArea(list, base, bounds, zoom) {
  return list.find((a) => a.base === base && a.gresaka === 0 && contains(a.bounds, bounds) && a.zMax >= zoom && a.zMin <= zoom) || null;
}

export function areaTitle(a) {
  return `${BASE_NAZIV[a.base] || a.base} · zoom ${a.zMin}–${a.zMax}`;
}

export function areaDate(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}.`;
}

export function areaDetail(a) {
  return `${a.plocica} pločica${a.gresaka ? `, ${a.gresaka} nije stiglo` : ''} · ${areaDate(a.t)}`;
}

export function areasSummary(list) {
  return { broj: list.length, plocica: list.reduce((s, a) => s + (a.plocica || 0), 0) };
}

export function newAreaId(base, bounds, zMax) {
  const r = (n) => Math.round(n * 1000);
  return `${base}:${r(bounds.south)}:${r(bounds.west)}:${r(bounds.north)}:${r(bounds.east)}:${zMax}`;
}
