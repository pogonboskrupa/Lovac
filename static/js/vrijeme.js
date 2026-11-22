// Vrijeme za danas iz Open-Meteo prognoze (čista logika): opis, tekući sat, sati dana, sažetak, jačina vjetra.

const HOUR = 3600000;

const KODOVI = [
  [[0], 'Vedro'], [[1], 'Pretežno vedro'], [[2], 'Djelimično oblačno'], [[3], 'Oblačno'],
  [[45, 48], 'Magla'], [[51, 53, 55, 56, 57], 'Rosulja'], [[61, 63, 80], 'Kiša'], [[65, 66, 67, 81, 82], 'Jaka kiša'],
  [[71, 73, 75, 77, 85, 86], 'Snijeg'], [[95, 96, 99], 'Grmljavina'],
];

export function weatherLabel(code) {
  if (code == null) return '—';
  return KODOVI.find(([c]) => c.includes(code))?.[1] || '—';
}

// Prognoza starog keša (samo vjetar) nema temperaturu: mora se ponovo preuzeti.
export function hasWeather(fc) {
  return Boolean(fc?.sati?.some((s) => s.temp != null));
}

export function currentHour(fc, now = Date.now()) {
  return fc?.sati?.find((s) => now >= s.t && now < s.t + HOUR) || null;
}

// Sati lokalnog dana u kojem je `now` (00:00–24:00).
export function hoursOfDay(fc, now = Date.now()) {
  const d = new Date(now);
  const od = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const doo = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return (fc?.sati || []).filter((s) => s.t >= od && s.t < doo);
}

export function daySummary(hours) {
  const t = hours.map((h) => h.temp).filter((v) => v != null);
  if (!t.length) return null;
  const gusts = hours.map((h) => h.udari ?? h.brzina).filter((v) => v != null);
  return {
    min: Math.min(...t), max: Math.max(...t),
    padavine: Math.round(hours.reduce((s, h) => s + (h.padavine || 0), 0) * 10) / 10,
    najjaciUdar: gusts.length ? Math.max(...gusts) : null,
  };
}

// Beaufort-ish opis iz m/s.
export function windStrength(ms) {
  if (ms == null) return '—';
  if (ms < 0.5) return 'bez vjetra';
  if (ms < 3.4) return 'slab vjetar';
  if (ms < 8) return 'umjeren vjetar';
  if (ms < 14) return 'jak vjetar';
  return 'olujni vjetar';
}

// Smjer u koji vjetar duva (suprotno od "odakle duva").
export const windBlowsTo = (fromDeg) => (((fromDeg + 180) % 360) + 360) % 360;
