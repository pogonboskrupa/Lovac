// Slike drugom lovcu: čista logika. Server sliku drži najviše ROK_SATI (12 h) i briše je čim je primalac preuzme;
// obje strane je zadržavaju na svom telefonu. Rok postavlja server (slike_lovcima_rok), klijent ga samo prikazuje.
import { matchesQuery } from './pretraga.js';

export const ROK_SATI = 12;
export const MAX_PRIMALACA = 5;
export const MAX_SLIKA_GRUPA = 6; // jedno slanje (album), npr. trofej sa više strana
export const MAX_REDOVA = 30; // server drži najviše 30 neisteklih slika po pošiljaocu

export const KATEGORIJE = [
  { kod: 'trofej', naziv: 'Trofej' },
  { kod: 'trag', naziv: 'Trag' },
  { kod: 'divljac', naziv: 'Divljač' },
  { kod: 'teren', naziv: 'Teren' },
  { kod: 'ostalo', naziv: 'Ostalo' },
];
export const kategorijaNaziv = (kod) => KATEGORIJE.find((k) => k.kod === kod)?.naziv || 'Ostalo';
export const MAX_SLIKA = 1200000; // znakova dataURL-a (server prima do 1 300 000)

// Server još nema tabelu/funkciju (migracija nije pokrenuta): slika čeka u redu, ne označava se kao odbijena.
export function missingOnServer(err) {
  return ['PGRST205', 'PGRST204', 'PGRST202', '42P01'].includes(err?.code) || /could not find the (table|function)/i.test(String(err?.message || ''));
}

// Privremeno odbijanje (najviše 30 slika čeka preuzimanje): slika ostaje u redu i šalje se kasnije.
export const retryLater = (err) => err?.code === '54000';

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

export function validateSend({ primaoci = [], slike = [] }) {
  if (!slike.length) return 'Nema slike za slanje.';
  if (slike.length > MAX_SLIKA_GRUPA) return `Najviše ${MAX_SLIKA_GRUPA} slika odjednom.`;
  if (slike.some((s) => !s || String(s).length > MAX_SLIKA)) return 'Slika je prevelika.';
  if (!primaoci.length) return 'Izaberi bar jednog lovca.';
  if (primaoci.length > MAX_PRIMALACA) return `Najviše ${MAX_PRIMALACA} lovaca odjednom.`;
  if (slike.length * primaoci.length > MAX_REDOVA) return `Najviše ${MAX_REDOVA} slika ukupno (slike × lovci). Izaberi manje lovaca ili slika.`;
  return null;
}

// Jedan red po slici i primaocu; slike istog slanja dijele `grupa` (album), `redni` čuva redoslijed.
export function newSends({ ids, primaoci, slike, grupa, kategorija = 'ostalo', opis, lat, lon, now = Date.now() }) {
  const clean = String(opis || '').trim().slice(0, 500) || null;
  const kat = KATEGORIJE.some((k) => k.kod === kategorija) ? kategorija : 'ostalo';
  const out = [];
  primaoci.forEach((p) => slike.forEach((slika, redni) => {
    out.push({
      id: ids[out.length], primalac_id: p, slika, opis: clean, grupa, redni, kategorija: kat,
      lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
      created_at: new Date(now).toISOString(),
    });
  }));
  return out;
}

// Redovi → albumi (slanja). Primljene: po grupi i pošiljaocu. Poslane: po grupi, sa spiskom primalaca i
// jednom slikom po rednom broju (ista slika ide svakom primaocu). Stari zapisi bez grupe su album od jedne slike.
export function groupAlbums(rows = [], { poslane = false } = {}) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.grupa || r.id}|${poslane ? '' : r.posiljalac_id || ''}`;
    if (!map.has(key)) {
      map.set(key, { kljuc: key, grupa: r.grupa || r.id, kategorija: r.kategorija || 'ostalo', opis: r.opis || null, created_at: r.created_at,
        posiljalac_id: r.posiljalac_id || null, primaoci: [], slike: [], novo: false, lat: r.lat ?? null, lon: r.lon ?? null, redovi: [] });
    }
    const a = map.get(key);
    a.redovi.push(r);
    if (r.novo) a.novo = true;
    if (String(r.created_at || '') > String(a.created_at || '')) a.created_at = r.created_at;
    if (r.primalac_id && !a.primaoci.includes(r.primalac_id)) a.primaoci.push(r.primalac_id);
    const redni = r.redni ?? 0;
    if (!a.slike.some((x) => x.redni === redni)) a.slike.push({ ...r, redni });
  }
  for (const a of map.values()) a.slike.sort((x, y) => x.redni - y.redni);
  return [...map.values()].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

export const filterAlbums = (albums, kat) => (kat && kat !== 'sve' ? albums.filter((a) => a.kategorija === kat) : albums);

// Brojevi za vrh ekrana.
export function albumsOverview(primljene = [], poslane = []) {
  const p = groupAlbums(primljene);
  return {
    primljeno: p.length,
    trofeja: p.filter((a) => a.kategorija === 'trofej').length + groupAlbums(poslane, { poslane: true }).filter((a) => a.kategorija === 'trofej').length,
    poslano: groupAlbums(poslane, { poslane: true }).length,
  };
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
  return primljene.length ? `Primljeno: ${primljene.length}` : 'Pošalji slike i trofeje lovcima';
}

// Naslov dana za grupisanje kartica: "Danas", "Jučer" ili "5.12.2026." (po satu telefona).
export function dayTitle(iso, now = Date.now()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const n = new Date(now);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  const jucer = new Date(n);
  jucer.setDate(n.getDate() - 1);
  if (sameDay(d, n)) return 'Danas';
  if (sameDay(d, jucer)) return 'Jučer';
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}.`;
}

// Inicijali pošiljaoca za krug na kartici (dvije riječi → dva slova).
export function senderInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
