// Dijeljenje lokacije sa IZABRANIM lovcima (čista logika): pretraga (samo pretraga, bez spiska svih lovaca),
// spremljeno stanje i pozicije koje drugi dijele sa mnom.
import { matchesQuery } from './pretraga.js';
import { sectionShareList } from './lokacija-sekcija.js';

export const IZABRANI_KEY = 'lovac.izabrani_dijeljenje';
export const IZABRANI_UKLANJANJE_KEY = 'lovac.izabrani_dijeljenje.uklanjanje';
export const MAX_PRIMALACA = 20;   // klijent; server dozvoljava 30
export const MIN_SLOVA = 2;        // bez upisa (ili sa 1 slovom) ne prikazuje se niko: samo pretraga

const fullName = (m) => `${m.ime || ''} ${m.prezime || ''}`.trim();

// Rezultati pretrage: ime, prezime ili nadimak; bez mene i bez već izabranih; najviše `limit`.
export function searchHunters(members = [], query = '', { myId = null, selected = [], limit = 8 } = {}) {
  const q = String(query || '').trim();
  if (q.replace(/\s/g, '').length < MIN_SLOVA) return [];
  return members
    .filter((m) => m.id !== myId && !selected.includes(m.id) && matchesQuery([fullName(m), m.nadimak || '', `${m.prezime || ''} ${m.ime || ''}`], q))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), 'bs'))
    .slice(0, limit);
}

export function displayName(m) {
  return `${fullName(m)}${m.nadimak ? ` (${m.nadimak})` : ''}`;
}

// Spremljeno stanje { ids, do } ili null kad je isteklo/neispravno.
export function activeSelectedShare(raw, now = Date.now()) {
  if (!raw || !Array.isArray(raw.ids) || !raw.ids.length || !Number.isFinite(raw.do) || raw.do <= now) return null;
  return { ids: [...new Set(raw.ids)].slice(0, MAX_PRIMALACA), do: raw.do };
}

export function addRecipient(ids = [], id) {
  if (!id || ids.includes(id) || ids.length >= MAX_PRIMALACA) return ids;
  return [...ids, id];
}

export const removeRecipient = (ids = [], id) => ids.filter((x) => x !== id);

// Redovi sa servera za upsert: jedan po primaocu.
export function shareRows(ids, fix, doMs, ownerId) {
  return ids.map((id) => ({ ...(ownerId ? { vlasnik_id: ownerId } : {}), primalac_id: id, lat: fix.lat, lon: fix.lon, acc: fix.acc ?? null, do_: new Date(doMs).toISOString() }));
}

// Ko dijeli sa MNOM: redovi gdje sam primalac (vlasnik_id = onaj ko dijeli), isti oblik kao spisak članova sekcije.
export function receivedShares(rows = [], myId, nameOf, me, now = Date.now()) {
  const mine = rows.filter((r) => r.primalac_id === myId).map((r) => ({ ...r, korisnik_id: r.vlasnik_id }));
  return sectionShareList(mine, myId, nameOf, me, now);
}

// Primalac koji je u međuvremenu nestao iz spiska članova se ne šalje (server bi odbio cijeli paket).
export const validRecipients = (ids, members) => ids.filter((id) => members.some((m) => m.id === id));

// Tekst stanja slanja (čista funkcija, testira se u Node-u).
export function sendStateText(st, now = Date.now()) {
  if (st.stanje === 'ok') {
    const sec = Math.max(0, Math.round((now - st.t) / 1000));
    return `Vide je samo oni. Poslano ${sec < 5 ? 'upravo' : sec < 120 ? `prije ${sec} s` : `prije ${Math.round(sec / 60)} min`}.`;
  }
  if (st.stanje === 'gps') return 'Čekam GPS poziciju — lokacija još nije poslana.';
  if (st.stanje === 'veza') return 'Nema veze sa serverom — lokacija se šalje čim se veza vrati.';
  if (st.stanje === 'greska') return st.poruka || 'Slanje nije uspjelo.';
  return 'Šaljem…';
}

export const ODBIJENO_KEY = 'lovac.izabrani_odbijeno';   // { vlasnikId: do_ } — "Ne sada" važi za TO dijeljenje, novo se ponovo nudi
export const OBAVIJESTENO_KEY = 'lovac.izabrani_obavijesteno'; // { vlasnikId: do_ } — obavijest se šalje jednom po dijeljenju

// Ko dijeli lokaciju sa mnom, a ja s njim ne dijelim (ponuda "Dijeli i ti"). Samo aktivna dijeljenja; "Ne sada" se pamti
// po dijeljenju (`do_`), pa novo dijeljenje istog lovca ponovo izaziva ponudu.
export function reciprocalOffers(rows = [], myId, nameOf, mySharingIds = [], dismissed = {}, now = Date.now()) {
  return rows
    .filter((r) => r.primalac_id === myId && r.vlasnik_id !== myId && Date.parse(r.do_) > now)
    .filter((r) => !mySharingIds.includes(r.vlasnik_id) && dismissed?.[r.vlasnik_id] !== r.do_)
    .map((r) => ({ id: r.vlasnik_id, ime: nameOf(r.vlasnik_id), do: r.do_ }))
    .sort((a, b) => a.ime.localeCompare(b.ime, 'bs'));
}

export function offerBadgeText(n) {
  return n > 9 ? '9+' : String(n);
}

export function offerNotice(offers) {
  if (!offers.length) return '';
  const names = offers.slice(0, 2).map((o) => o.ime).join(' i ');
  const more = offers.length > 2 ? ` i još ${offers.length - 2}` : '';
  return `${names}${more} ${offers.length === 1 ? 'dijeli' : 'dijele'} lokaciju sa tobom. Otvori Moju lokaciju da podijeliš i ti.`;
}
