// Statistika odstrela po godini, vrsti, mjesecu, reviru, sekciji i lovcu (čista logika).

export const UNKNOWN = '_nepoznato';

export function yearsOf(list) {
  return [...new Set(list.map((o) => new Date(o.vrijeme).getFullYear()))].sort((a, b) => b - a);
}

const bump = (map, key, o) => {
  const s = map.get(key) || { kljuc: key, komada: 0, tezina: 0, sTezinom: 0 };
  s.komada += 1;
  if (Number.isFinite(Number(o.tezina)) && Number(o.tezina) > 0) { s.tezina += Number(o.tezina); s.sTezinom += 1; }
  map.set(key, s);
};

const finish = (map) => [...map.values()]
  .map((s) => ({ ...s, prosjek: s.sTezinom ? s.tezina / s.sTezinom : null }))
  .sort((a, b) => b.komada - a.komada || String(a.kljuc).localeCompare(String(b.kljuc), 'bs'));

// lovacOf(o) vraća ime odstrijelioca; revir/sekcija iz zapisa vezanog za lov (inače UNKNOWN = "izvan lova").
export function harvestStats(list, { godina = null, vrsta = null, revir = null, sekcija = null } = {}, lovacOf = (o) => o.lovac || '') {
  const items = list.filter((o) => (godina == null || new Date(o.vrijeme).getFullYear() === godina)
    && (!vrsta || o.vrsta === vrsta)
    && (!revir || (o.revir_id || UNKNOWN) === revir)
    && (!sekcija || (o.sekcija_id || UNKNOWN) === sekcija));
  const vrste = new Map();
  const reviri = new Map();
  const sekcije = new Map();
  const lovci = new Map();
  const mjeseci = Array.from({ length: 12 }, () => 0);
  for (const o of items) {
    bump(vrste, o.vrsta, o);
    bump(reviri, o.revir_id || UNKNOWN, o);
    bump(sekcije, o.sekcija_id || UNKNOWN, o);
    bump(lovci, lovacOf(o) || UNKNOWN, o);
    mjeseci[new Date(o.vrijeme).getMonth()] += 1;
  }
  const tezina = items.reduce((s, o) => s + (Number(o.tezina) > 0 ? Number(o.tezina) : 0), 0);
  return { ukupno: { komada: items.length, tezina }, poVrsti: finish(vrste), poReviru: finish(reviri), poSekciji: finish(sekcije), poLovcu: finish(lovci), poMjesecu: mjeseci };
}

// Redovi za CSV/PDF: grupa, naziv, komada, težina, prosjek.
export function statRows(stats, nameOf) {
  const rows = [];
  const add = (grupa, list, name) => list.forEach((s) => rows.push({
    grupa, naziv: s.kljuc === UNKNOWN ? 'Izvan lova / nije navedeno' : name(s.kljuc), komada: s.komada, tezina: s.tezina, prosjek: s.prosjek,
  }));
  add('Vrsta', stats.poVrsti, nameOf.vrsta);
  add('Revir', stats.poReviru, nameOf.revir);
  add('Sekcija', stats.poSekciji, nameOf.sekcija);
  add('Lovac', stats.poLovcu, (k) => k);
  return rows;
}
