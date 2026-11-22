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

export function mapTransformCss(rot, { tilt = 40, scale = 1.6 } = {}) {
  return `perspective(900px) rotateX(${tilt}deg) rotateZ(${Math.round(norm(rot) * 10) / 10}deg) scale(${scale})`;
}
