// Nadzor lova za vodstvo: pozicije lovaca (dok lov traje) i trag kretanja na karti. Pozicije se čitaju samo dok je lov
// na karti (svakih 20 s, i samo kad ima veze); trag crta lov-tragovi-ui kroz bočnu kontrolu arhive (`arhiva:na-karti`).
// Server (migracija 050) vodstvu pušta pozicije i trag lova u njihovom opsegu; bez nje se ništa ne vidi i to se kaže.
import { getClient } from './auth.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { sharingState } from './lokacija.js';
import { memberCard } from './istrazivac.js';
import { memberName } from './dijeljenje-ui.js';
import { createMemberLayer } from './clan-markeri.js';
import { toast } from './ui.js';

const POLL_MS = 20000;

export function initNadzorKarta(L, map) {
  const layer = L.layerGroup().addTo(map);
  let cur = null; // { lovId, naziv }
  let timer = null;
  let fitted = false;

  const members = createMemberLayer(L, map, layer, {
    popupFor: (m) => memberCard(m.ime, currentFix(), m.p, Math.round((Date.now() - Date.parse(m.p.t)) / 60000)),
  });

  const draw = (rows) => {
    const list = [];
    for (const p of rows) {
      const stanje = sharingState(p.t);
      if (stanje === 'nema') continue;
      list.push({ id: p.korisnik_id, ime: memberName(p.korisnik_id), lat: p.lat, lon: p.lon, t: p.t, stanje, uloga: 'ostali', p });
    }
    members.draw(list);
    if (!fitted && list.length) {
      fitted = true;
      // trag (ako ga ima) sam pomjera kartu; pozicije je pomjeraju samo kad traga nema
      setTimeout(() => { if (cur && !document.querySelector('#lov-trag-legenda:not([hidden])')) map.fitBounds(list.map((m) => [m.lat, m.lon]), { padding: [60, 60], maxZoom: 16, animate: false }); }, 900);
    }
  };

  const poll = async () => {
    if (!cur || connectionQuality() === 'nema' || !getClient()) return;
    const lovId = cur.lovId;
    try {
      const { data, error } = await getClient().from('lov_pozicije').select('*').eq('lov_id', lovId);
      if (error) throw error;
      if (cur?.lovId === lovId) draw(data || []);
    } catch (err) {
      console.warn('nadzor pozicije', err.message);
    }
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
    cur = null;
    fitted = false;
    members.draw([]);
  };

  document.addEventListener('nadzor:prikazi', (e) => {
    const { lovId, naziv } = e.detail || {};
    if (!lovId) return;
    stop();
    cur = { lovId, naziv };
    document.dispatchEvent(new CustomEvent('arhiva:na-karti', { detail: { lovId, naziv: naziv || 'Lov', live: true } }));
    toast('Lovci koji dijele lokaciju su na karti (osvježava se svakih 20 s)');
    poll();
    timer = setInterval(poll, POLL_MS);
  });
  document.addEventListener('arhiva:zatvorena', (e) => { if (cur && e.detail?.lovId === cur.lovId) stop(); });
}
