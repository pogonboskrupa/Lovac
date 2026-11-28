// "Moja lokacija": ploča koja se otvara dodirom na dugme lokacije. Sadrži centriranje, praćenje, snimanje traga,
// opažanje, istraživač, kopiranje koordinata i dijeljenje lokacije sa sekcijom (na ograničeno vrijeme).

import { createMemberLayer } from './clan-markeri.js';
import { getClient, cachedProfile } from './auth.js';
import { setSharing } from './dijeli-znak.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { memberName } from './dijeljenje-ui.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { myStatus } from './sekcije.js';
import { formatCoordMode, nextCoordMode, COORD_MODES, compassName, locationShareText, secondaryCoordMode } from './geo.js';
import { terrainAt } from './dem.js';
import { shareText } from './dijeljenje.js';
import { getCoordMode } from './map.js';
import { formatMemberDistance, memberCard, distanceM } from './istrazivac.js';
import { getShareSettings, setShareSettings } from './lokacija-ui.js';
import { shareIntervalMs, initialsOf, PRIKAZ_KEY, showOwnMarker } from './lokacija.js';
import { SHARE_DURATIONS, shareUntil, activeShare, canShareToSection, shareGroup, sectionShareList, untilText } from './lokacija-sekcija.js';
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
  let grupa = null; // { sekcijaId, grupaId } kad sam u grupi: tada dijelim samo sa grupom
  let duration = '1';
  let izabranaSekcija = ''; // sekcija koju je lovac izabrao u padajućoj listi (preživi ponovno crtanje ploče)
  let sendTimer = null;

  const isOpen = () => !panel.hidden;
  const sharing = () => activeShare(loadJSON(SEKCIJA_DIJELJENJE_KEY, null));
  let aktivanLov = null; // lov u toku u kojem sam (iz uzivo-ui, događaj lov:aktivan)
  let renderAuto = () => {};

  // ---------- koordinate u ploči ----------
  // N.V. sa modela terena (GPS visina je ~45 m previsoka); računa se kad se pozicija pomjeri ≥ 20 m.
  let nvFor = null;
  const renderNv = async (fix) => {
    if (nvFor && distanceM(nvFor, fix) < 20) return;
    nvFor = { lat: fix.lat, lon: fix.lon };
    const t = await terrainAt(fix.lat, fix.lon, { allowNetwork: connectionQuality() !== 'nema' }).catch(() => null);
    const el = $('lok-nv');
    el.hidden = !Number.isFinite(t?.visina);
    if (!el.hidden) el.textContent = `N.V. ${Math.round(t.visina)} m (model terena)`;
  };
  const renderCoords = () => {
    const fix = currentFix();
    const mode = getCoordMode();
    const f = fix ? formatCoordMode(mode, fix.lat, fix.lon) : null;
    const g = fix ? formatCoordMode(secondaryCoordMode(mode), fix.lat, fix.lon) : null;
    $('lok-oznaka').textContent = f ? f.oznaka : '';
    $('lok-koord').textContent = f ? f.tekst : 'Čekam GPS…';
    $('lok-oznaka2').textContent = g ? g.oznaka : '';
    $('lok-koord2').textContent = g ? g.tekst : '';
    if (fix) renderNv(fix);
  };
  // Dodir bilo gdje na redu prekidača mijenja prekidač (veća meta za prst).
  panel.addEventListener('click', (e) => {
    const row = e.target.closest('.lok-prekidaci .lok-pravac');
    if (row && !e.target.closest('button')) row.querySelector('.lok-prekidac')?.click();
  });

  // ---------- sekcije u kojima mogu dijeliti ----------
  // download: samo pri otvaranju ploče (radnja lovca); pri pokretanju se ne diraju mreža ni događaji ostalih ekrana.
  const loadSections = async ({ download = false } = {}) => {
    let ctx = await cachedSekcije();
    // Prvo otvaranje prije prve sinhronizacije sekcija: preuzmi ih odmah (ako ima veze).
    if (download && online() && (!ctx.sekcije.length || !ctx.grupe?.length)) { await downloadSekcije({ grupe: true }).catch(() => {}); ctx = await cachedSekcije(); }
    sections = ctx.sekcije.filter((s) => s.aktivno !== false
      && canShareToSection(myStatus(s, ctx.clanovi, me()?.id, Boolean(me()?.is_admin), ctx.lovocuvari)));
    grupa = shareGroup(ctx, me()?.id);
    // Lovac/grupovođa u grupi dijele samo sa svojom grupom, pa druga sekcija nije izbor.
    if (grupa) sections = sections.filter((s) => s.id === grupa.sekcijaId);
  };

  const renderShare = () => {
    const sh = sharing();
    const none = !sections.length;
    $('lok-sek-nema').hidden = !none;
    $('lok-sek-forma').hidden = none;
    const sel = $('lok-sek-izbor');
    sel.hidden = sections.length < 2 || Boolean(sh);
    // renderShare se zove stalno (nove pozicije, osvježavanje): lista se gradi SAMO kad se promijenila, a izbor lovca
    // se pamti — inače se padajuća lista zatvarala i vraćala na prvu sekciju ("treperi").
    const optionsHtml = sections.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.naziv)}</option>`).join('');
    if (sel.dataset.sig !== optionsHtml) { sel.innerHTML = optionsHtml; sel.dataset.sig = optionsHtml; }
    const want = sh?.sekcijaId || izabranaSekcija;
    if (want && sections.some((s) => s.id === want) && sel.value !== want) sel.value = want;
    const durHtml = SHARE_DURATIONS.map((d) => `<button type="button" data-trajanje="${d.id}" aria-pressed="${d.id === duration}">${d.naziv}</button>`).join('');
    const durEl = $('lok-sek-trajanje');
    if (durEl.dataset.sig !== durHtml) { durEl.innerHTML = durHtml; durEl.dataset.sig = durHtml; }
    durEl.hidden = Boolean(sh);
    const btn = $('lok-sek-prekidac');
    btn.setAttribute('aria-pressed', String(Boolean(sh)));
    const name = sections.find((s) => s.id === (sh?.sekcijaId || sel.value))?.naziv || 'sekciju';
    const grupaTekst = grupa && sections.some((s) => s.id === grupa.sekcijaId);
    $('lok-sek-naslov').textContent = grupaTekst ? 'Dijeli lokaciju sa grupom' : 'Dijeli lokaciju sa sekcijom';
    $('lok-sek-opis').textContent = grupaTekst
      ? 'Lokaciju vide samo članovi tvoje grupe i rukovodioci iznad grupe (lovovođa sekcije, revira i udruženja, lovočuvari), i samo dok dijeljenje traje (najviše 24 h). Prestaje kad isteknu vrijeme ili kad prekineš.'
      : 'Lokaciju vide članovi, lovovođa sekcije i lovočuvar te sekcije, i samo dok dijeljenje traje (najviše 24 h). Prestaje kad isteknu vrijeme ili kad prekineš.';
    btn.textContent = sh ? 'Prekini dijeljenje' : (grupaTekst ? 'Počni dijeliti sa grupom' : `Počni dijeliti sa: ${name}`);
    $('lok-sek-stanje').textContent = sh
      ? (grupaTekst ? `Dijeliš lokaciju sa svojom grupom do ${untilText(sh.do)}.`
        : `Dijeliš lokaciju sa sekcijom ${sections.find((s) => s.id === sh.sekcijaId)?.naziv || ''} do ${untilText(sh.do)}.`)
      : (none ? '' : 'Ne dijeliš lokaciju.');
    // značka na vrhu ploče: dijeljenje sa sekcijom se vidi bez listanja do dna
    const znacka = $('lok-sek-znacka');
    znacka.hidden = !sh;
    renderAuto();
    setSharing('sekcija', Boolean(sh));
    if (sh) znacka.textContent = `Dijeliš sa ${grupa ? 'grupom' : 'sekcijom'} do ${untilText(sh.do)}`;
    const list = sectionShareList(rows, me()?.id, memberName, currentFix());
    $('lok-sek-broj').textContent = list.length ? `(${list.length})` : '';
    $('lok-sek-lista').innerHTML = list.map((m) => `<li class="clan-red" data-uid="${escapeHtml(m.id)}" data-stanje="${m.stanje}">
        <span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(m.ime))}</span>
        <span class="clan-tekst"><b>${escapeHtml(m.ime)}</b><span class="sitno">${m.udaljenost != null ? `${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)} · ` : ''}${m.starost > 1 ? `prije ${m.starost} min` : 'upravo'}</span></span>
        <button type="button" class="dugme" data-akcija="na-karti">Na karti</button></li>`).join('')
      || '<li class="sitno">Niko drugi trenutno ne dijeli lokaciju.</li>';
  };

  const memberLayer = createMemberLayer(L, map, markers, {
    cssClass: 'sek-marker',
    popupFor: (m) => memberCard(m.ime, currentFix(), m, m.starost, 'sekcija'),
  });
  const drawMarkers = () => {
    memberLayer.draw(sectionShareList(rows, me()?.id, memberName, currentFix())
      .map((m) => ({ ...m, t: new Date(Date.now() - m.starost * 60000).toISOString() })));
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

  const stopSending = () => { clearInterval(sendTimer); sendTimer = null; setSharing('sekcija', false); renderAuto(); };
  const armSending = () => {
    stopSending();
    setSharing('sekcija', true);
    renderAuto();
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
  // Ploča se otvara ODMAH iz keša: na mrtvoj ili preslaboj vezi preuzimanje sekcija visi do isteka roka,
  // a GPS, koordinate, snimanje traga i opažanje ne trebaju server. Sekcije se osvježe u pozadini.
  const open = async () => {
    $('meni-spiskovi').hidden = true;
    $('btn-centriraj').click(); // dodir na lokaciju uvijek pokaže gdje sam
    renderCoords();
    setOpen(true);
    await loadSections();
    renderShare();
    loadSections({ download: true }).then(() => { if (isOpen()) renderShare(); }).catch(() => {});
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
  // "Moja lokacija": samo prikaz moje pozicije na karti (gps.js).
  const renderPrikaz = () => {
    const on = showOwnMarker(loadJSON(PRIKAZ_KEY, null));
    $('btn-lok-prikaz').setAttribute('aria-checked', String(on));
    $('lok-prikaz-stanje').textContent = on ? 'Uključeno: vidiš se na karti' : 'Isključeno: pozicija skrivena na karti';
  };
  $('btn-lok-prikaz').addEventListener('click', () => {
    saveSoft(PRIKAZ_KEY, !showOwnMarker(loadJSON(PRIKAZ_KEY, null)));
    document.dispatchEvent(new CustomEvent('lokacija:prikaz'));
    renderPrikaz();
  });
  renderPrikaz();
  // "Dijeli lokaciju" (odluka vlasnika): dok traje lov u kojem sam, prekidač je dijeljenje u lovu (zadano UKLJUČENO,
  // ista postavka kao u Postavkama); izvan lova je dijeljenje sa sekcijom (zadano ISKLJUČENO, traje izabrano vrijeme).
  renderAuto = () => {
    const sw = $('btn-lok-auto');
    if (aktivanLov) {
      const on = getShareSettings().on;
      sw.setAttribute('aria-checked', String(on));
      sw.setAttribute('aria-label', 'Dijeli lokaciju u lovu');
      $('lok-auto-stanje').textContent = on ? `Uključeno: učesnici lova (${aktivanLov.lov?.naziv || 'lov'}) vide tvoju poziciju` : 'Isključeno: učesnici lova ne vide tvoju poziciju';
      return;
    }
    const sh = sharing();
    sw.setAttribute('aria-checked', String(Boolean(sh)));
    sw.setAttribute('aria-label', grupa ? 'Dijeli lokaciju sa grupom' : 'Dijeli lokaciju sa sekcijom');
    const naziv = sh && sections.find((x) => x.id === sh.sekcijaId)?.naziv;
    $('lok-auto-stanje').textContent = sh ? `Uključeno: ${grupa ? 'tvoja grupa' : `sekcija ${naziv || ''}`} vidi tvoju poziciju do ${untilText(sh.do)}`
      : sections.length ? 'Isključeno: niko ne vidi tvoju poziciju' : 'Isključeno: nisi član nijedne sekcije ni grupe';
  };
  $('btn-lok-auto').addEventListener('click', () => {
    if (aktivanLov) { setShareSettings({ on: !getShareSettings().on }); renderAuto(); return; }
    if (!sharing() && !sections.length) { toast('Dijeljenje je moguće kad si član sekcije (Meni → Sekcije i pristup)'); return; }
    $('lok-sek-prekidac').click(); // isti put kao dugme u kartici sekcije (trajanje iz kartice, zadano 1 h)
  });
  document.addEventListener('lokacija:postavke', () => renderAuto());
  document.addEventListener('lov:aktivan', (e) => { aktivanLov = e.detail?.lov || null; renderAuto(); });
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

  // Pošalji lokaciju (SMS, Viber…): kad neko traži lovca ili lovac traži pomoć; radi i bez interneta (SMS).
  $('btn-lok-posalji').addEventListener('click', async () => {
    const p = me();
    const text = locationShareText(currentFix(), { ime: p ? `${p.ime || ''} ${p.prezime || ''}`.trim() : '' });
    if (!text) { toast('Čekam GPS…'); return; }
    if (shareText(text) === 'nema') toast(await copyText(text) ? 'Lokacija je kopirana — zalijepi je u poruku' : text, 6000);
  });
  $('lok-sek-znacka').addEventListener('click', () => $('lok-sekcija').scrollIntoView({ block: 'start' }));

  $('lok-sek-trajanje').addEventListener('click', (e) => {
    const b = e.target.closest('[data-trajanje]');
    if (b) { duration = b.dataset.trajanje; renderShare(); }
  });
  $('lok-sek-izbor').addEventListener('change', (e) => { izabranaSekcija = e.target.value; renderShare(); });
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
    toast(grupa ? 'Lokaciju sada vide članovi tvoje grupe' : 'Lokaciju sada vide članovi sekcije');
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
  loadSections().then(() => { if (sharing()) armSending(); renderAuto(); pull(); });
}
