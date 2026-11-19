// Admin spiskovi sa servera, keširani za offline; dok server ne odgovori važi zadani spisak.
// Propisi (lovostaj, lovno vrijeme) NEMAJU zadanu vrijednost: unosi ih samo admin.

import { getClient } from './auth.js';
import { idbGet, idbPut } from './db.js';

export const SPISKOVI = ['objekat_vrste', 'vrste', 'lovostaj', 'lovno_vrijeme'];

const v = (kod, naziv, ikona, redoslijed) => ({ kod, naziv, ikona, redoslijed, aktivno: true });

export const DEFAULT_SPISKOVI = {
  objekat_vrste: [
    v('ceka_visoka', 'Čeka visoka', 'ceka-visoka', 10),
    v('ceka_niska', 'Čeka niska', 'ceka-niska', 20),
    v('zaklon', 'Zaklon', 'zaklon', 30),
    v('hraniliste', 'Hranilište', 'hraniliste', 40),
    v('soliste', 'Solište', 'soliste', 50),
    v('kaljuziste', 'Kaljužište', 'kaljuziste', 60),
    v('pojiliste', 'Pojilište', 'pojiliste', 70),
    v('lovacka_kuca', 'Lovačka kuća', 'kuca', 80),
    v('foto_zamka', 'Foto-zamka', 'kamera', 90),
    v('parking', 'Parkiralište / vozilo', 'auto', 100),
  ],
  vrste: [
    { kod: 'srna', naziv: 'Srna obična', velicina: 'krupna', tip: 'dlakava', redoslijed: 10, aktivno: true,
      kategorije: [{ kod: 'srndac', naziv: 'Srndać' }, { kod: 'srna', naziv: 'Srna' }, { kod: 'lane', naziv: 'Lane' }] },
    { kod: 'divlja_svinja', naziv: 'Divlja svinja', velicina: 'krupna', tip: 'dlakava', redoslijed: 20, aktivno: true,
      kategorije: [{ kod: 'vepar', naziv: 'Vepar' }, { kod: 'krmaca', naziv: 'Krmača' }, { kod: 'nazime', naziv: 'Nazime' }, { kod: 'prase', naziv: 'Prase' }] },
    { kod: 'medvjed', naziv: 'Mrki medvjed', velicina: 'krupna', tip: 'dlakava', redoslijed: 30, aktivno: true, kategorije: [] },
    { kod: 'vuk', naziv: 'Vuk', velicina: 'krupna', tip: 'dlakava', redoslijed: 40, aktivno: true, kategorije: [] },
    { kod: 'zec', naziv: 'Zec obični', velicina: 'sitna', tip: 'dlakava', redoslijed: 50, aktivno: true, kategorije: [] },
    { kod: 'lisica', naziv: 'Lisica', velicina: 'sitna', tip: 'dlakava', redoslijed: 60, aktivno: true, kategorije: [] },
    { kod: 'jazavac', naziv: 'Jazavac', velicina: 'sitna', tip: 'dlakava', redoslijed: 70, aktivno: true, kategorije: [] },
    { kod: 'kuna', naziv: 'Kuna', velicina: 'sitna', tip: 'dlakava', redoslijed: 80, aktivno: true, kategorije: [] },
    { kod: 'fazan', naziv: 'Fazan', velicina: 'sitna', tip: 'pernata', redoslijed: 90, aktivno: true,
      kategorije: [{ kod: 'pijetao', naziv: 'Pijetao' }, { kod: 'koka', naziv: 'Koka' }] },
    { kod: 'jarebica', naziv: 'Jarebica kamenjarka', velicina: 'sitna', tip: 'pernata', redoslijed: 100, aktivno: true, kategorije: [] },
    { kod: 'sljuka', naziv: 'Šljuka bena', velicina: 'sitna', tip: 'pernata', redoslijed: 110, aktivno: true, kategorije: [] },
    { kod: 'patka', naziv: 'Divlja patka', velicina: 'sitna', tip: 'pernata', redoslijed: 120, aktivno: true, kategorije: [] },
  ],
  lovostaj: [],
  lovno_vrijeme: [],
};

export function activeSorted(rows) {
  return rows.filter((r) => r.aktivno !== false).sort((a, b) => (a.redoslijed ?? 0) - (b.redoslijed ?? 0));
}

// I sklonjen (neaktivan) red daje naziv, da stari zapisi ne izgube naziv.
export function lookupNaziv(rows, kod) {
  return rows.find((r) => r.kod === kod)?.naziv ?? kod;
}

const memo = new Map();

// Svi redovi (i neaktivni) — za nazive starih zapisa.
export async function getSpisakAll(name) {
  if (memo.has(name)) return memo.get(name);
  let rows = DEFAULT_SPISKOVI[name] || [];
  try {
    const cached = await idbGet('spiskovi', name);
    if (cached?.rows) rows = cached.rows;
  } catch (err) {
    console.warn('spisak iz keša', name, err);
  }
  memo.set(name, rows);
  return rows;
}

export async function getSpisak(name) {
  return activeSorted(await getSpisakAll(name));
}

export async function refreshSpisak(name) {
  const sb = getClient();
  if (!sb) return getSpisakAll(name);
  const { data, error } = await sb.from(name).select('*');
  if (error) throw new Error(error.message);
  // Prazan odgovor za spisak koji ima zadane vrijednosti znači da migracija još nije pokrenuta.
  if (!data.length && (DEFAULT_SPISKOVI[name] || []).length) return getSpisakAll(name);
  await idbPut('spiskovi', { id: name, rows: data, preuzeto: Date.now() });
  memo.set(name, data);
  return data;
}

export async function refreshAllSpiskovi() {
  for (const name of SPISKOVI) {
    try {
      await refreshSpisak(name);
    } catch (err) {
      console.warn('osvježavanje spiska', name, err.message);
    }
  }
  globalThis.document?.dispatchEvent(new CustomEvent('spiskovi:promjena', { detail: { spisak: '*' } }));
}

export function invalidateSpisak(name) {
  memo.delete(name);
}
