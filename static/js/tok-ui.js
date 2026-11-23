// Ekran "Tok lova": komande vođe (početak/kraj pogona, okupljanje, prekid), moj status na stanu,
// vremenska linija i status učesnika. Offline-first: događaj ide u lokalni red pa na server.

import { getClient, cachedProfile } from './auth.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { loadJSON, saveSoft } from './storage.js';
import { uuid } from './zapisi.js';
import { idbGet } from './db.js';
import { fetchNew, nextCursor } from './inkrement.js';
import { smsNumbers } from './uzivo.js';
import { memberName } from './dijeljenje-ui.js';
import { toast, wireTwoTap, escapeHtml, registerBackHandler } from './ui.js';
import {
  LEADER_EVENTS, MEMBER_EVENTS, EVENT_LABELS, canLead, newDogadjaj, mergeDogadjaji, driveState, memberStatus,
  elapsedText, alertsFor, isRlsDenied, prekidSmsText,
} from './tok.js';

const POLL_MS = 15000;
const OUTBOX = 'lovac.tok.red';
const CACHE = (lovId) => `lovac.tok.keš.${lovId}`;
const SEEN = (lovId) => `lovac.tok.vidjeni.${lovId}`;
const $ = (id) => document.getElementById(id);
const hm = (iso) => new Date(iso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });
const STATUS_TEXT = { 'na-stanu': 'Na stanu', 'u-pokretu': 'U pokretu', pauza: 'Pauza', nema: 'Nije se javio' };

