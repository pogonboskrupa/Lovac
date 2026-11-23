// Kalendar arhive lova (čista logika): mreža mjeseca od ponedjeljka, lovovi po danu, početni mjesec, sloj lova na karti.

export const MJESECI = ['Januar', 'Februar', 'Mart', 'April', 'Maj', 'Juni', 'Juli', 'August', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'];
export const DANI = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];

const p2 = (n) => String(n).padStart(2, '0');
const iso = (y, m0, d) => `${y}-${p2(m0 + 1)}-${p2(d)}`;

export const monthLabel = ({ y, m }) => `${MJESECI[m]} ${y}.`;

export function shiftMonth({ y, m }, delta) {
  const t = y * 12 + m + delta;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

// Sedmice mjeseca (pon–ned); dani susjednih mjeseci popunjavaju prvu i zadnju sedmicu (uMjesecu: false).
// Računa se kalendarski (UTC), bez zavisnosti od vremenske zone telefona.
export function monthGrid({ y, m }, today = '') {
  const first = new Date(Date.UTC(y, m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // pon = 0
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const total = Math.ceil((lead + days) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(Date.UTC(y, m, 1 - lead + i));
    const datum = iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ datum, dan: d.getUTCDate(), uMjesecu: d.getUTCMonth() === m, danas: datum === today });
  }
  return weeks;
}

// zapisi lova iz keša ({ lov: { datum, ... } }) po datumu
export function huntsByDate(hunts = []) {
  const by = new Map();
  for (const z of hunts) {
    const d = z?.lov?.datum;
    if (!d) continue;
    by.set(d, [...(by.get(d) || []), z]);
  }
  return by;
}

// Početni mjesec: mjesec zadnjeg lova koji nije u budućnosti, inače današnji.
export function initialMonth(hunts = [], today) {
  const past = hunts.map((z) => z?.lov?.datum).filter((d) => d && d <= today).sort();
  const d = past.at(-1) || today;
  return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 };
}

export function monthStats(hunts = [], { y, m }) {
  const prefix = `${y}-${p2(m + 1)}`;
  const inMonth = hunts.filter((z) => String(z?.lov?.datum || '').startsWith(prefix));
  return { lovova: inMonth.length, dana: new Set(inMonth.map((z) => z.lov.datum)).size };
}

// Slike lova sa lokacijom (za kartu); ostale se samo broje.
export function photosOnMap(slike = []) {
  const sa = slike.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  return { sa, bez: slike.length - sa.length };
}
