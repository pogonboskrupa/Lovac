// Lovno vrijeme i lovostaj iz admin spiskova. Kod ne zna nijedan datum ni pravilo:
// bez reda koji je unio admin, odgovor je "nije uneseno", nikad pretpostavka.

const MIN = 60000;

export function pickRule(rules, vrstaKod) {
  const active = rules.filter((r) => r.aktivno !== false);
  return (vrstaKod && active.find((r) => r.vrsta_kod === vrstaKod))
    || active.find((r) => r.vrsta_kod == null)
    || null;
}

export function huntingWindow(sun, rule) {
  if (!rule || sun.izlazak == null || sun.zalazak == null) return null;
  return { od: sun.izlazak - rule.prije_izlaska_min * MIN, do: sun.zalazak + rule.poslije_zalaska_min * MIN };
}

export function huntingStatus(now, w) {
  if (now < w.od) return { stanje: 'prije', zaMs: w.od - now };
  if (now <= w.do) return { stanje: 'traje', zaMs: w.do - now };
  return { stanje: 'poslije', zaMs: 0 };
}

export function formatCountdown(ms) {
  const totalMin = Math.max(0, Math.ceil(ms / MIN));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseDayMonth(s) {
  const m = /^\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > DAYS_IN_MONTH[mo - 1]) return null;
  return `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function formatDayMonth(md) {
  if (!md) return '—';
  const [mo, d] = md.split('-').map(Number);
  return `${d}.${mo}.`;
}

export function toMonthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Period se ponavlja svake godine i može preći Novu godinu (npr. 10-01 .. 01-31).
export function inPeriod(md, od, doMd) {
  return od <= doMd ? md >= od && md <= doMd : md >= od || md <= doMd;
}

function daysUntil(fromMd, toMd) {
  const y = 2025; // nije prestupna; dovoljno za redoslijed
  const a = new Date(y, Number(fromMd.slice(0, 2)) - 1, Number(fromMd.slice(3)));
  let b = new Date(y, Number(toMd.slice(0, 2)) - 1, Number(toMd.slice(3)));
  if (b < a) b = new Date(y + 1, b.getMonth(), b.getDate());
  return Math.round((b - a) / 86400000);
}

export function seasonStatus(rows, vrsta, kategorija, date) {
  const forSpecies = rows.filter((r) => r.aktivno !== false && r.vrsta_kod === vrsta);
  if (!forSpecies.length) return { stanje: 'nepoznato' };
  const md = toMonthDay(date);
  const candidates = forSpecies.filter((r) => !kategorija || r.kategorija_kod == null || r.kategorija_kod === kategorija);
  const open = candidates.filter((r) => inPeriod(md, r.otvoreno_od, r.otvoreno_do));
  if (open.length) {
    const closing = open.map((r) => r.otvoreno_do).sort((a, b) => daysUntil(md, b) - daysUntil(md, a))[0];
    const samoZa = !kategorija && open.every((r) => r.kategorija_kod != null) ? [...new Set(open.map((r) => r.kategorija_kod))] : [];
    return { stanje: 'otvoreno', do: closing, samoZa };
  }
  const next = candidates.map((r) => r.otvoreno_od).sort((a, b) => daysUntil(md, a) - daysUntil(md, b))[0] ?? null;
  return { stanje: 'lovostaj', od: next };
}
