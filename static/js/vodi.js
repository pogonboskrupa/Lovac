// "Vodi me do" (čista logika): procjena vremena hoda, približavam li se cilju i stanje dolaska.

export const STIGAO_M = 15;
export const BLIZU_M = 100;
// Hod po šumi i brdu: ~3 km/h (sporije od staze); procjena je gruba i UI to kaže ("≈").
export const HOD_KMH = 3;

export function walkEta(m) {
  if (!Number.isFinite(m) || m < STIGAO_M) return '';
  const min = Math.max(1, Math.round((m / 1000 / HOD_KMH) * 60));
  if (min < 60) return `≈ ${min} min hoda`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `≈ ${h} h${r ? ` ${r} min` : ''} hoda`;
}

// Trend iz dvije udaljenosti: šum GPS-a (± tačnost) se ne smije čitati kao kretanje.
export function trendOf(prev, cur, accuracy = 10) {
  if (!Number.isFinite(prev) || !Number.isFinite(cur)) return 'nepoznato';
  const prag = Math.max(5, Math.min(accuracy || 10, 30));
  if (cur < prev - prag) return 'blize';
  if (cur > prev + prag) return 'dalje';
  return 'isto';
}

export const TREND_TEKST = { blize: 'Približavaš se', dalje: 'Udaljavaš se — provjeri pravac', isto: '', nepoznato: '' };

export function arrivalState(m) {
  if (!Number.isFinite(m)) return 'ceka';
  return m < STIGAO_M ? 'stigao' : m < BLIZU_M ? 'blizu' : 'daleko';
}
