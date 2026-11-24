// Slike drugom lovcu: čista logika. Server sliku drži najviše ROK_SATI (12 h) i briše je čim je primalac preuzme;
// obje strane je zadržavaju na svom telefonu. Rok postavlja server (slike_lovcima_rok), klijent ga samo prikazuje.
import { matchesQuery } from './pretraga.js';

export const ROK_SATI = 12;
export const MAX_PRIMALACA = 5;
export const MAX_SLIKA = 1200000; // znakova dataURL-a (server prima do 1 300 000)

// Server još nema tabelu/funkciju (migracija nije pokrenuta): slika čeka u redu, ne označava se kao odbijena.
export function missingOnServer(err) {
  return ['PGRST205', 'PGRST202', '42P01'].includes(err?.code) || /could not find the (table|function)/i.test(String(err?.message || ''));
}

export const memberLabel = (m) => `${m.ime || ''} ${m.prezime || ''}${m.nadimak ? ` (${m.nadimak})` : ''}`.trim();

export function recipientsFrom(members = [], myId) {
  const seen = new Set();
  return members
    .filter((m) => m?.id && m.id !== myId && !seen.has(m.id) && seen.add(m.id))
    .sort((a, b) => String(a.prezime || '').localeCompare(String(b.prezime || ''), 'bs') || String(a.ime || '').localeCompare(String(b.ime || ''), 'bs'));
}

export function filterRecipients(list, query) {
  return query?.trim() ? list.filter((m) => matchesQuery([m.ime, m.prezime, m.nadimak], query)) : list;
}

export function validateSend({ primaoci = [], slika }) {
  if (!slika) return 'Nema slike za slanje.';
  if (String(slika).length > MAX_SLIKA) return 'Slika je prevelika.';
  if (!primaoci.length) return 'Izaberi bar jednog lovca.';
  if (primaoci.length > MAX_PRIMALACA) return `Najviše ${MAX_PRIMALACA} lovaca odjednom.`;
  return null;
}

// Jedan red po primaocu (server čuva jednu sliku po primaocu i briše je kad je on preuzme).
export function newSends({ ids, primaoci, slika, opis, lat, lon, now = Date.now() }) {
  const clean = String(opis || '').trim().slice(0, 500) || null;
  return primaoci.map((p, i) => ({
    id: ids[i], primalac_id: p, slika, opis: clean,
    lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
    created_at: new Date(now).toISOString(),
  }));
}

// Na listi primljenih sa servera: koje još nisu na telefonu.
export function newInboxIds(serverRows = [], localIds = []) {
  const have = new Set(localIds);
  return serverRows.filter((r) => r?.id && !have.has(r.id)).map((r) => r.id);
}

export function expiryText(istice, now = Date.now()) {
  const ms = Date.parse(istice) - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'Rok na serveru je istekao';
  const min = Math.ceil(ms / 60000);
  return min >= 60 ? `Na serveru još ${Math.floor(min / 60)} h` : `Na serveru još ${min} min`;
}

// Stanje poslane slike za prikaz (pošiljalac ne zna da li je primalac preuzeo — server je tada već obrisao).
export function sentStatus(p, now = Date.now()) {
  if (p.odbijena) return { stanje: 'odbijena', tekst: `Nije poslana: ${p.odbijena}` };
  if (!p.poslano) return { stanje: 'ceka', tekst: 'Čeka internet' };
  const ms = Date.parse(p.istice) - now;
  if (Number.isFinite(ms) && ms > 0) return { stanje: 'poslana', tekst: `Poslana · ${expiryText(p.istice, now).toLowerCase()} (ili do preuzimanja)` };
  return { stanje: 'poslana', tekst: 'Poslana · obrisana sa servera, ostala na telefonima' };
}

export const newestFirst = (list = []) => [...list].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

export function inboxSummary(primljene = []) {
  const nove = primljene.filter((p) => p.novo).length;
  if (nove) return `${nove} ${nove === 1 ? 'nova slika' : nove < 5 ? 'nove slike' : 'novih slika'}`;
  return primljene.length ? `Primljeno: ${primljene.length}` : 'Pošalji sliku drugom lovcu';
}
