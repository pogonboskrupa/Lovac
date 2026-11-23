// Inkrementalno preuzimanje sa servera: kursor po koloni `primljeno` (postavlja je server, migracije 028/029),
// a dok migracija nije pokrenuta po rezervnoj koloni (npr. created_at koju postavlja telefon) uz veći preklop.
// Štedi besplatni server: umjesto cijele tabele svaki put stižu samo novi redovi.

// primljeno: kratke transakcije, 15 s je dovoljno; rezervna kolona: telefon bez signala šalje kasnije.
export const PREKLOP_MS = { primljeno: 15000, rezerva: 15 * 60000 };

const ms = (v) => (typeof v === 'number' ? v : Date.parse(v));

// Kursor za sljedeći upit; nikad ne ide unazad, a bez novih redova ostaje isti.
export function nextCursor(fresh = [], prev = null, rezerva = 'created_at') {
  const hasRecv = fresh.some((r) => r?.primljeno);
  const kolona = hasRecv ? 'primljeno' : rezerva;
  const max = Math.max(...fresh.map((r) => ms(r?.[kolona])).filter(Number.isFinite));
  if (!Number.isFinite(max)) return prev;
  const v = max - (kolona === 'primljeno' ? PREKLOP_MS.primljeno : PREKLOP_MS.rezerva);
  if (prev && prev.kolona === kolona && Date.parse(prev.v) >= v) return prev;
  return { kolona, v: new Date(v).toISOString() };
}

export const missingColumn = (err) => err?.code === '42703' || /column .* does not exist/i.test(err?.message || '');

const run = async (q) => {
  const { data, error } = await q;
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data || [];
};

// base(): novi upit sa select i filterima (bez reda i granica).
// Bez kursora: zadnjih `initial` redova po rezervnoj koloni (najnoviji, ne najstariji — server daje najviše 1000).
// Sa kursorom: svi redovi poslije njega, po stranicama.
export async function fetchNew(base, cursor, { rezerva = 'created_at', initial = 300, size = 1000, maxPages = 20 } = {}) {
  if (!cursor) {
    const rows = await run(base().order(rezerva, { ascending: false }).order('id', { ascending: false }).limit(initial));
    return rows.reverse();
  }
  const all = [];
  for (let i = 0; i < maxPages; i++) {
    let rows;
    try {
      rows = await run(base().gt(cursor.kolona, cursor.v).order(cursor.kolona, { ascending: true }).order('id', { ascending: true })
        .range(i * size, i * size + size - 1));
    } catch (err) {
      // migracija još nije pokrenuta: kursor po rezervnoj koloni
      if (cursor.kolona === 'primljeno' && missingColumn(err)) return fetchNew(base, { kolona: rezerva, v: cursor.v }, { rezerva, initial, size, maxPages });
      throw err;
    }
    all.push(...rows);
    if (rows.length < size) break;
  }
  return all;
}
