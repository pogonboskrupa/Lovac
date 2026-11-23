// "Gdje si?": slanje zahtjeva (dugme uz člana u tabu sekcije), prijem sa dijalogom Da/Ne i obavijest o odgovoru.
// Traži internet sa obje strane; zahtjev važi 15 min. "Da" pokreće dijeljenje lokacije sa sekcijom (1 h).

import { getClient, cachedProfile } from './auth.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality, serverNow } from './net.js';
import { memberName } from './dijeljenje-ui.js';
import { newPing, incomingPings, newAnswers, requestText, answerText, cooldownLeft } from './ping.js';
import { toast } from './ui.js';

const SENT_KEY = 'lovac.ping.poslano';
const SEEN_KEY = 'lovac.ping.objavljeno';
const POLL_MS = 30000; // "Gdje si?" važi 15 min; 30 s je dovoljno, a pola manje zahtjeva
const $ = (id) => document.getElementById(id);

const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

export async function sendPing(sekcijaId, zaId) {
  const me = cachedProfile();
  if (!me || !online()) { toast('Za pitanje „Gdje si?” treba veza sa serverom'); return false; }
  const left = cooldownLeft(loadJSON(SENT_KEY, {}), zaId);
  if (left > 0) { toast(`Već si pitao. Pokušaj ponovo za ${Math.ceil(left / 1000)} s`); return false; }
  const row = newPing({ sekcija_id: sekcijaId, od_id: me.id, za_id: zaId });
  const { error } = await getClient().from('lokacija_zahtjevi').insert(row);
  if (error) {
    toast(/previse_zahtjeva/.test(error.message) ? 'Već si pitao tog lovca, sačekaj par minuta' : 'Pitanje nije poslano');
    return false;
  }
  saveSoft(SENT_KEY, { ...loadJSON(SENT_KEY, {}), [zaId]: Date.now() });
  toast(`Pitanje poslano: ${memberName(zaId)} će dobiti obavijest`);
  document.dispatchEvent(new CustomEvent('ping:osvjezi'));
  return true;
}

export function initPing() {
  const box = $('ping-dijalog');
  let current = null;
  let busy = false;

  const show = (row) => {
    current = row;
    $('ping-tekst').textContent = requestText(memberName(row.od_id));
    box.hidden = false;
  };

  const answer = async (value) => {
    if (!current || busy) return;
    busy = true;
    const row = current;
    try {
      const { error } = await getClient().from('lokacija_zahtjevi').update({ odgovor: value }).eq('id', row.id);
      if (error) throw new Error(error.message);
      if (value === 'da') document.dispatchEvent(new CustomEvent('lokacija:dijeli-sada', { detail: { sekcijaId: row.sekcija_id } }));
      toast(value === 'da' ? 'Dijeliš lokaciju sa sekcijom 1 sat' : 'Odgovorio si: ne');
      box.hidden = true;
      current = null;
    } catch (err) {
      toast('Odgovor nije poslan, pokušaj ponovo');
      console.warn('ping odgovor', err.message);
    } finally {
      busy = false;
    }
    poll();
  };

  const poll = async () => {
    const me = cachedProfile();
    if (!me || !online()) return;
    let rows;
    try {
      const { data, error } = await getClient().from('lokacija_zahtjevi').select('*');
      if (error) throw new Error(error.message);
      rows = data || [];
    } catch (err) {
      console.warn('ping poll', err.message);
      return;
    }
    const incoming = incomingPings(rows, me.id, serverNow());
    if (!incoming.length) {
      if (!busy) { box.hidden = true; current = null; }
    } else if (!current || !incoming.some((r) => r.id === current.id)) {
      show(incoming[0]);
      globalThis.AndroidNotif?.prikazi?.('Gdje si?', requestText(memberName(incoming[0].od_id)));
    } else {
      $('ping-tekst').textContent = requestText(memberName(current.od_id)); // spisak članova je možda stigao tek sada
    }
    const seen = loadJSON(SEEN_KEY, []);
    const answers = newAnswers(rows, me.id, seen, serverNow());
    for (const r of answers) {
      const text = answerText(r, memberName(r.za_id));
      toast(text);
      globalThis.AndroidNotif?.prikazi?.('Gdje si?', text);
      if (r.odgovor === 'da') document.dispatchEvent(new CustomEvent('lokacija:prikazi-clana', { detail: { korisnikId: r.za_id } }));
    }
    if (answers.length) saveSoft(SEEN_KEY, [...seen, ...answers.map((r) => r.id)].slice(-50));
  };

  $('btn-ping-da').addEventListener('click', () => answer('da'));
  $('btn-ping-ne').addEventListener('click', () => answer('ne'));
  document.addEventListener('ping:osvjezi', () => poll());
  setInterval(poll, POLL_MS);
  setTimeout(poll, 4000);
}
