// Sunce i mjesec offline. Sunce po NOAA Solar Calculator algoritmu (tačnost ~sekunde
// za naše geografske širine); mjesec po prosječnom sinodičkom mjesecu.

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;

const toJulian = (ms) => ms / DAY_MS - 0.5 + J1970;
const fromJulian = (j) => (j + 0.5 - J1970) * DAY_MS;

// Deklinacija (rad) i jednačina vremena (minute) za julijanski dan.
function solarParams(jd) {
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot = 4 / RAD * (y * Math.sin(2 * L0 * RAD) - 2 * e * Math.sin(M * RAD)
    + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD) - 1.25 * e * e * Math.sin(2 * M * RAD));
  return { decl, eot };
}

// Minute od ponoći UTC za događaj; null za polarni dan/noć.
function eventMinutes(jd0, lat, lon, zenith, sign) {
  let minutes = 720 - 4 * lon;
  for (let i = 0; i < 3; i++) {
    const { decl, eot } = solarParams(jd0 + minutes / 1440);
    const cosH = Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
    if (cosH < -1 || cosH > 1) return null;
    const ha = Math.acos(cosH) / RAD;
    minutes = 720 - 4 * (lon + sign * ha) - eot;
  }
  return minutes;
}

// dayMs: bilo koji trenutak tog (UTC) dana; za BiH lokalno podne je isti UTC dan.
export function sunTimes(dayMs, lat, lon) {
  const d = new Date(dayMs);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const jd0 = toJulian(midnight);
  const at = (zenith, sign) => {
    const m = eventMinutes(jd0, lat, lon, zenith, sign);
    return m == null ? null : midnight + m * 60000;
  };
  const { eot } = solarParams(jd0 + 0.5);
  return {
    izlazak: at(90.833, 1),
    zalazak: at(90.833, -1),
    svitanje: at(96, 1),
    suton: at(96, -1),
    podne: midnight + (720 - 4 * lon - eot) * 60000,
  };
}

const SYNODIC = 29.530588853;
const NEW_MOON_JD = 2451550.26; // 6.1.2000. 18:14 UTC

export function moonAge(ms) {
  const age = (toJulian(ms) - NEW_MOON_JD) % SYNODIC;
  return age < 0 ? age + SYNODIC : age;
}

export function moonIllumination(age) {
  return (1 - Math.cos((2 * Math.PI * age) / SYNODIC)) / 2;
}

export function moonPhaseName(age) {
  const f = age / SYNODIC;
  if (f < 0.0339 || f >= 0.9661) return 'Mlađak';
  if (f < 0.216) return 'Rastući srp';
  if (f < 0.284) return 'Prva četvrt';
  if (f < 0.466) return 'Rastući mjesec';
  if (f < 0.534) return 'Uštap (pun mjesec)';
  if (f < 0.716) return 'Opadajući mjesec';
  if (f < 0.784) return 'Zadnja četvrt';
  return 'Opadajući srp';
}

const p2 = (n) => String(n).padStart(2, '0');
const hm = (ms) => `${p2(new Date(ms).getHours())}:${p2(new Date(ms).getMinutes())}`;

function leftText(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${p2(m % 60)} min`;
}

// Stanje dnevnog svjetla: zora/dan/sumrak/noć. `tomorrow` treba za noć prije ponoći (sljedeće svitanje).
export function daylightStatus(now, today, tomorrow = null) {
  const { izlazak, zalazak, svitanje, suton } = today;
  if ([izlazak, zalazak, svitanje, suton].some((v) => v == null)) return { stanje: 'nepoznato', tekst: 'Svjetlo: nema podataka' };
  if (now >= izlazak && now < zalazak) return { stanje: 'dan', tekst: `Svjetlo do ${hm(zalazak)} (još ${leftText(zalazak - now)})` };
  if (now >= zalazak && now < suton) return { stanje: 'sumrak', tekst: `Sumrak do ${hm(suton)} (još ${leftText(suton - now)})` };
  if (now >= svitanje && now < izlazak) return { stanje: 'zora', tekst: `Zora, izlazak ${hm(izlazak)} (za ${leftText(izlazak - now)})` };
  const next = now < svitanje ? svitanje : tomorrow?.svitanje;
  return { stanje: 'noc', tekst: next ? `Noć, svitanje ${hm(next)}` : 'Noć' };
}
