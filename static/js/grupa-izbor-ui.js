// Dijalog "Izaberi grupu" poslije registracije: grupe daje `javne_grupe`, izbor ide kroz `zeljena_grupa` (migracija 045).
// Radi samo uz internet; "Kasnije" pita ponovo pri sljedećem pokretanju, ostali odgovori se pamte.
import { getClient, cachedProfile } from './auth.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { cachedSekcije } from './sekcije-ui.js';
import { sectionsToAsk, PITANO_KEY } from './grupa-izbor.js';
import { registerBackHandler, toast, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

export function initGrupaIzbor() {
  const box = $('grupa-dijalog');
  const odlozeno = new Set(); // "Kasnije": do sljedećeg pokretanja
  const upitano = new Set(); // sekcije za koje je server već pitan u ovoj sesiji (budžet servera: najviše jedan upit po sekciji)
  let current = null;
  let busy = false;

  const close = () => { box.hidden = true; current = null; };
  const done = (sekcijaId) => { saveSoft(PITANO_KEY(sekcijaId), true); close(); };

  const check = async () => {
    if (busy || !box.hidden || !online() || !cachedProfile()) return;
    busy = true;
    try {
      const ctx = await cachedSekcije();
      const id = sectionsToAsk(ctx.clanovi, cachedProfile().id, (sid) => Boolean(loadJSON(PITANO_KEY(sid), false)) || odlozeno.has(sid) || upitano.has(sid))[0];
      if (!id) return;
      upitano.add(id);
      const { data, error } = await getClient().rpc('javne_grupe', { p_sekcija: id });
      if (error) { if (error.code !== 'PGRST202') upitano.delete(id); return; } // bez veze: pokušaće se ponovo; PGRST202 (server bez 045) se ne ponavlja u ovoj sesiji

      if (!data?.length) { saveSoft(PITANO_KEY(id), true); return; } // sekcija nema grupa: nema šta birati
      current = id;
      $('grupa-sekcija').textContent = ctx.sekcije.find((s) => s.id === id)?.naziv || '';
      $('grupa-izbor').innerHTML = data.map((g) => `<option value="${escapeHtml(g.id)}">Grupovođa ${escapeHtml(g.grupovodja)}</option>`).join('');
      box.hidden = false;
    } catch { /* provjera se ponavlja */ } finally { busy = false; }
  };

  $('btn-grupa-potvrdi').addEventListener('click', async () => {
    if (!current) return;
    const sid = current;
    const { error } = await getClient().rpc('zeljena_grupa', { p_sekcija: sid, p_grupa: $('grupa-izbor').value });
    if (error) { toast(`Grupa nije sačuvana (${error.message})`); return; }
    saveSoft(`lovac.grupa.izbor.${sid}`, $('grupa-izbor').selectedOptions[0]?.textContent.replace(/^Grupovođa /, '') || '');
    toast('Grupa je izabrana — ulaziš u nju kad ti odobre članstvo');
    document.dispatchEvent(new CustomEvent('sekcije:promjena'));
    done(sid);
  });
  $('btn-grupa-nemam').addEventListener('click', () => { if (current) done(current); });
  $('btn-grupa-kasnije').addEventListener('click', () => { if (current) odlozeno.add(current); close(); });
  registerBackHandler(() => { if (box.hidden) return false; if (current) odlozeno.add(current); close(); return true; });

  // pri pokretanju (kad se keš sekcija i veza slegnu) i kad stignu podaci o sekcijama
  setTimeout(check, 9000);
  document.addEventListener('sekcije:promjena', () => setTimeout(check, 500));
}
