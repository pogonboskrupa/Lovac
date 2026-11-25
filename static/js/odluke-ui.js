// Odluke o mojim zahtjevima za sekciju (migracija 040): provjera u pozadini SAMO dok imam zahtjev na čekanju,
// obavijest (toast + sistemska, dok je app živa) i crvena tačka na Meniju → Sekcije i pristup dok je ne potvrdim.

import { getClient, cachedProfile } from './auth.js';
import { idbGet } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { toast } from './ui.js';
import { ODLUKE_KURSOR_KEY, ODLUKE_NOVE_KEY, ODLUKE_CEKAM_KEY, unseenDecisions, nextDecisionCursor, decisionText } from './sekcije-odluke.js';
import { downloadSekcije } from './sekcije-ui.js';

const PROVJERA_MS = 5 * 60 * 1000; // rijetko: odluka nije hitna, a besplatni server ima budžet zahtjeva
const SEEN_KEY = 'lovac.odluke.vidjene';

async function hasPendingRequest(myId) {
  if (loadJSON(ODLUKE_CEKAM_KEY, false)) return true;
  const c = await idbGet('spiskovi', 'sekcije').catch(() => null);
  return (c?.rows?.clanovi || []).some((x) => x.korisnik_id === myId && x.status === 'ceka');
}

export function renderDecisionBadge() {
  const el = document.getElementById('btn-sekcije');
  if (!el) return;
  el.dataset.novo = String(loadJSON(ODLUKE_NOVE_KEY, []).length > 0);
}

export function initOdluke() {
  let tableMissing = false;
  let busy = false;
  const check = async () => {
    const me = cachedProfile();
    const sb = getClient();
    if (busy || tableMissing || !me || !sb || connectionQuality() === 'nema') return;
    if (!(await hasPendingRequest(me.id))) return;
    busy = true;
    try {
      const od = loadJSON(ODLUKE_KURSOR_KEY, null) || new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await sb.from('sekcija_odluke').select('*').eq('korisnik_id', me.id).gt('created_at', od).order('created_at', { ascending: true });
      if (error) {
        if (['PGRST205', '42P01'].includes(error.code)) tableMissing = true;
        return;
      }
      const fresh = unseenDecisions(data || [], loadJSON(SEEN_KEY, []));
      saveSoft(ODLUKE_KURSOR_KEY, nextDecisionCursor(data || [], od));
      if (!fresh.length) return;
      saveSoft(SEEN_KEY, [...loadJSON(SEEN_KEY, []), ...fresh.map((o) => o.id)].slice(-100));
      saveSoft(ODLUKE_NOVE_KEY, [...loadJSON(ODLUKE_NOVE_KEY, []), ...fresh].slice(-20));
      // Stanje sekcija (član / čeka) se osvježi, pa se zna da li još čekam; bez zahtjeva na čekanju provjera prestaje.
      const sek = await downloadSekcije().catch(() => null);
      const sekcije = sek?.sekcije || [];
      if (!(sek?.clanovi || []).some((x) => x.korisnik_id === me.id && x.status === 'ceka')) saveSoft(ODLUKE_CEKAM_KEY, false);
      const text = fresh.map((o) => decisionText(o, sekcije)).join(' ');
      toast(text, 8000);
      globalThis.AndroidNotif?.prikazi?.('Sekcija', text);
      renderDecisionBadge();
      document.dispatchEvent(new CustomEvent('sekcije:odluke'));
    } catch (err) {
      console.warn('odluke', err.message);
    } finally {
      busy = false;
    }
  };
  document.addEventListener('sekcije:odluke', renderDecisionBadge);
  renderDecisionBadge();
  setTimeout(check, 8000);
  setInterval(check, PROVJERA_MS);
  return { check };
}
