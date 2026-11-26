// "Dolaziš na lov?": kad lovovođa sekcije napravi lov sekcije, član dobije pitanje (i obavijest dok je app živa).
// Odgovor ide prvo u red na telefonu (radi offline), pa na server: "Da" = samoprijava (013) + odaziv, "Ne" = odaziv (034).

import { getClient, cachedProfile } from './auth.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality, onQualityChange } from './net.js';
import { idbAll } from './db.js';
import { cachedSekcije } from './sekcije-ui.js';
import { todayIso } from './objekti.js';
import { huntDateText } from './lov.js';
import { isNetworkFailure } from './sync.js';
import { huntsToAsk, queueAnswer, dropAnswer, tableMissing, answerRejected, ODAZIV_KEY, ODAZIV_RED_KEY, ODAZIV_JAVLJENO_KEY } from './odaziv.js';
import { registerBackHandler, toast } from './ui.js';

const $ = (id) => document.getElementById(id);
const CHECK_MS = 60000;
const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

export function initOdaziv() {
  const box = $('odaziv-dijalog');
  const odlozeni = []; // "Kasnije": do sljedećeg pokretanja aplikacije
  let current = null;
  let flushing = false;

  const err = (e) => Object.assign(new Error(e.message || 'greška'), { code: e.code });
  const run = async (query) => { const { error } = await query; if (error) throw err(error); };

  const flush = async () => {
    const me = cachedProfile();
    if (flushing || !me || !online()) return;
    flushing = true;
    try {
      for (const item of loadJSON(ODAZIV_RED_KEY, [])) {
        const sb = getClient();
        try {
          if (item.odgovor === 'da') {
            await run(sb.from('lov_ucesnici').upsert({ lov_id: item.lovId, korisnik_id: me.id, uloga: 'strijelac', samoprijava: true },
              { onConflict: 'lov_id,korisnik_id', ignoreDuplicates: true }));
          } else {
            // brisanje dozvoljava samo vlastitu samoprijavu (RLS); onu koju je upisao lovovođa sekcije ne dira
            await run(sb.from('lov_ucesnici').delete().eq('lov_id', item.lovId).eq('korisnik_id', me.id).eq('samoprijava', true));
          }
          await run(sb.from('lov_odazivi').upsert({ lov_id: item.lovId, korisnik_id: me.id, odgovor: item.odgovor }, { onConflict: 'lov_id,korisnik_id' }));
          saveSoft(ODAZIV_RED_KEY, dropAnswer(loadJSON(ODAZIV_RED_KEY, []), item));
          document.dispatchEvent(new CustomEvent('odaziv:poslan', { detail: item }));
        } catch (e) {
          if (tableMissing(e)) continue; // server bez 034: "Da" je već upisan kao samoprijava, odaziv čeka
          if (answerRejected(e) && !isNetworkFailure(e)) {
            saveSoft(ODAZIV_RED_KEY, dropAnswer(loadJSON(ODAZIV_RED_KEY, []), item));
            toast('Server nije prihvatio odgovor na lov (lov je možda završen ili nisi član sekcije)');
            continue;
          }
          break; // veza: ostaje u redu za sljedeći pokušaj
        }
      }
    } finally {
      flushing = false;
    }
  };

  const show = (rec, sekcija) => {
    current = rec;
    $('odaziv-sekcija').textContent = sekcija?.naziv || 'Sekcija';
    $('odaziv-naslov').textContent = rec.lov.status === 'u_toku' ? 'Lov je u toku' : 'Novi lov';
    $('odaziv-lov').textContent = rec.lov.naziv || 'Lov';
    $('odaziv-datum').textContent = huntDateText(rec.lov.datum);
    const nap = rec.lov.napomena || '';
    $('odaziv-napomena').hidden = !nap;
    $('odaziv-napomena').textContent = nap;
    box.hidden = false;
  };

  const check = async () => {
    const me = cachedProfile();
    if (!me?.id || !box.hidden) return;
    const [lovovi, ctx] = await Promise.all([idbAll('lovovi').catch(() => []), cachedSekcije().catch(() => ({}))]);
    const list = huntsToAsk(lovovi, { myId: me.id, clanovi: ctx.clanovi || [], odgovori: loadJSON(ODAZIV_KEY, {}), odlozeni, today: todayIso() });
    if (!list.length) return;
    const rec = list[0];
    const sekcija = (ctx.sekcije || []).find((s) => s.id === rec.lov.sekcija_id);
    show(rec, sekcija);
    // obavijest jednom po lovu (bez push servisa stiže samo dok je app živa)
    const javljeno = loadJSON(ODAZIV_JAVLJENO_KEY, []);
    if (!javljeno.includes(rec.id)) {
      saveSoft(ODAZIV_JAVLJENO_KEY, [...javljeno, rec.id].slice(-50));
      const title = `Novi lov: ${rec.lov.naziv || 'lov'}`;
      const text = `${huntDateText(rec.lov.datum)} — dolaziš?`;
      if (globalThis.AndroidNotif?.poruka) globalThis.AndroidNotif.poruka(title, text, 1);
      else globalThis.AndroidNotif?.prikazi?.(title, text);
    }
  };

  const answer = (odgovor) => {
    if (!current) return;
    const id = current.id;
    saveSoft(ODAZIV_KEY, { ...loadJSON(ODAZIV_KEY, {}), [id]: { odgovor, t: Date.now() } });
    saveSoft(ODAZIV_RED_KEY, queueAnswer(loadJSON(ODAZIV_RED_KEY, []), id, odgovor));
    box.hidden = true;
    current = null;
    toast(odgovor === 'da' ? 'Javljeno: dolaziš na lov' : 'Javljeno: ne dolaziš');
    flush().then(() => document.dispatchEvent(new CustomEvent('lovovi:promjena'))).catch(() => {});
    setTimeout(check, 400); // sljedeći lov koji čeka odgovor
  };

  $('btn-odaziv-da').addEventListener('click', () => answer('da'));
  $('btn-odaziv-ne').addEventListener('click', () => answer('ne'));
  $('btn-odaziv-kasnije').addEventListener('click', () => {
    if (current) odlozeni.push(current.id);
    box.hidden = true;
    current = null;
  });
  registerBackHandler(() => {
    if (box.hidden) return false;
    $('btn-odaziv-kasnije').click();
    return true;
  });

  document.addEventListener('lovovi:preuzeti', () => { check(); flush(); });
  onQualityChange(() => flush());
  setInterval(() => { check(); flush(); }, CHECK_MS);
  check();
  flush();
}
