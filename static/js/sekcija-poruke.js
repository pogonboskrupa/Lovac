// Poruke sekcije i rukovodstva: inkrementalno preuzimanje po kursoru, izlazna kutija (radi bez interneta) i obavijest.
// Stanje (poruke, kontekst sekcija) ostaje u sekcija-ui.js i stiže kroz getter-e; ovdje je samo mrežna i IndexedDB logika.
import { idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { fetchNew, nextCursor } from './inkrement.js';
import { mergeMessages, KANAL_RUKOVODSTVO, KANAL_GRUPA } from './poruke.js';
import { missingColumn } from './inkrement.js';
import { memberName } from './dijeljenje-ui.js';

const NOTIF_KEY = 'lovac.sekcija.obavijest';

// d = { client(), me(), mine(), leader(), groupIds(), ctx(), poruke(), rukPoruke(), reload(), isOpen(), q(promise) }
export function createMessageSync(d) {
  let groupMissing = false; // server bez migracije 046
  const notifyNew = (fresh) => {
    const since = loadJSON(NOTIF_KEY, 0);
    const news = fresh.filter((m) => m.autor_id !== d.me()?.id && Date.parse(m.created_at) > since);
    if (!news.length) return;
    saveSoft(NOTIF_KEY, Math.max(...news.map((m) => Date.parse(m.created_at))));
    if (d.isOpen() && document.visibilityState === 'visible') return;
    const m = news[news.length - 1];
    const s = d.ctx().sekcije.find((x) => x.id === m.sekcija_id);
    const kanalNaziv = m.kanal === KANAL_RUKOVODSTVO ? 'Rukovodstvo' : m.kanal === KANAL_GRUPA ? 'Moja grupa' : (s?.naziv || 'Sekcija');
    const naslov = `${kanalNaziv} — ${memberName(m.autor_id)}`;
    // Poruke imaju vlastiti, običan kanal (ne alarmni kao SOS); starije aplikacije bez njega koriste opšti.
    if (globalThis.AndroidNotif?.poruka) globalThis.AndroidNotif.poruka(naslov, m.tekst, news.length);
    else globalThis.AndroidNotif?.prikazi?.(naslov, m.tekst);
  };

  // Samo nove poruke od zadnjeg kursora (ranije: svaki put 300 NAJSTARIJIH — nove se poslije 300 nisu vidjele).
  const pullChannel = async (key, base, local) => {
    const ck = `lovac.kursor.poruke.${key}`;
    const cursor = loadJSON(ck, null);
    const remote = await fetchNew(base, cursor);
    const known = new Set(d.poruke().map((m) => m.id));
    const fresh = [];
    for (const m of mergeMessages(local, remote)) {
      if (known.has(m.id) && !remote.some((r) => r.id === m.id)) continue;
      await idbPut('poruke', m);
      if (!known.has(m.id)) fresh.push(m);
    }
    saveSoft(ck, nextCursor(remote, cursor));
    return fresh;
  };

  const pullMessages = async () => {
    const fresh = [];
    for (const s of d.mine()) {
      fresh.push(...await pullChannel(s.id, () => d.client().from('poruke').select('*').eq('sekcija_id', s.id),
        d.poruke().filter((m) => m.sekcija_id === s.id)));
    }
    if (d.leader()) {
      fresh.push(...await pullChannel('rukovodstvo', () => d.client().from('poruke').select('*').eq('kanal', KANAL_RUKOVODSTVO), d.rukPoruke()));
    }
    // Poruke grupe: jedan upit za sve moje grupe. Bez migracije 046 (kolona/politika nema) ništa ne puca — grupa tada nema razgovor.
    const gids = d.groupIds();
    if (gids.length && !groupMissing) {
      try {
        fresh.push(...await pullChannel('grupe', () => d.client().from('poruke').select('*').in('grupa_id', gids),
          d.poruke().filter((m) => m.kanal === KANAL_GRUPA)));
      } catch (err) {
        if (missingColumn(err) || /grupa_id/.test(err.message || '')) groupMissing = true; else throw err;
      }
    }
    await d.reload();
    notifyNew(fresh);
  };

  const flushOutbox = async () => {
    for (const m of d.poruke().filter((x) => x.sinhronizovano === false && x.autor_id === d.me()?.id)) {
      try {
        await d.q(d.client().from('poruke').upsert({
          id: m.id, kanal: m.kanal || 'sekcija', sekcija_id: m.sekcija_id ?? null, ...(m.kanal === KANAL_GRUPA ? { grupa_id: m.grupa_id } : {}), lov_id: m.lov_id ?? null, autor_id: m.autor_id, tekst: m.tekst, created_at: m.created_at,
        }, { onConflict: 'id', ignoreDuplicates: true }));
        await idbPut('poruke', { ...m, sinhronizovano: true });
      } catch (err) {
        console.warn('poruka čeka slanje', err.message);
        // Poruka grupe koju server ne može primiti (nema migracije 046, ili više nisam u grupi) ne smije zaustaviti ostale.
        if (m.kanal === KANAL_GRUPA && (['PGRST204', '42703', '42501'].includes(err.code) || /grupa_id|row-level security/i.test(err.message || ''))) continue;
        break;
      }
    }
    await d.reload();
  };

  return { pullMessages, flushOutbox };
}
