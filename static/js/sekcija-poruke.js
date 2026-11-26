// Poruke sekcije i rukovodstva: inkrementalno preuzimanje po kursoru, izlazna kutija (radi bez interneta) i obavijest.
// Stanje (poruke, kontekst sekcija) ostaje u sekcija-ui.js i stiže kroz getter-e; ovdje je samo mrežna i IndexedDB logika.
import { idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { fetchNew, nextCursor } from './inkrement.js';
import { mergeMessages, KANAL_RUKOVODSTVO } from './poruke.js';
import { memberName } from './dijeljenje-ui.js';

const NOTIF_KEY = 'lovac.sekcija.obavijest';

// d = { client(), me(), mine(), leader(), ctx(), poruke(), rukPoruke(), reload(), isOpen(), q(promise) }
export function createMessageSync(d) {
  const notifyNew = (fresh) => {
    const since = loadJSON(NOTIF_KEY, 0);
    const news = fresh.filter((m) => m.autor_id !== d.me()?.id && Date.parse(m.created_at) > since);
    if (!news.length) return;
    saveSoft(NOTIF_KEY, Math.max(...news.map((m) => Date.parse(m.created_at))));
    if (d.isOpen() && document.visibilityState === 'visible') return;
    const m = news[news.length - 1];
    const s = d.ctx().sekcije.find((x) => x.id === m.sekcija_id);
    const naslov = `${m.kanal === KANAL_RUKOVODSTVO ? 'Rukovodstvo' : (s?.naziv || 'Sekcija')} — ${memberName(m.autor_id)}`;
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
    await d.reload();
    notifyNew(fresh);
  };

  const flushOutbox = async () => {
    for (const m of d.poruke().filter((x) => x.sinhronizovano === false && x.autor_id === d.me()?.id)) {
      try {
        await d.q(d.client().from('poruke').upsert({
          id: m.id, kanal: m.kanal || 'sekcija', sekcija_id: m.sekcija_id ?? null, lov_id: m.lov_id ?? null, autor_id: m.autor_id, tekst: m.tekst, created_at: m.created_at,
        }, { onConflict: 'id', ignoreDuplicates: true }));
        await idbPut('poruke', { ...m, sinhronizovano: true });
      } catch (err) {
        console.warn('poruka čeka slanje', err.message);
        break;
      }
    }
    await d.reload();
  };

  return { pullMessages, flushOutbox };
}