export function initTok() {
  const screen = $('tok-ekran');
  let lov = null;
  let events = [];
  let timer = null;
  const seen = new Set();
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());
  const isOpen = () => !screen.hidden;

  const outbox = () => loadJSON(OUTBOX, []).filter((e) => e.lov_id === lov?.id);

  const render = () => {
    updateStrip();
    if (!isOpen() || !lov) return;
    const all = mergeDogadjaji(events, outbox());
    const ds = driveState(all);
    const el = $('tok-stanje');
    el.dataset.stanje = ds.stanje;
    el.textContent = {
      nije: 'Pogon još nije počeo.',
      pogon: `Pogon u toku od ${ds.od ? hm(ds.od) : ''} (${ds.od ? elapsedText(ds.od) : ''})`,
      kraj: `Pogon završen u ${ds.od ? hm(ds.od) : ''}.`,
      prekid: `LOV PREKINUT u ${ds.od ? hm(ds.od) : ''} — SVI STAJU.`,
    }[ds.stanje];
    $('tok-vodja').hidden = !canLead(lov, me()?.id, me()?.is_admin);
    const mine = memberStatus(all, me()?.id).stanje;
    document.querySelectorAll('#tok-moje [data-vrsta]').forEach((b) => b.setAttribute('aria-pressed', String(
      ({ na_stanu: 'na-stanu', napustio_stan: 'u-pokretu', pauza: 'pauza' })[b.dataset.vrsta] === mine)));
    $('tok-ucesnici').innerHTML = lov.ucesnici.map((u) => {
      const st = memberStatus(all, u.korisnik_id);
      return `<li class="clan-red" data-uid="${escapeHtml(u.korisnik_id)}" data-stanje="${st.stanje}"><span><b>${escapeHtml(memberName(u.korisnik_id))}</b><br>
        <span class="sitno">${STATUS_TEXT[st.stanje]}${st.t ? ` · ${hm(st.t)}` : ''}</span></span></li>`;
    }).join('') || '<li class="sitno">Nema učesnika.</li>';
    const pending = new Set(outbox().map((e) => e.id));
    $('tok-linija').innerHTML = all.slice(-30).reverse().map((e) => `<li data-id="${escapeHtml(e.id)}">
      <span class="sitno">${hm(e.created_at)}${pending.has(e.id) ? ' · čeka slanje' : ''}</span>
      <b>${escapeHtml(memberName(e.autor_id))}</b> — ${escapeHtml(EVENT_LABELS[e.vrsta] || e.vrsta)}${e.tekst ? `: ${escapeHtml(e.tekst)}` : ''}</li>`).join('')
      || '<li class="sitno">Još nema događaja.</li>';
  };

  // Mala oznaka stanja na traci uživo (vidi se i kad ekran nije otvoren).
  const updateStrip = () => {
    const b = $('btn-tok');
    if (!lov) return;
    const ds = driveState(mergeDogadjaji(events, outbox()));
    b.dataset.stanje = ds.stanje;
    b.textContent = ds.stanje === 'prekid' ? 'PREKID' : ds.stanje === 'pogon' ? 'Pogon' : 'Tok';
  };

  const showAlert = (e) => {
    const text = e.vrsta === 'prekid'
      ? `PREKID LOVA — ${memberName(e.autor_id)}: svi staju!${e.tekst ? ` ${e.tekst}` : ''}`
      : `${memberName(e.autor_id)}: ${EVENT_LABELS[e.vrsta]}${e.tekst ? ` — ${e.tekst}` : ''}`;
    const bar = $('tok-baner');
    bar.dataset.vrsta = e.vrsta;
    $('tok-baner-tekst').textContent = text;
    bar.hidden = false;
    if (globalThis.AndroidNotif?.prikazi) globalThis.AndroidNotif.prikazi('Lov', text);
    else navigator.vibrate?.(e.vrsta === 'prekid' ? [800, 300, 800, 300, 1500] : [300, 150, 300]);
  };

  const flush = async () => {
    const pending = outbox();
    if (!pending.length || !online()) return;
    let left = loadJSON(OUTBOX, []);
    for (const e of pending) {
      try {
        const { error } = await getClient().from('lov_dogadjaji').upsert(e, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
        left = left.filter((x) => x.id !== e.id);
        events = mergeDogadjaji(events, [e]);
      } catch (err) {
        if (isRlsDenied(err.message)) {
          left = left.filter((x) => x.id !== e.id);
          toast('Server nije prihvatio događaj (nemaš pravo ili lov nije u toku)');
        } else break;
      }
    }
    saveSoft(OUTBOX, left);
  };

  const poll = async () => {
    if (!lov || !online()) { render(); return; }
    try {
      await flush();
      // samo novi događaji od zadnjeg kursora (ranije cijeli tok lova svakih 15 s)
      const ck = `lovac.kursor.tok.${lov.id}`;
      const cursor = loadJSON(ck, null);
      const lovId = lov.id;
      const data = await fetchNew(() => getClient().from('lov_dogadjaji').select('*').eq('lov_id', lovId), cursor);
      saveSoft(ck, nextCursor(data, cursor));
      events = mergeDogadjaji(events, data);
      saveSoft(CACHE(lov.id), events.slice(-100));
      const fresh = alertsFor(events, me()?.id, seen);
      // Prvo učitavanje: stare komande se ne prikazuju kao nove, osim ako je lov i dalje prekinut.
      for (const e of fresh) {
        seen.add(e.id);
        if (Date.now() - Date.parse(e.created_at) < 120000 || e.vrsta === 'prekid' && driveState(events).stanje === 'prekid') showAlert(e);
      }
      saveSoft(SEEN(lov.id), [...seen]);
    } catch (err) {
      console.warn('tok lova', err.message);
    }
    render();
  };

  // SMS rezerva (bez interneta): otvara SMS aplikaciju sa tekstom, vođa pritisne Pošalji.
  const smsPrekid = async (tekst) => {
    const rec = await idbGet('lovovi', lov.id).catch(() => null);
    const numbers = smsNumbers(rec?.telefoni || lov.telefoni, me()?.id);
    if (!numbers.length || !globalThis.AndroidSms?.posalji) {
      toast(numbers.length ? 'SMS nije dostupan u ovom pregledniku' : 'Nema brojeva telefona učesnika — pozovi ih');
      return;
    }
    globalThis.AndroidSms.posalji(numbers.join(';'), prekidSmsText(lov.lov.naziv, memberName(me().id), currentFix(), tekst));
    toast(`SMS za ${numbers.length} učesnika je otvoren — pritisni Pošalji`);
  };

  const send = async (vrsta, tekst = null) => {
    if (!lov) return;
    const e = newDogadjaj({ id: uuid(), lovId: lov.id, autorId: me().id, vrsta, tekst, fix: currentFix() });
    saveSoft(OUTBOX, [...loadJSON(OUTBOX, []), e]);
    render();
    navigator.vibrate?.(60);
    if (vrsta === 'prekid') await smsPrekid(tekst);
    await flush();
    render();
  };

  const setLov = (rec) => {
    clearInterval(timer);
    timer = null;
    lov = rec;
    $('btn-tok').hidden = !rec;
    $('tok-baner').hidden = true;
    if (!rec) { events = []; return; }
    events = loadJSON(CACHE(rec.id), []);
    seen.clear();
    loadJSON(SEEN(rec.id), []).forEach((id) => seen.add(id));
    timer = setInterval(poll, POLL_MS);
    poll();
  };

  document.addEventListener('lov:aktivan', (e) => {
    const rec = e.detail.lov;
    if (rec?.id === lov?.id) { lov = rec; return; }
    setLov(rec);
  });

  const open = () => { screen.hidden = false; render(); poll(); };
  const close = () => { screen.hidden = true; };
  $('btn-tok').addEventListener('click', open);
  $('btn-tok-zatvori').addEventListener('click', close);
  registerBackHandler(() => { if (screen.hidden) return false; close(); return true; });
  $('btn-tok-baner-ok').addEventListener('click', () => { $('tok-baner').hidden = true; });

  $('tok-moje').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vrsta]');
    if (b && MEMBER_EVENTS[b.dataset.vrsta]) send(b.dataset.vrsta);
  });
  for (const vrsta of Object.keys(LEADER_EVENTS)) {
    const btn = document.querySelector(`#tok-vodja [data-vrsta="${vrsta}"]`);
    wireTwoTap(btn, `DODIRNI PONOVO — ${LEADER_EVENTS[vrsta].toUpperCase()}`, () => send(vrsta, $('tok-tekst').value.trim() || null).then(() => { $('tok-tekst').value = ''; }));
  }
  document.addEventListener('uzivo:poslano', () => { if (lov) flush(); });
  return { send };
}
