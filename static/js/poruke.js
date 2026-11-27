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

export const KANAL_RUKOVODSTVO = 'rukovodstvo';
export const KANAL_GRUPA = 'grupa';

// kanal 'rukovodstvo': lovovođe sekcije, lovočuvari i admin međusobno (bez sekcije).
// kanal 'grupa': samo grupa (`grupa_id`), bez sekcije — poruke grupe ne ulaze u razgovor cijele sekcije.
export function newMessage({ sekcija_id = null, grupa_id = null, autor_id, tekst, lov_id = null, kanal = 'sekcija' }, now = Date.now()) {
  const bezSekcije = kanal === KANAL_RUKOVODSTVO || kanal === KANAL_GRUPA;
  return {
    id: uuid(), kanal, sekcija_id: bezSekcije ? null : sekcija_id, grupa_id: kanal === KANAL_GRUPA ? grupa_id : null, autor_id, lov_id, tekst: String(tekst).trim(), created_at: new Date(now).toISOString(), sinhronizovano: false,
  };
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

// Razgovor sa naslovima dana ("Danas", "Jučer", "5.12.2026.") i grupisanjem: uzastopne poruke istog autora
// u istom danu ne ponavljaju ime (prva = true). Vraća [{ dan }, { poruka, prva }].
export function conversationItems(messages, now = Date.now()) {
  const dayKey = (t) => new Date(t).toDateString();
  const today = dayKey(now);
  const yesterday = dayKey(now - 86400000);
  const label = (t) => {
    const k = dayKey(t);
    if (k === today) return 'Danas';
    if (k === yesterday) return 'Jučer';
    const d = new Date(t);
    return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}.`;
  };
  const out = [];
  let lastDay = null;
  let lastAuthor = null;
  for (const m of messages) {
    const k = dayKey(m.created_at);
    if (k !== lastDay) { out.push({ dan: label(m.created_at) }); lastDay = k; lastAuthor = null; }
    out.push({ poruka: m, prva: m.autor_id !== lastAuthor });
    lastAuthor = m.autor_id;
  }
  return out;
}
