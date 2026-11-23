// UI "uživo" za lov u toku: moja pozicija -> server, pozicije drugih, SOS (server + SMS),
// primljen SOS (obavijest, vibracija, "Vodi me do"), odstrel u lovu i zbirni izvještaj.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { idbAll } from './db.js';
import { pickActiveHunt, shareIntervalMs, sharingState, initialsOf } from './lokacija.js';
import { getShareSettings, initLokacijaEkran } from './lokacija-ui.js';
import { memberCard } from './istrazivac.js';
import { shouldRecordPoint, pushPoint, removeSentPoints } from './lovtrag.js';
import { loadJSON, saveSoft } from './storage.js';
import { uuid } from './zapisi.js';
import { memberName } from './dijeljenje-ui.js';
import { startNavigation } from './navigacija.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { reportHtml } from './odstrel.js';
import { printHtml } from './odstrel-ui.js';
import { sosText, smsNumbers, newSosSince, huntReportData } from './uzivo.js';
import { toast, wireTwoTap, escapeHtml, registerBackHandler } from './ui.js';

const POLL_MS = 20000;
const ODSTREL_RED = 'lovac.lov_odstrel.red';
const $ = (id) => document.getElementById(id);

async function qUzivo(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export function initUzivo(L, map) {
  const others = L.layerGroup().addTo(map);
  let lov = null; // keširan zapis lova (sa rasporedom)
  let timer = null;
  let channel = null;
  const seenSos = new Set();
  let lastRows = [];
  let lastSent = 0;
  const me = () => cachedProfile();

  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

  const drawOthers = (rows) => {
    lastRows = rows;
    document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows } }));
    others.clearLayers();
    for (const p of rows) {
      if (p.korisnik_id === me()?.id) continue;
      const stanje = sharingState(p.t);
      if (stanje === 'nema') continue;
      const u = lov?.ucesnici.find((x) => x.korisnik_id === p.korisnik_id);
      const age = Math.round((Date.now() - Date.parse(p.t)) / 60000);
      const name = memberName(p.korisnik_id);
      const icon = L.divIcon({
        className: 'uc-ikona',
        html: `<span class="uc-marker" data-stanje="${stanje}" data-uloga="${u?.uloga === 'pogonic' ? 'pogonic' : 'ostali'}">${escapeHtml(initialsOf(name))}</span>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });
      L.marker([p.lat, p.lon], { icon, keyboard: false })
        .bindPopup(() => memberCard(name, currentFix(), p, age), { closeButton: true, autoPan: true }).addTo(others);
    }
  };

  const showSos = (row) => {
    seenSos.add(row.id);
    const text = row.poruka || `SOS od ${memberName(row.korisnik_id)}`;
    $('sos-primljen-tekst').textContent = text;
    $('sos-primljen').dataset.lat = row.lat ?? '';
    $('sos-primljen').dataset.lon = row.lon ?? '';
    $('sos-primljen').dataset.ime = memberName(row.korisnik_id);
    $('sos-primljen').hidden = false;
    if (globalThis.AndroidNotif?.prikazi) globalThis.AndroidNotif.prikazi('SOS u lovu', text);
    else navigator.vibrate?.([600, 300, 600, 300, 1200]);
  };

  const flushHarvest = async () => {
    const pending = loadJSON(ODSTREL_RED, []);
    if (!pending.length || !online()) return;
    const left = [];
    for (const row of pending) {
      try { await qUzivo(getClient().from('lov_odstrel').upsert(row, { onConflict: 'id' })); } catch { left.push(row); }
    }
    saveSoft(ODSTREL_RED, left);
  };

  const iAmParticipant = () => Boolean(lov?.ucesnici?.some((u) => u.korisnik_id === me()?.id));
  const REMOVE_KEY = 'lovac.lokacija.uklanjanje';

  // Trag kretanja tokom lova: tačke se čuvaju lokalno (i bez veze) i šalju u paketima; ostaju u arhivi lova.
  const trailKey = () => `lovac.lovtrag.bafer.${lov.id}`;
  const recordTrail = () => {
    const fix = currentFix();
    if (!lov || lov.lov.status !== 'u_toku' || !getShareSettings().on || !fix || !iAmParticipant()) return;
    const buf = loadJSON(trailKey(), []);
    const point = { lat: fix.lat, lon: fix.lon, t: Date.now() };
    if (shouldRecordPoint(buf[buf.length - 1], point, point.t)) saveSoft(trailKey(), pushPoint(buf, point));
  };
  const flushTrail = async () => {
    const buf = loadJSON(trailKey(), []);
    if (!buf.length || !online()) return;
    const poslane = [];
    for (let i = 0; i < buf.length; i += 200) {
      const chunk = buf.slice(i, i + 200);
      await qUzivo(getClient().from('lov_tragovi').upsert(
        chunk.map((p) => ({ lov_id: lov.id, korisnik_id: me().id, t: new Date(p.t).toISOString(), lat: p.lat, lon: p.lon })),
        { onConflict: 'lov_id,korisnik_id,t', ignoreDuplicates: true }));
      saveSoft(trailKey(), removeSentPoints(loadJSON(trailKey(), []), chunk));
      poslane.push(...chunk);
    }
    document.dispatchEvent(new CustomEvent('lovtrag:poslano', { detail: { lovId: lov.id, korisnikId: me().id, tacke: poslane } }));
  };

  const tickBody = async () => {
    if (!lov || lov.lov.status !== 'u_toku' || !online()) return;
    const sb = getClient();
    const fix = currentFix();
    const share = getShareSettings();
    try {
      if (share.on && fix && iAmParticipant()) {
        await qUzivo(sb.from('lov_pozicije').upsert({ lov_id: lov.id, korisnik_id: me().id, lat: fix.lat, lon: fix.lon, acc: fix.acc, t: new Date().toISOString() },
          { onConflict: 'lov_id,korisnik_id' }));
        lastSent = Date.now();
        saveSoft(REMOVE_KEY, null);
        document.dispatchEvent(new CustomEvent('uzivo:poslano'));
      } else if (!share.on) {
        await removeMyPosition(lov.id);
      }
      await flushTrail().catch((err) => console.warn('trag lova', err.message));
      drawOthers(await qUzivo(sb.from('lov_pozicije').select('*').eq('lov_id', lov.id)));
      for (const s of newSosSince(await qUzivo(sb.from('sos').select('*').eq('lov_id', lov.id)), me()?.id, seenSos)) showSos(s);
      $('uzivo-stanje').textContent = share.on ? `Uživo: osvježeno ${new Date().toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })}`
        : 'Lokacija isključena — drugi te ne vide';
    } catch (err) {
      $('uzivo-stanje').textContent = 'Uživo: nema veze sa serverom';
      console.warn('uživo', err.message);
    }
    await flushHarvest();
  };

  // Tačka traga se bilježi uvijek, a slanje ide jedan po jedan krug: sporo slanje se ne smije preklopiti sa sljedećim.
  let ticking = false;
  const tick = async () => {
    recordTrail();
    if (ticking) return;
    ticking = true;
    try { await tickBody(); } finally { ticking = false; }
  };

  // Brisanje vlastite pozicije kad se dijeljenje isključi; ako nema veze, pokušaj se pamti.
  const removeMyPosition = async (lovId) => {
    saveSoft(REMOVE_KEY, lovId);
    await qUzivo(getClient().from('lov_pozicije').delete().eq('lov_id', lovId).eq('korisnik_id', me().id));
    saveSoft(REMOVE_KEY, null);
  };

  // Telefoni se preuzimaju dok ima veze, da SOS SMS radi i bez interneta.
  const refreshPhones = async () => {
    if (!online()) return;
    try {
      const tel = await qUzivo(getClient().rpc('lov_telefoni', { p_lov: lov.id }));
      const rec = await idbGet('lovovi', lov.id);
      await idbPut('lovovi', { ...rec, telefoni: tel });
      lov = { ...lov, telefoni: tel };
    } catch (err) {
      console.warn('telefoni', err.message);
    }
  };

  const stop = () => {
    clearInterval(timer);
    timer = null;
    others.clearLayers();
    document.dispatchEvent(new CustomEvent('uzivo:pozicije', { detail: { rows: [] } }));
    if (channel) { getClient()?.removeChannel(channel); channel = null; }
    $('uzivo').hidden = true;
    document.dispatchEvent(new CustomEvent('lov:aktivan', { detail: { lov: null } }));
  };

  const arm = () => {
    clearInterval(timer);
    timer = setInterval(tick, shareIntervalMs(getShareSettings().interval));
  };

  const activate = async (rec) => {
    if (lov?.id === rec.id && timer) { lov = rec; return; }
    stop();
    lov = rec;
    $('uzivo').hidden = false;
    document.dispatchEvent(new CustomEvent('lov:aktivan', { detail: { lov: rec } }));
    // Ranije SOS-ove ovog lova ne prikazuj ponovo kao nove.
    loadJSON(`lovac.sos.vidjeni.${lov.id}`, []).forEach((id) => seenSos.add(id));
    await refreshPhones();
    arm();
    tick();
    try {
      channel = getClient()?.channel(`sos-${lov.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos', filter: `lov_id=eq.${lov.id}` }, (m) => {
          if (m.new.korisnik_id !== me()?.id && !seenSos.has(m.new.id)) showSos(m.new);
        }).subscribe();
    } catch (err) {
      console.warn('realtime', err.message);
    }
  };

  // Lov u toku u kojem sam učesnik šalje poziciju i bez otvorenog rasporeda; kraj lova gasi slanje.
  const autoPick = async () => {
    if (!me()) return;
    const rec = pickActiveHunt(await idbAll('lovovi').catch(() => []), me().id);
    if (rec) { await activate(rec); return; }
    if (lov) {
      const ended = lov.id;
      stop();
      lov = null;
      removeMyPosition(ended).catch(() => {});
    }
  };

  document.addEventListener('lov:prikazan', async (e) => {
    const shown = e.detail.lov;
    if (shown?.lov.status === 'u_toku') await activate(shown);
    else await autoPick();
  });
  document.addEventListener('lokacija:postavke', async (e) => {
    if (lov) {
      arm();
      if (!e.detail.on) { try { await removeMyPosition(lov.id); } catch (err) { console.warn('uklanjanje pozicije', err.message); } }
      tick();
    }
  });
  setInterval(() => {
    const pending = loadJSON(REMOVE_KEY, null);
    if (pending && online() && getShareSettings().on === false) removeMyPosition(pending).catch(() => {});
    autoPick();
  }, 60000);
  autoPick();
  initLokacijaEkran(map, { lov: () => lov, rows: () => lastRows, lastSent: () => lastSent });

  // ---- SOS ----
  wireTwoTap($('btn-sos'), 'DODIRNI PONOVO — ŠALJE SOS', async () => {
    if (!lov) return;
    const text = sosText(me(), currentFix(), lov.lov.naziv);
    const fix = currentFix();
    let viaServer = false;
    if (online()) {
      try {
        await qUzivo(getClient().from('sos').insert({ id: uuid(), lov_id: lov.id, korisnik_id: me().id, lat: fix?.lat ?? null, lon: fix?.lon ?? null, poruka: text }));
        viaServer = true;
      } catch (err) {
        console.warn('SOS server', err.message);
      }
    }
    const numbers = smsNumbers(lov.telefoni, me()?.id);
    if (numbers.length && globalThis.AndroidSms?.posalji) globalThis.AndroidSms.posalji(numbers.join(';'), text);
    $('sos-poslan').textContent = `${viaServer ? 'SOS je poslan učesnicima preko servera. ' : 'Server nije dostupan. '}`
      + `${numbers.length ? `SMS za ${numbers.length} učesnika je otvoren — pritisni Pošalji.` : 'Nema brojeva telefona učesnika — nazovi ili pokaži poruku.'}`;
    $('sos-poslan-tekst').textContent = text;
    $('sos-poslan-dijalog').hidden = false;
  });
  $('btn-sos-poslan-zatvori').addEventListener('click', () => { $('sos-poslan-dijalog').hidden = true; });

  $('btn-sos-vodi').addEventListener('click', () => {
    const d = $('sos-primljen').dataset;
    $('sos-primljen').hidden = true;
    if (d.lat) startNavigation({ lat: Number(d.lat), lon: Number(d.lon), naziv: `SOS: ${d.ime}` });
  });
  $('btn-sos-zatvori').addEventListener('click', () => {
    $('sos-primljen').hidden = true;
    if (lov) saveSoft(`lovac.sos.vidjeni.${lov.id}`, [...seenSos]);
  });
  registerBackHandler(() => {
    if (!$('sos-poslan-dijalog').hidden) { $('sos-poslan-dijalog').hidden = true; return true; }
    return false;
  });

  // ---- odstrel u lovu (iz forme odstrela) ----
  document.addEventListener('odstrel:upisan', (e) => {
    const rec = e.detail;
    if (!lov || !rec.uLov) return;
    const stan = lov.stanovi.find((s) => s.korisnik_id === me()?.id);
    const pending = loadJSON(ODSTREL_RED, []);
    pending.push({ id: rec.id, lov_id: lov.id, korisnik_id: me().id, vrsta: rec.vrsta, kategorija: rec.kategorija, vrijeme: new Date(rec.vrijeme).toISOString(), tezina: rec.tezina, stan_broj: stan?.broj ?? null });
    saveSoft(ODSTREL_RED, pending);
    flushHarvest();
  });

  return { current: () => lov };
}

