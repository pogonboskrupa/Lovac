// Luk dnevnog svjetla od svitanja do sumraka sa tačkom "sada" (čista geometrija, bez DOM-a).

export const LUK = { sirina: 320, visina: 130, baza: 104, uspon: 84, rub: 16 };

// Udio (0..1) trenutka unutar raspona; izvan raspona se steže na rub.
export function fraction(ms, od, do_) {
  if (od == null || do_ == null || do_ <= od) return null;
  return Math.min(1, Math.max(0, (ms - od) / (do_ - od)));
}

// Tačka na luku za udio f (0 = svitanje, 1 = suton). Luk je sinus: najviše u sredini dana.
export function arcPoint(f, g = LUK) {
  const w = g.sirina - 2 * g.rub;
  return { x: g.rub + f * w, y: g.baza - g.uspon * Math.sin(Math.PI * f) };
}

export function arcPath(f0, f1, g = LUK, koraka = 24) {
  const pts = [];
  for (let i = 0; i <= koraka; i++) {
    const p = arcPoint(f0 + ((f1 - f0) * i) / koraka, g);
    pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
  }
  return `M${pts.join(' L')}`;
}

// Sve što crtež treba: udjeli izlaska/zalaska, položaj sada, da li je sada izvan svitanje–suton.
export function dayArc(now, sun) {
  const { svitanje, izlazak, zalazak, suton } = sun || {};
  if ([svitanje, izlazak, zalazak, suton].some((v) => v == null) || suton <= svitanje) return null;
  return {
    izlazak: fraction(izlazak, svitanje, suton),
    zalazak: fraction(zalazak, svitanje, suton),
    sada: fraction(now, svitanje, suton),
    izvan: now < svitanje || now > suton,
  };
}
