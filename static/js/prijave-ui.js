// Prijava ulova društvu: dugme na kartici odstrela otvara dijalog, prijava ide u izlaznu kutiju (radi bez interneta)
// i šalje se kad ima veze. Povlačenje traži internet (server je jedini izvor istine).

import { getClient, cachedProfile } from './auth.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality, onQualityChange } from './net.js';
import { getRecord } from './zapisi.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import {
  REPORT_OUTBOX_KEY, REPORT_SENT_KEY, REPORT_WITHDRAWN_KEY, REPORT_REJECTED_KEY, isRejection, reportTargets, targetLabel, buildReport, reportState, addToOutbox, markSent, missingGroupColumn, withoutGroup,
} from './prijave.js';
import { groupIdIn } from './grupa-podaci.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const FLUSH_MS = 60000;

const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

// Stanje za karticu odstrela (čitanje iz lokalne pohrane, sinhrono).
export function reportStateOf(id) {
  return reportState(id, loadJSON(REPORT_OUTBOX_KEY, []), loadJSON(REPORT_SENT_KEY, []), loadJSON(REPORT_WITHDRAWN_KEY, []), loadJSON(REPORT_REJECTED_KEY, []));
}

// Paket se šalje odjednom; ako ga server odbije, redovi idu pojedinačno da jedan odbijen red (npr. lovac više nije član
// sekcije) ne blokira ostale. Odbijen red se izbacuje iz kutije i pamti kao "odbijena"; mrežna greška ostavlja red.
let flushing = false;
export async function flushReports() {
  if (flushing || !online()) return 0;
  const box = loadJSON(REPORT_OUTBOX_KEY, []);
  if (!box.length) return 0;
  flushing = true;
  const sb = getClient();
  let noGroup = false; // server bez migracije 047
  const send = async (rows) => {
    const r = await sb.from('ulov_prijave').upsert(noGroup ? withoutGroup(rows) : rows, { onConflict: 'id', ignoreDuplicates: true });
    if (r.error && !noGroup && missingGroupColumn(r.error)) { noGroup = true; return send(rows); }
    return r;
  };
  const sentIds = [];
  const rejectedIds = [];
  try {
    const { error } = await send(box);
    if (!error) sentIds.push(...box.map((r) => r.id));
    else if (isRejection(error)) {
      for (const row of box) {
        const r = await send([row]);
        if (!r.error) sentIds.push(row.id);
        else if (isRejection(r.error)) rejectedIds.push(row.id);
        else break; // mrežna greška: ostalo ostaje za sljedeći krug
      }
    }
  } catch (err) {
    console.warn('prijave slanje', err.message);
  } finally {
    flushing = false;
  }
  if (!sentIds.length && !rejectedIds.length) return 0;
  const next = markSent(loadJSON(REPORT_OUTBOX_KEY, []), loadJSON(REPORT_SENT_KEY, []), [...sentIds, ...rejectedIds]);
  saveSoft(REPORT_OUTBOX_KEY, next.outbox);
  saveSoft(REPORT_SENT_KEY, next.sent.filter((id) => !rejectedIds.includes(id)));
  if (rejectedIds.length) {
    saveSoft(REPORT_REJECTED_KEY, [...new Set([...loadJSON(REPORT_REJECTED_KEY, []), ...rejectedIds])]);
    toast('Neka prijava je odbijena: nisi član sekcije u tom reviru');
  }
  document.dispatchEvent(new CustomEvent('prijave:promjena'));
  return sentIds.length;
}

export async function withdrawReport(id) {
  if (!online()) { toast('Povlačenje prijave traži vezu sa serverom'); return false; }
  const { error } = await getClient().from('ulov_prijave').update({ povucena: true }).eq('id', id);
  if (error) { toast('Prijava nije povučena'); return false; }
  saveSoft(REPORT_WITHDRAWN_KEY, [...new Set([...loadJSON(REPORT_WITHDRAWN_KEY, []), id])]);
  document.dispatchEvent(new CustomEvent('prijave:promjena'));
  toast('Prijava je povučena');
  return true;
}

export function initPrijave() {
  const box = $('prijava-dijalog');
  let current = null; // { rec, targets, ctx }

  const close = () => { box.hidden = true; current = null; };

  const open = async (id) => {
    const me = cachedProfile();
    const rec = await getRecord('odstrel', id);
    if (!rec || rec.tudji || !me) return;
    if (reportStateOf(id) !== 'nema') { toast('Ovaj ulov je već prijavljen'); return; }
    let ctx = await cachedSekcije();
    // prvo otvaranje prije prve sinhronizacije sekcija: preuzmi ih odmah (radnja lovca, ako ima veze)
    if (!ctx.sekcije.length && online()) { await downloadSekcije().catch(() => {}); ctx = await cachedSekcije(); }
    const targets = reportTargets(rec, ctx, me.id, Boolean(me.is_admin));
    if (!targets.length) { toast('Prijava je moguća samo članu sekcije. Pridruži se sekciji u Meni → Sekcije i pristup'); return; }
    current = { rec, targets, ctx };
    $('prijava-opis').textContent = `${rec.vrsta}${rec.tezina != null ? `, ${String(rec.tezina).replace('.', ',')} kg` : ''}`;
    const sel = $('prijava-cilj');
    sel.innerHTML = targets.map((t, i) => `<option value="${i}">${escapeHtml(targetLabel(t, ctx))}</option>`).join('');
    $('prijava-cilj-red').hidden = targets.length < 2;
    box.hidden = false;
  };

  $('btn-prijava-potvrdi').addEventListener('click', async () => {
    if (!current) return;
    const me = cachedProfile();
    const t = current.targets[Number($('prijava-cilj').value) || 0];
    const row = buildReport(current.rec, t, me.id, groupIdIn(current.ctx.clanovi, me.id, t.sekcijaId));
    saveSoft(REPORT_OUTBOX_KEY, addToOutbox(loadJSON(REPORT_OUTBOX_KEY, []), row));
    close();
    document.dispatchEvent(new CustomEvent('prijave:promjena'));
    const sent = await flushReports();
    toast(sent ? 'Ulov je prijavljen društvu' : 'Prijava je sačuvana i poslaće se kad bude veze');
  });
  $('btn-prijava-odustani').addEventListener('click', close);
  registerBackHandler(() => { if (box.hidden) return false; close(); return true; });

  document.addEventListener('ulov:prijavi', (e) => open(e.detail?.id));
  onQualityChange((q) => { if (q !== 'nema') flushReports(); }); // veza se vratila: pošalji odmah, ne čekaj minutu
  setInterval(flushReports, FLUSH_MS);
  setTimeout(flushReports, 5000);
}
