// Tekstualna pretraga u spiskovima: bez razlike velika/mala slova i bez dijakritika (č ć š ž đ).

export function normalizeText(s) {
  return String(s ?? '').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Svaka riječ upita mora se naći negdje u poljima (redoslijed nije bitan).
export function matchesQuery(fields, query) {
  const words = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalizeText(fields.filter((f) => f != null).join(' '));
  return words.every((w) => hay.includes(w));
}
