// Poruke sekcije (čista logika). Poruka dobija klijentski UUID pri unosu (radi offline), a server
// je upisuje samo jednom; poruka se ne mijenja ni briše.

import { uuid } from './zapisi.js';

export const QUICK_MESSAGES = ['Stigao sam na stan', 'Vidim divljač', 'Pogon kreće', 'Lov je završen'];

export function validateMessage(text) {
  const t = String(text ?? '').trim();
  if (!t) return 'Upiši poruku';
  if (t.length > 1000) return 'Poruka je predugačka (najviše 1000 znakova)';
  return null;
}

export function newMessage({ sekcija_id, autor_id, tekst, lov_id = null }, now = Date.now()) {
  return { id: uuid(), sekcija_id, autor_id, lov_id, tekst: String(tekst).trim(), created_at: new Date(now).toISOString(), sinhronizovano: false };
}

// Lokalne + poruke sa servera: bez duplikata (po id), sortirano po vremenu; ono što je na serveru je sinhronizovano.
export function mergeMessages(local, remote) {
  const byId = new Map(local.map((m) => [m.id, m]));
  for (const r of remote) byId.set(r.id, { ...(byId.get(r.id) || {}), ...r, sinhronizovano: true });
  return [...byId.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export function unreadCount(messages, lastRead, myId) {
  return messages.filter((m) => m.autor_id !== myId && (!lastRead || m.created_at > lastRead)).length;
}

const p2 = (n) => String(n).padStart(2, '0');

export function formatMessageTime(iso, now = Date.now()) {
  const d = new Date(iso);
  const n = new Date(now);
  const hm = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return d.toDateString() === n.toDateString() ? hm : `${d.getDate()}.${d.getMonth() + 1}. ${hm}`;
}
