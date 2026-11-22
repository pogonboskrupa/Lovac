// Vjetar na čeki: sektor, "odgovara/ne odgovara", konus mirisa, prognoza sa starošću, termika.

import { compassName } from './geo.js';

const R_EARTH = 6371008.8;
const RAD = Math.PI / 180;
const HOUR = 3600000;

export const SEKTORI = ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ'];

export function isStandType(vrsta) {
  return /^ceka/.test(vrsta) || vrsta === 'zaklon';
}

export function windSector(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}

export function suitsStand(windFromDeg, allowed) {
  if (!allowed?.length) return null;
  return allowed.includes(windSector(windFromDeg));
}

export function destination(p, bearingDeg, distM) {
  const δ = distM / R_EARTH;
  const θ = bearingDeg * RAD;
  const φ1 = p.lat * RAD;
  const λ1 = p.lon * RAD;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / RAD, lon: λ2 / RAD };
}

// Poligon: čeka + luk niz vjetar (vjetar duva IZ windFrom, miris ide prema windFrom + 180).
export function scentCone(origin, windFromDeg, lengthM = 400, halfAngle = 20, steps = 8) {
  const down = (windFromDeg + 180) % 360;
  const pts = [[origin.lat, origin.lon]];
  for (let i = 0; i <= steps; i++) {
    const b = down - halfAngle + (2 * halfAngle * i) / steps;
    const d = destination(origin, b, lengthM);
    pts.push([d.lat, d.lon]);
  }
  return pts;
}

// Open-Meteo (timeformat=unixtime) -> kompaktan keš.
export function parseForecast(json, fetchedAt = Date.now()) {
  const h = json.hourly || {};
  return {
    preuzeto: fetchedAt,
    sati: (h.time || []).map((t, i) => ({
      t: t * 1000, brzina: h.wind_speed_10m?.[i], smjer: h.wind_direction_10m?.[i], udari: h.wind_gusts_10m?.[i],
      temp: h.temperature_2m?.[i], padavine: h.precipitation?.[i], oblaci: h.cloud_cover?.[i], kod: h.weather_code?.[i],
    })),
  };
}

// Samo sat koji obuhvata "sada"; stara prognoza nikad ne postaje trenutni vjetar.
export function currentWind(fc, now = Date.now()) {
  const s = fc?.sati?.find((x) => now >= x.t && now < x.t + HOUR);
  if (!s || s.brzina == null || s.smjer == null) return null;
  return { brzina: s.brzina, smjer: s.smjer, udari: s.udari ?? null, sat: s.t };
}

export function ageText(fetchedAt, now = Date.now()) {
  const min = Math.floor((now - fetchedAt) / 60000);
  if (min < 1) return 'prognoza preuzeta upravo';
  if (min < 60) return `prognoza preuzeta prije ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `prognoza preuzeta prije ${h} h`;
  return `prognoza preuzeta prije ${Math.floor(h / 24)} dana`;
}

export function formatWind(w) {
  const sp = (v) => v.toFixed(1).replace('.', ',');
  return `${compassName(w.smjer)} (${Math.round(w.smjer)}°) ${sp(w.brzina)} m/s${w.udari != null ? `, udari ${sp(w.udari)}` : ''}`;
}

// Pravilo palca: danju se zagrijan zrak penje uz padinu, navečer i noću se spušta.
export function thermalHint(uphillDeg, sun, now) {
  if (uphillDeg == null || sun?.izlazak == null || sun?.zalazak == null) return null;
  const up = compassName(uphillDeg);
  const down = compassName((uphillDeg + 180) % 360);
  if (now >= sun.izlazak + HOUR && now <= sun.zalazak - HOUR) return `Termika (pravilo palca): danju zrak ide uzbrdo — miris nosi prema ${up}`;
  if (now > sun.zalazak + HOUR / 2 || now < sun.izlazak) return `Termika (pravilo palca): navečer i noću zrak ide nizbrdo — miris nosi prema ${down}`;
  return 'Termika (pravilo palca): termika se okreće — strujanje je nestabilno';
}
