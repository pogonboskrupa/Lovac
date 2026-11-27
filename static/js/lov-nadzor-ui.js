// Tab "Lov" za vodstvo: vidi se SAMO dok traje lov u njihovom opsegu. Crta se iz keša (bez zahtjeva serveru).
import { cachedProfile } from './auth.js';
import { idbAll } from './db.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { memberName } from './dijeljenje-ui.js';
import { supervisedHunts } from './lov-nadzor.js';
import { registerBackHandler, escapeHtml } from './ui.js';
import { connectionQuality } from './net.js';
import { getClient } from './auth.js';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 60000;

export const cardHtml = (l) => `<li class="tr-kartica ln-lov" data-id="${escapeHtml(l.id)}">
  <b>${escapeHtml(l.naziv)}</b>
  <span class="sitno">${escapeHtml([l.sekcija, l.grupa].filter(Boolean).join(' · '))}</span>
  <div class="sk-statovi"><div><b>${l.trajanje || '—'}</b><span>traje${l.pocetak ? ` (od ${escapeHtml(l.pocetak)})` : ''}</span></div>
    <div><b>${l.ucesnika}</b><span>učesnika</span></div><div><b>${l.pogonica}</b><span>pogonica</span></div></div>
  <span class="sitno">Vođa lova: ${l.vodje.length ? escapeHtml(l.vodje.join(', ')) : 'nije određen'}</span>
  ${l.napomena ? `<span class="sitno">${escapeHtml(l.napomena)}</span>` : ''}</li>`;

export function pageHtml(ov) {
  if (!ov.ukupno) return '<p class="sitno">Trenutno nema lova u toku.</p>';
  return ov.reviri.map((r) => `<section class="ln-revir"><h3>Revir ${escapeHtml(r.naziv)} <span class="sitno">· ${r.lovovi.length}</span></h3>
    <ul class="tr-lista">${r.lovovi.map(cardHtml).join('')}</ul></section>`).join('');
}

export function initLovNadzor() {
  const btn = $('btn-lov-nadzor');
  const screen = $('lov-nadzor');
  if (!btn || !screen) return;
  const znacka = $('nav-lov-znacka');
  let last = { ukupno: 0, reviri: [], scope: null };

  const compute = async () => {
    const me = cachedProfile();
    if (!me?.id) return { ukupno: 0, reviri: [], scope: null };
    return supervisedHunts(await cachedSekcije(), await idbAll('lovovi'), me, memberName);
  };
  const render = () => {
    $('lnz-opseg').textContent = last.scope?.sve ? 'Cijelo društvo' : `Tvoj revir`;
    $('lnz-stat-lovova').textContent = String(last.ukupno);
    $('lnz-stat-lovaca').textContent = String(last.ucesnika || 0);
    $('lnz-sadrzaj').innerHTML = pageHtml(last);
  };
  const update = async () => {
    try {
      last = await compute();
      btn.hidden = !last.ukupno;
      znacka.textContent = String(last.ukupno);
      znacka.hidden = !last.ukupno;
      if (!screen.hidden) { if (last.ukupno) render(); else { screen.hidden = true; } }
    } catch (err) {
      console.warn('lov nadzor', err.message);
    }
  };
  btn.addEventListener('click', async () => {
    await update();
    if (!last.ukupno) return;
    render(); screen.hidden = false;
    // imena grupovođa: grupe se preuzimaju samo na otvaranje (budžet servera), u pozadini
    if (connectionQuality() !== 'nema' && getClient()) downloadSekcije({ grupe: true }).then(update).catch(() => {});
  });
  $('btn-lnz-zatvori').addEventListener('click', () => { screen.hidden = true; });
  registerBackHandler(() => { if (screen.hidden) return false; screen.hidden = true; return true; });
  for (const ev of ['lovovi:preuzeti', 'lovovi:promjena', 'sekcije:promjena']) document.addEventListener(ev, update);
  setInterval(update, REFRESH_MS);
  setTimeout(update, 3000);
  globalThis.__lovNadzor = { update };
}
