// Odluke o zahtjevima za sekciju (migracija 040): tekstovi za podnosioca, historija za upravljača, izvoz članova.
// Čista logika, ne dira DOM.

export const ODLUKE_KURSOR_KEY = 'lovac.odluke.kursor';
export const ODLUKE_NOVE_KEY = 'lovac.odluke.nove';
export const ODLUKE_CEKAM_KEY = 'lovac.odluke.cekam';
export const IMENA_ZAHTJEVA_KEY = 'lovac.imena_zahtjeva';
export const RAZLOG_MAX = 300;

const sectionName = (sekcije, id) => (sekcije || []).find((s) => s.id === id)?.naziv || 'sekciju';

// Tekst odluke za podnosioca zahtjeva.
export function decisionText(o, sekcije = []) {
  const ime = sectionName(sekcije, o.sekcija_id);
  if (o.odluka === 'odobren') return `Primljen si u sekciju ${ime}.`;
  if (o.odluka === 'prebacen') return `Zahtjev je prebačen iz ${ime} u ${sectionName(sekcije, o.u_sekciju)} i čeka odobrenje tamo.`;
  return `Zahtjev za ${ime} je odbijen.${o.razlog ? ` Razlog: ${o.razlog}` : ''}`;
}

// Red u historiji sekcije (za lovovođu sekcije / lovočuvara / admina).
export function historyLine(o, nameOf, sekcije = []) {
  const ko = o.odlucio ? nameOf(o.odlucio) : 'server';
  const za = nameOf(o.korisnik_id);
  if (o.odluka === 'odobren') return `${za} — primljen (${ko})`;
  if (o.odluka === 'prebacen') return `${za} — prebačen u ${sectionName(sekcije, o.u_sekciju)} (${ko})`;
  return `${za} — odbijen (${ko})${o.razlog ? `: ${o.razlog}` : ''}`;
}

// Nove odluke koje podnosilac još nije vidio (po id-u), najstarija prva.
export function unseenDecisions(rows = [], seen = []) {
  const s = new Set(seen);
  return rows.filter((r) => r?.id && !s.has(r.id)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

// Kursor za sljedeće čitanje: najnovije created_at minus 1 min preklopa (sat servera i upis u istoj sekundi).
export function nextDecisionCursor(rows = [], prev = null) {
  const max = rows.reduce((m, r) => (r.created_at && r.created_at > m ? r.created_at : m), '');
  if (!max || !Number.isFinite(Date.parse(max))) return prev;
  return new Date(Date.parse(max) - 60000).toISOString();
}

// Zahtjevi koje "Odobri sve" smije odobriti: na čekanju i nisu predloženi nalozi (oni idu kroz odobri_pozvanog).
export function bulkApprovable(sekcijaId, clanovi = []) {
  return clanovi.filter((c) => c.sekcija_id === sekcijaId && c.status === 'ceka' && !c.pozvao_id);
}

// Spisak članova za CSV (sastanci, evidencija): lovovođa sekcije prvi, pa po prezimenu.
export function memberRows(sekcija, clanovi = [], users = []) {
  const byId = new Map(users.map((u) => [u.id, u]));
  return clanovi.filter((c) => c.sekcija_id === sekcija.id && c.status === 'odobren')
    .map((c) => {
      const u = byId.get(c.korisnik_id) || {};
      return { prezime: u.prezime || '', ime: u.ime || '', nadimak: u.nadimak || '', uloga: c.korisnik_id === sekcija.grupovodja_id ? 'Lovovođa sekcije' : 'Član',
        od: (c.odlucio_at || c.created_at || '').slice(0, 10) };
    })
    .sort((a, b) => Number(b.uloga === 'Lovovođa sekcije') - Number(a.uloga === 'Lovovođa sekcije') || a.prezime.localeCompare(b.prezime, 'bs') || a.ime.localeCompare(b.ime, 'bs'));
}

export const MEMBER_CSV_COLUMNS = [
  { key: 'prezime', label: 'Prezime' }, { key: 'ime', label: 'Ime' }, { key: 'nadimak', label: 'Nadimak / broj člana' },
  { key: 'uloga', label: 'Uloga' }, { key: 'od', label: 'Član od' },
];

export function memberCsvName(sekcija, now = new Date()) {
  const slug = String(sekcija.naziv || 'sekcija').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `clanovi-${slug || 'sekcija'}-${now.toISOString().slice(0, 10)}.csv`;
}
