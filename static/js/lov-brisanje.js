// Brisanje lova: smiju administrator i lovovođa sekcije tog lova (server: `obrisi_lov`, migracija 032, provjerava isto).
// Brisanje je za SVE (raspored, učesnici, pozicije, trag, tok i slike nestaju sa servera) i traži internet.

import { getClient } from './auth.js';
import { idbDelete } from './db.js';
import { connectionQuality } from './net.js';

// rec: zapis lova iz keša ({ lov, sekcija, ... }); sekcija ima grupovodja_id.
export function canDeleteHunt(rec, me) {
  if (!rec?.lov || !me?.id) return false;
  return Boolean(me.is_admin || (rec.sekcija?.grupovodja_id && rec.sekcija.grupovodja_id === me.id));
}

export async function deleteHunt(lovId) {
  const sb = getClient();
  if (!sb || connectionQuality() === 'nema') throw new Error('Za brisanje lova potreban je internet.');
  // false = lova više nema na serveru (obrisao ga je neko drugi): i tada se uklanja sa telefona
  const { error } = await sb.rpc('obrisi_lov', { p_lov: lovId });
  if (error) {
    throw Object.assign(new Error(error.code === 'PGRST202'
      ? 'Server još nema brisanje lova (administrator treba pokrenuti migraciju 032).' : `Lov nije obrisan: ${error.message}`), { code: error.code });
  }
  for (const key of [`detalj:${lovId}`, `trag:${lovId}`]) await idbDelete('arhiva', key).catch(() => {});
  await idbDelete('lovovi', lovId).catch(() => {});
  globalThis.document?.dispatchEvent(new CustomEvent('lovovi:promjena'));
}
