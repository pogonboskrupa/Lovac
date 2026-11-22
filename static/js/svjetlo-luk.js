// Luk dnevnog svjetla od svitanja do sumraka sa tačkom "sada" (čista geometrija, bez DOM-a).

export const LUK = { sirina: 320, visina: 130, baza: 104, uspon: 84, rub: 16 };

// Udio (0..1) trenutka unutar raspona; izvan raspona se steže na rub.
export function fraction(ms, od, do_) {
  if (od == null || do_ == null || do_ <= od) return null;
  return Math.min(1, Math.max(0, (ms - od) / (do_ - od)));
}

// Tačka na luku za udio f (0 = svitanje, 1 = suton). Vrh luka je u `vrh` (udio podneva, sunčeva kulminacija):
// prije podneva sunce se penje, poslije se spušta, pa luk nije simetričan kad podne nije tačno sredina dana.
export function arcPoint(f, g = LUK, vrh = 0.5) {
  const w = g.sirina - 2 * g.rub;
  const v = Math.min(0.95, Math.max(0.05, vrh));
  const ugao = f <= v ? (f / v) * (Math.PI / 2) : Math.PI / 2 + ((f - v) / (1 - v)) * (Math.PI / 2);
  return { x: g.rub + f * w, y: g.baza - g.uspon * Math.sin(ugao) };
}

export function arcPath(f0, f1, g = LUK, koraka = 24, vrh = 0.5) {
  const pts = [];
  for (let i = 0; i <= koraka; i++) {
    const p = arcPoint(f0 + ((f1 - f0) * i) / koraka, g, vrh);
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

// Sve što crtež treba: udjeli izlaska/zalaska, položaj sada, da li je sada izvan svitanje–suton.
export function dayArc(now, sun) {
  const { svitanje, izlazak, zalazak, suton, podne } = sun || {};
  if ([svitanje, izlazak, zalazak, suton].some((v) => v == null) || suton <= svitanje) return null;
  return {
    izlazak: fraction(izlazak, svitanje, suton),
    zalazak: fraction(zalazak, svitanje, suton),
    podne: podne == null ? 0.5 : fraction(podne, svitanje, suton),
    sada: fraction(now, svitanje, suton),
    izvan: now < svitanje || now > suton,
  };
}
