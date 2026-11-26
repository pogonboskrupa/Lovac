// "Gdje si?": zahtjev za lokaciju unutar sekcije (čista logika). Odgovor "da" uključuje dijeljenje lokacije
// sa sekcijom (isti mehanizam kao ručno dijeljenje), pa lokaciju vide samo oni koji je smiju vidjeti.

import { uuid } from './zapisi.js';

export const PING_TTL_MS = 15 * 60000;
export const PING_COOLDOWN_MS = 2 * 60000;

// Traži član, lovovođa sekcije ili lovočuvar sekcije; traži se član ili lovovođa sekcije (lovočuvar prati, ne dijeli).
export function canPing(myStatus, targetRole, myId, targetId) {
  return Boolean(myId) && myId !== targetId
    && ['clan', 'grupovodja', 'lovocuvar'].includes(myStatus)
    && ['clan', 'grupovodja'].includes(targetRole);
}

export function newPing({ sekcija_id, od_id, za_id }, now = Date.now()) {
  return { id: uuid(), sekcija_id, od_id, za_id, created_at: new Date(now).toISOString(), odgovor: null };
}

const fresh = (r, now) => now - Date.parse(r.created_at) <= PING_TTL_MS;

// Zahtjevi meni koji čekaju odgovor (najstariji prvi).
export function incomingPings(rows, myId, now = Date.now()) {
  return rows.filter((r) => r.za_id === myId && !r.odgovor && fresh(r, now))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// Odgovori na moje zahtjeve koje još nisam vidio.
export function newAnswers(rows, myId, announced = [], now = Date.now()) {
  const seen = new Set(announced);
  return rows.filter((r) => r.od_id === myId && r.odgovor && !seen.has(r.id) && now - Date.parse(r.created_at) <= 60 * 60000)
    .sort((a, b) => String(a.odgovoreno || a.created_at).localeCompare(String(b.odgovoreno || b.created_at)));
}

export function requestText(name) {
  return `${name} traži tvoju lokaciju.`;
}

export function answerText(row, name) {
  return row.odgovor === 'da'
    ? `${name} je odgovorio: DA — dijeli lokaciju sa sekcijom (vidi je na karti).`
    : `${name} je odgovorio: NE — ne želi dijeliti lokaciju.`;
}

// Koliko ms još čekati prije novog zahtjeva istom lovcu (server odbija češće od 2 min).
export function cooldownLeft(sent, targetId, now = Date.now()) {
  const t = Number(sent?.[targetId]);
  return Number.isFinite(t) ? Math.max(0, t + PING_COOLDOWN_MS - now) : 0;
}