// Svoj broj telefona (za SOS SMS u lovu) — vide ga samo učesnici lova u toku.
export function initKontakt() {
  $('btn-telefon-sacuvaj').addEventListener('click', async () => {
    const t = $('telefon').value.trim();
    if (!/^\+?[0-9 ]{6,20}$/.test(t)) { $('telefon-status').textContent = 'Broj: cifre, razmaci i + (npr. +387 61 123 456)'; return; }
    try {
      await qUzivo(getClient().from('kontakti').upsert({ korisnik_id: cachedProfile().id, telefon: t }, { onConflict: 'korisnik_id' }));
      $('telefon-status').textContent = 'Sačuvano. Broj vide samo učesnici lova dok lov traje.';
    } catch (err) {
      $('telefon-status').textContent = `Nije sačuvano (potreban internet): ${err.message}`;
    }
  });
}

// Zbirni izvještaj lova (PDF): odstrel po vrsti i učesnici. Poziva se iz spiska lovova.
export async function printHuntReport(lovId) {
  const lov = await idbGet('lovovi', lovId);
  if (!lov) return;
  let odstrel = [];
  try { odstrel = await qUzivo(getClient().from('lov_odstrel').select('*').eq('lov_id', lov.id)); } catch (err) { toast(`Odstrel lova nije preuzet: ${err.message}`); }
  const vrste = await getSpisakAll('vrste');
  const d = huntReportData(lov, odstrel, memberName, (k) => lookupNaziv(vrste, k));
  const html = reportHtml({
    naslov: `Zajednički lov: ${lov.lov.naziv}`,
    podnaslov: `${lov.lov.datum} · ${lov.revir?.naziv || ''} · učesnici: ${d.ucesnici.join('; ')}`,
    redovi: d.redovi,
    kolone: [{ key: 'vrijeme', label: 'Vrijeme' }, { key: 'vrsta', label: 'Vrsta' }, { key: 'kategorija', label: 'Spol/dob' },
      { key: 'tezina', label: 'Težina (kg)', type: 'decimal' }, { key: 'stan', label: 'Stan' }, { key: 'lovac', label: 'Odstrijelio' }],
    zbir: d.zbir,
    napomena: 'Zbirni izvještaj aplikacije ne zamjenjuje službeni lovački dnevnik ni izvještaj vođe lova.',
  });
  printHtml(html, `Lov ${lov.lov.naziv}`);
}
