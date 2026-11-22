// "Moja lokacija": ploča koja se otvara dodirom na dugme lokacije. Sadrži centriranje, praćenje, snimanje traga,
// opažanje, istraživač, kopiranje koordinata i dijeljenje lokacije sa sekcijom (na ograničeno vrijeme).

import { getClient, cachedProfile } from './auth.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { memberName } from './dijeljenje-ui.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { myStatus } from './sekcije.js';
import { formatCoordMode, nextCoordMode, COORD_MODES, compassName } from './geo.js';
import { getCoordMode } from './map.js';
import { formatMemberDistance, rangeLabel } from './istrazivac.js';
import { getShareSettings, setShareSettings } from './lokacija-ui.js';
import { shareIntervalMs, initialsOf } from './lokacija.js';
import { SHARE_DURATIONS, shareUntil, activeShare, canShareToSection, sectionShareList, untilText } from './lokacija-sekcija.js';
import { toast, copyText, registerBackHandler, escapeHtml } from './ui.js';

export const SEKCIJA_DIJELJENJE_KEY = 'lovac.sekcija_dijeljenje';
const REMOVE_KEY = 'lovac.sekcija_dijeljenje.uklanjanje';
const POLL_MS = 30000;
const $ = (id) => document.getElementById(id);

async function qLok(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export function initMojaLokacija(L, map) {
  const panel = $('lok-ploca');
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());
  const markers = L.layerGroup().addTo(map);
  let rows = [];
  let sections = []; // sekcije u kojima smijem dijeliti
  let duration = '1';
  let sendTimer = null;

  const isOpen = () => !panel.hidden;
  const sharing = () => activeShare(loadJSON(SEKCIJA_DIJELJENJE_KEY, null));

  // ---------- koordinate u ploči ----------
  const renderCoords = () => {
    const fix = currentFix();
    const f = fix ? formatCoordMode(getCoordMode(), fix.lat, fix.lon) : null;
    $('lok-oznaka').textContent = f ? f.oznaka : '';
    $('lok-koord').textContent = f ? f.tekst : 'Čekam GPS…';
  };

  // ---------- sekcije u kojima mogu dijeliti ----------
  // download: samo pri otvaranju ploče (radnja lovca); pri pokretanju se ne diraju mreža ni događaji ostalih ekrana.
  const loadSections = async ({ download = false } = {}) => {
    let ctx = await cachedSekcije();
    // Prvo otvaranje prije prve sinhronizacije sekcija: preuzmi ih odmah (ako ima veze).
    if (download && !ctx.sekcije.length && online()) { await downloadSekcije().catch(() => {}); ctx = await cachedSekcije(); }
    sections = ctx.sekcije.filter((s) => s.aktivno !== false
      && canShareToSection(myStatus(s, ctx.clanovi, me()?.id, false, ctx.lovocuvari)));
  };

  const renderShare = () => {
    const sh = sharing();
    const none = !sections.length;
    $('lok-sek-nema').hidden = !none;
    $('lok-sek-forma').hidden = none;
    const sel = $('lok-sek-izbor');
    sel.hidden = sections.length < 2 || Boolean(sh);
    sel.innerHTML = sections.map((s) => `<option value="${escapeHtml(s.id)}"${sh?.sekcijaId === s.id ? ' selected' : ''}>${escapeHtml(s.naziv)}</option>`).join('');
    $('lok-sek-trajanje').innerHTML = SHARE_DURATIONS.map((d) => `<button type="button" data-trajanje="${d.id}" aria-pressed="${d.id === duration}">${d.naziv}</button>`).join('');
    $('lok-sek-trajanje').hidden = Boolean(sh);
    const btn = $('lok-sek-prekidac');
    btn.setAttribute('aria-pressed', String(Boolean(sh)));
    const name = sections.find((s) => s.id === (sh?.sekcijaId || sel.value))?.naziv || 'sekciju';
    btn.textContent = sh ? 'Prekini dijeljenje' : `Počni dijeliti sa: ${name}`;
    $('lok-sek-stanje').textContent = sh
      ? `Dijeliš lokaciju sa sekcijom ${sections.find((s) => s.id === sh.sekcijaId)?.naziv || ''} do ${untilText(sh.do)}.`
      : (none ? '' : 'Ne dijeliš lokaciju.');
    const list = sectionShareList(rows, me()?.id, memberName, currentFix());
    $('lok-sek-broj').textContent = list.length ? `(${list.length})` : '';
    $('lok-sek-lista').innerHTML = list.map((m) => `<li class="clan-red" data-uid="${escapeHtml(m.id)}" data-stanje="${m.stanje}">
        <span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(m.ime))}</span>
        <span class="clan-tekst"><b>${escapeHtml(m.ime)}</b><span class="sitno">${m.udaljenost != null ? `${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)} · ` : ''}${m.starost > 1 ? `prije ${m.starost} min` : 'upravo'}</span></span>
        <button type="button" class="dugme" data-akcija="na-karti">Na karti</button></li>`).join('')
      || '<li class="sitno">Niko drugi trenutno ne dijeli lokaciju.</li>';
  };

  const drawMarkers = () => {
    markers.clearLayers();
    for (const m of sectionShareList(rows, me()?.id, memberName, currentFix())) {
      const icon = L.divIcon({ className: 'uc-ikona', html: `<span class="uc-marker sek-marker" data-stanje="${m.stanje}">${escapeHtml(initialsOf(m.ime))}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker([m.lat, m.lon], { icon, keyboard: false })
        .bindTooltip(() => `${m.ime} (sekcija)${currentFix() ? ` · ${rangeLabel(currentFix(), m)}` : ''}`).addTo(markers);
    }
  };

  // ---------- slanje i prijem ----------
  const removeMine = async (sekcijaId) => {
    saveSoft(REMOVE_KEY, sekcijaId);
    await qLok(getClient().from('sekcija_lokacije').delete().eq('sekcija_id', sekcijaId).eq('korisnik_id', me().id));
    saveSoft(REMOVE_KEY, null);
  };

  const sendNow = async () => {
    const sh = sharing();
    if (!sh) { stopSending(); return; }
    const fix = currentFix();
    if (!fix || !online()) return;
    try {
      await qLok(getClient().from('sekcija_lokacije').upsert({
        sekcija_id: sh.sekcijaId, korisnik_id: me().id, lat: fix.lat, lon: fix.lon, acc: fix.acc ?? null,
        t: new Date().toISOString(), do_: new Date(sh.do).toISOString(),
      }, { onConflict: 'sekcija_id,korisnik_id' }));
    } catch (err) {
      console.warn('dijeljenje sa sekcijom', err.message);
    }
  };

  const stopSending = () => { clearInterval(sendTimer); sendTimer = null; };
  const armSending = () => {
    stopSending();
    sendTimer = setInterval(sendNow, shareIntervalMs(getShareSettings().interval));
    sendNow();
  };

  const pull = async () => {
    if (!online()) return;
    try {
      rows = await qLok(getClient().from('sekcija_lokacije').select('*'));
    } catch (err) {
      console.warn('lokacije sekcije', err.message);
    }
    drawMarkers();
    if (isOpen()) renderShare();
  };

  const expireCheck = async () => {
    const raw = loadJSON(SEKCIJA_DIJELJENJE_KEY, null);
    if (raw && !activeShare(raw)) {
      saveSoft(SEKCIJA_DIJELJENJE_KEY, null);
      stopSending();
      if (online()) removeMine(raw.sekcijaId).catch(() => {});
      toast('Dijeljenje lokacije sa sekcijom je isteklo');
      if (isOpen()) renderShare();
    }
    const pending = loadJSON(REMOVE_KEY, null);
    if (pending && !sharing() && online()) removeMine(pending).catch(() => {});
  };

  // ---------- otvaranje i radnje ----------
  const open = async () => {
    $('meni-spiskovi').hidden = true;
    $('btn-centriraj').click(); // dodir na lokaciju uvijek pokaže gdje sam
    await loadSections({ download: true });
    renderCoords();
    renderShare();
    setOpen(true);
    pull();
  };
  const screenEl = $('ekran-mapa');
  // Dok je ploča otvorena, kontrole mape (zoom, +, moja lokacija) i donji paneli se sklanjaju: ploča je uz donju navigaciju.
  const setOpen = (value) => {
    panel.hidden = !value;
    screenEl?.classList.toggle('lok-otvorena', value);
  };
  const close = () => setOpen(false);

  $('btn-moja-lokacija').addEventListener('click', () => (isOpen() ? close() : open()));
  // Automatsko dijeljenje lokacije u lovu (ista postavka kao u Postavkama → Opšte).
  const renderAuto = () => {
    const on = getShareSettings().on;
    $('btn-lok-auto').setAttribute('aria-checked', String(on));
    $('lok-auto-stanje').textContent = on ? 'Uključeno: dok lov traje, učesnici vide tvoju poziciju.' : 'Isključeno: tvoju poziciju u lovu niko ne vidi.';
  };
  $('btn-lok-auto').addEventListener('click', () => { setShareSettings({ on: !getShareSettings().on }); renderAuto(); });
  document.addEventListener('lokacija:postavke', renderAuto);
  renderAuto();
  $('btn-lok-zatvori').addEventListener('click', close);
  // Dodir na kartu zatvara ploču.
  map.on('click', () => { if (isOpen()) close(); });
  registerBackHandler(() => { if (!isOpen()) return false; close(); return true; });
  // Radnje koje vode na kartu zatvaraju ploču (njihovi rukovaoci su već odradili posao).
  $('lok-akcije').addEventListener('click', (e) => { if (e.target.closest('[data-zatvori]')) close(); });

  $('btn-lok-kopiraj').addEventListener('click', async () => {
    const fix = currentFix();
    if (!fix) { toast('Čekam GPS…'); return; }
    const text = COORD_MODES.map((m) => { const f = formatCoordMode(m, fix.lat, fix.lon); return `${f.oznaka} ${f.tekst}`; }).join(' | ');
    toast(await copyText(text) ? 'Koordinate kopirane' : text);
  });

  $('lok-sek-trajanje').addEventListener('click', (e) => {
    const b = e.target.closest('[data-trajanje]');
    if (b) { duration = b.dataset.trajanje; renderShare(); }
  });
  $('lok-sek-izbor').addEventListener('change', renderShare);
  $('lok-sek-prekidac').addEventListener('click', async () => {
    const sh = sharing();
    if (sh) {
      saveSoft(SEKCIJA_DIJELJENJE_KEY, null);
      stopSending();
      renderShare();
      if (online()) { try { await removeMine(sh.sekcijaId); } catch (err) { console.warn('uklanjanje lokacije', err.message); } }
      toast('Dijeljenje prekinuto');
      return;
    }
    const sekcijaId = $('lok-sek-izbor').value || sections[0]?.id;
    if (!sekcijaId) return;
    saveSoft(SEKCIJA_DIJELJENJE_KEY, { sekcijaId, do: shareUntil(duration) });
    armSending();
    renderShare();
    toast('Lokaciju sada vide članovi sekcije');
  });
  $('lok-sek-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="na-karti"]');
    const row = b && rows.find((r) => r.korisnik_id === b.closest('[data-uid]').dataset.uid);
    if (!row) return;
    close();
    map.setView([row.lat, row.lon], Math.max(map.getZoom(), 16), { animate: false });
  });

  // "Gdje si?" → odgovor "da": odmah počni dijeliti sa tom sekcijom na 1 h (ako već dijelim drugu, prelazim na ovu).
  document.addEventListener('lokacija:dijeli-sada', async (e) => {
    const sekcijaId = e.detail?.sekcijaId;
    if (!sekcijaId) return;
    const cur = sharing();
    if (cur && cur.sekcijaId !== sekcijaId && online()) removeMine(cur.sekcijaId).catch(() => {});
    const until = shareUntil('1');
    saveSoft(SEKCIJA_DIJELJENJE_KEY, { sekcijaId, do: cur?.sekcijaId === sekcijaId ? Math.max(cur.do, until) : until });
    armSending();
    if (isOpen()) renderShare();
  });
  // Odgovor "da" na moje pitanje: osvježi lokacije i pokaži tog lovca na karti.
  document.addEventListener('lokacija:prikazi-clana', async (e) => {
    await pull();
    const row = rows.find((r) => r.korisnik_id === e.detail?.korisnikId);
    if (row) map.setView([row.lat, row.lon], Math.max(map.getZoom(), 16), { animate: false });
    else toast('Lokacija još nije stigla, pogledaj za koji trenutak');
  });
  document.addEventListener('lokacija:postavke', () => { if (sharing()) armSending(); });
  onGpsUpdate(() => { if (isOpen()) { renderCoords(); renderShare(); } });
  document.addEventListener('sekcije:promjena', async () => { await loadSections(); if (isOpen()) renderShare(); });
  map.on('moveend', () => { if (isOpen()) renderCoords(); });
  document.querySelector('#koord-traka')?.addEventListener('click', () => { if (isOpen()) renderCoords(); });

  setInterval(() => { expireCheck(); pull(); }, POLL_MS);
  loadSections().then(() => { if (sharing()) armSending(); pull(); });
}
