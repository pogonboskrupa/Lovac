// Spisak revira i sekcija za ekran registracije (prije prijave). Server ga daje funkcijom javne_sekcije (samo nazivi);
// zadnji spisak se pamti da izbor radi i kad je veza slaba.
import { getClient } from './auth.js';
import { isServerConfigured } from './config.js';
import { loadJSON, saveSoft } from './storage.js';

const KEY = 'lovac.javne_sekcije';

// Redovi servera → [{ revir_id, revir, sekcije: [{ id, naziv }] }] po redoslijedu pojavljivanja.
export function groupPublicSections(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.revir_id) continue;
    let g = out.find((x) => x.revir_id === r.revir_id);
    if (!g) { g = { revir_id: r.revir_id, revir: r.revir || '', sekcije: [] }; out.push(g); }
    if (r.sekcija_id && !g.sekcije.some((s) => s.id === r.sekcija_id)) g.sekcije.push({ id: r.sekcija_id, naziv: r.naziv || '' });
  }
  return out;
}

export function cachedPublicSections() {
  return groupPublicSections(loadJSON(KEY, []));
}

// Svježi spisak sa servera; bez veze ili bez funkcije (migracija 039) ostaje keš.
export async function fetchPublicSections() {
  if (!isServerConfigured()) return cachedPublicSections();
  try {
    const { data, error } = await getClient().rpc('javne_sekcije');
    if (error || !Array.isArray(data)) return cachedPublicSections();
    saveSoft(KEY, data);
    return groupPublicSections(data);
  } catch {
    return cachedPublicSections();
  }
}
