// Okretanje karte u Istraživaču (čista logika). Rotacija je ugao u smjeru kazaljke kojim je karta zarotirana na ekranu.

import { angleDelta } from './kompas.js';

export const ROT_KORAK = 15;

const norm = (d) => ((d % 360) + 360) % 360;

// Ugao prave koja spaja dva dodira (stepeni, 0 = udesno, raste u smjeru kazaljke na ekranu).
export function touchAngle(a, b) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

export function rotateBy(rot, delta) {
  return norm(rot + delta);
}

// Karta zarotirana tako da smjer gledanja bude gore: sjever mora ići za -heading.
export function rotationForHeading(heading) {
  return Number.isFinite(heading) ? norm(-heading) : 0;
}

// Smjer koji je na ekranu "gore" kad je karta zarotirana za rot.
export function upBearing(rot) {
  return norm(-rot);
}

// Promjena ugla dva dodira između dva događaja, najkraćim putem (prelazak ±180° ne smije skočiti).
export function gestureDelta(prevAngle, nextAngle) {
  return angleDelta(prevAngle, nextAngle);
}

// Pomak prsta po ekranu (dx, dy) u pomak centra karte u pikselima kontejnera (za Leaflet panBy).
// Redoslijed transforma je tilt → rotacija → razmjer, pa se vraća obrnutim redom; karta prati prst, centar ide suprotno.
export function screenDragToPan(dx, dy, rot, { tilt = 40, scale = 1.6 } = {}) {
  const r = (rot * Math.PI) / 180;
  const c = Math.cos((tilt * Math.PI) / 180) || 1;
  const vx = dx;
  const vy = dy / c;
  const x = vx * Math.cos(r) + vy * Math.sin(r);
  const y = -vx * Math.sin(r) + vy * Math.cos(r);
  return [-x / scale, -y / scale];
}

// Veći kontejner karte u 3D modu: pločice se učitavaju i za dio koji rotacija i nagib dovedu na ekran.
export const ISTRAZIVAC_POVRSINA = 2;

export function mapTransformCss(rot, { tilt = 40, scale = 1.6, p = 900 } = {}) {
  return `perspective(${p}px) rotateX(${tilt}deg) rotateZ(${Math.round(norm(rot) * 10) / 10}deg) scale(${scale})`;
}

// 3D pogled: ravan karte je kontejner nagnut (rotateX) i okrenut (rotateZ) oko sredine ekrana.
// Uzrok crnih ivica: kontejner 160 % ekrana (uzak i visok) uz fiksno uvećanje — okrenut, ne pokrije uglove ekrana.
// Ali kontejner se ne smije samo povećati: dio ravni koji se nagibom primakne oku dalje od perspektive (z ≥ p)
// preglednik odsiječe i pokvari crtanje (to je bila i stara zamka "kontejner 240 % briše kontrole").
// Zato: duža perspektiva (blaže skraćivanje), magla preko najdaljeg dijela pri strmom nagibu, kvadratni
// kontejner koji pokriva ekran za SVAKI okret, i provjera da nijedan ugao ravni ne dođe do oka.
export const ISTRAZIVAC_PERSPEKTIVA = 1500;
export const ISTRAZIVAC_UVECANJE = 1.6;
export const MAGLA_L = 1.6; // dio ravni sa perspektivnim faktorom većim od ovoga prekriva magla horizonta
const OKO_REZERVA = 0.9; // najbliži ugao ravni najviše 90 % puta do oka

// Tačka ekrana (X, Y relativno na sredinu, px) → tačka u koordinatama kontejnera (relativno na sredinu),
// ili null ako je iznad horizonta / pod maglom.
export function screenPointOnPlane(X, Y, rot, tilt, scale, p = ISTRAZIVAC_PERSPEKTIVA, maxL = Infinity) {
  const t = (tilt * Math.PI) / 180;
  const den = Y * Math.sin(t) + p * Math.cos(t);
  if (den <= 1e-6) return null;
  const lambda = (p * Math.cos(t)) / den;
  if (lambda > maxL) return null;
  const x1 = lambda * X;
  const y1 = (lambda * Y) / Math.cos(t);
  const r = (rot * Math.PI) / 180;
  return [(x1 * Math.cos(r) + y1 * Math.sin(r)) / scale, (-x1 * Math.sin(r) + y1 * Math.cos(r)) / scale];
}

function edgePoints(w, h, n = 24) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push([-w / 2 + f * w, -h / 2], [-w / 2 + f * w, h / 2], [-w / 2, -h / 2 + f * h], [w / 2, -h / 2 + f * h]);
  }
  return pts;
}

// Poluprečnik (px, na ravni prije uvećanja) koji mora biti pokriven da se ne vidi ivica ni za jedan okret.
export function planeRadius(w, h, tilt, { p = ISTRAZIVAC_PERSPEKTIVA, maxL = MAGLA_L } = {}) {
  let r = 0;
  for (const [X, Y] of edgePoints(w, h)) {
    const q = screenPointOnPlane(X, Y, 0, tilt, 1, p, maxL);
    if (q) r = Math.max(r, Math.hypot(q[0], q[1]));
  }
  return r;
}

// Najbliži ugao kvadrata (okrenut za 45° prema oku) kao udio puta do oka: mora ostati ispod 1.
export function eyeRatio(side, scale, tilt, p = ISTRAZIVAC_PERSPEKTIVA) {
  return ((side * scale) / Math.SQRT2) * Math.sin((tilt * Math.PI) / 180) / p;
}

// Visina magle od vrha ekrana (px): linija na kojoj je perspektivni faktor = maxL.
export function fogHeight(h, tilt, { p = ISTRAZIVAC_PERSPEKTIVA, maxL = MAGLA_L } = {}) {
  const t = (tilt * Math.PI) / 180;
  return Math.max(0, Math.round(h / 2 + (p * Math.cos(t) * (1 / maxL - 1)) / Math.sin(t)));
}

// Pogled za ekran w×h i nagib: strana kvadratnog kontejnera, uvećanje, perspektiva i magla.
// Ako bi ugao ravni došao preblizu oku, magla se spušta (manji maxL) dok ne bude sigurno.
export function explorerView(w, h, tilt) {
  const p = ISTRAZIVAC_PERSPEKTIVA;
  const scale = ISTRAZIVAC_UVECANJE;
  let maxL = MAGLA_L;
  for (;;) {
    const side = Math.ceil((2 * planeRadius(w, h, tilt, { p, maxL }) * 1.02) / scale);
    if (eyeRatio(side, scale, tilt, p) <= OKO_REZERVA || maxL <= 1.1) {
      return { side, scale, p, maxL, fog: fogHeight(h, tilt, { p, maxL }) };
    }
    maxL -= 0.05;
  }
}

export function coversScreen(w, h, rot, tilt, view) {
  const half = view.side / 2;
  return edgePoints(w, h).every(([X, Y]) => {
    const q = screenPointOnPlane(X, Y, rot, tilt, view.scale, view.p, view.maxL);
    return q == null || (Math.abs(q[0]) <= half && Math.abs(q[1]) <= half);
  });
}
