// Pokretanje: odluka o ekranu iz lokalnog stanja ODMAH, mreža samo u pozadini.

import { isServerConfigured, GITHUB_REPO } from './config.js';
import {
  cachedProfile, decideStartScreen, refreshProfileInBackground, register, login, logout,
} from './auth.js';
import { setStorageReporter } from './storage.js';
import { onQualityChange } from './net.js';
import { showScreen, toast, alarm, initTheme, handleBack, wireMenu } from './ui.js';
import { initMap } from './map.js';
import { initGps } from './gps.js';
import { initPostavke } from './postavke.js';
import { initTragovi, runRecordingAutotest } from './tragovi-ui.js';
import { initAdmin } from './admin.js';
import { initObjekti } from './objekti-ui.js';
import { initOpazanja } from './opazanja-ui.js';
import { initDanas } from './danas-ui.js';
import { initOdstrel } from './odstrel-ui.js';
import { initSlojevi } from './slojevi-ui.js';
import { initMjerenje } from './mjerenje-ui.js';
import { initPreuzimanje } from './preuzimanje-ui.js';
import { initKarte, runKarteAutotest } from './karte-ui.js';
import { initLov } from './lov-ui.js';
import { initNav } from './nav.js';
import { initSekcije } from './sekcije-ui.js';
import { initSekcijaEkran } from './sekcija-ui.js';
import { initProfilLovca } from './profil-ui.js';
import { initFotoSync } from './fotosync.js';
import { initArhiva } from './arhiva-ui.js';
import { initLovTragovi } from './lov-tragovi-ui.js';
import { initKamere } from './kamere-ui.js';
import { initSlike } from './slike-ui.js';
import { initMojaLokacija } from './lokacija-sekcija-ui.js';
import { initPas } from './pas-ui.js';
import { initVelicina } from './prikaz.js';
import { initTraka } from './traka.js';
import { initDivljac } from './divljac-ui.js';
import { initPregled } from './pregled-ui.js';
import { initStatistika } from './statistika-ui.js';
import { initPrijave } from './prijave-ui.js';
import { initPing } from './ping-ui.js';
import { initNoviLovac } from './novi-lovac-ui.js';
import { initMeni } from './meni-ui.js';
import { initStan } from './stan-ui.js';
import { initOdstrelStat } from './odstrel-stat-ui.js';
import { initTok } from './tok-ui.js';
import { initIstrazivac } from './istrazivac-ui.js';
import { initKompas } from './kompas-ui.js';
import { initUpute } from './upute-ui.js';
import { initUzivo, initKontakt } from './uzivo-ui.js';
import { initPropisiAdmin } from './propisi-admin.js';
import { initDijeljenje, setShareDialog } from './dijeljenje-ui.js';
import { initSync } from './sync.js';
import { initNavigation } from './navigacija.js';
import { refreshAllSpiskovi } from './spiskovi.js';
import { checkForUpdate, installUpdate, shouldUseServiceWorker } from './update.js';

const APP_VER = globalThis.APP_VER || 'v0.0.0';
let mapReady = false;
let shownScreen = null;

function onDomReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

// Svaki korak ima svoj try/catch: jedan pokvaren korak ne smije zaustaviti ostale.
function runSteps(steps) {
  for (const [name, fn] of steps) {
    try {
      const r = fn();
      if (r?.catch) r.catch((err) => console.error(`korak ${name}`, err));
    } catch (err) {
      console.error(`korak ${name}`, err);
    }
  }
}

function enter(screen) {
  shownScreen = screen;
  showScreen(screen);
  if (screen === 'mapa' && !mapReady) {
    mapReady = true;
    const { map, setBase, activeBase, registerTeren } = initMap(globalThis.L, 'karta');
    initGps(globalThis.L, map);
    try {
      initPostavke({ setBase, onLogout: doLogout, appVer: APP_VER });
    } catch (err) {
      console.error('postavke', err);
    }
    for (const [name, fn] of [
      ['meniji', () => { wireMenu('btn-dodaj', 'meni-dodaj'); initNav(); }],
      ['dijeljenje', () => setShareDialog(initDijeljenje())],
      ['navigacija', () => initNavigation(globalThis.L, map)],
      ['objekti', () => initObjekti(globalThis.L, map)],
      ['opazanja', () => initOpazanja(globalThis.L, map)],
      ['danas', () => initDanas(map)],
      ['odstrel', () => initOdstrel(globalThis.L, map)],
      ['odstrel-stat', () => initOdstrelStat()],
      ['slojevi', () => initSlojevi(globalThis.L, map)],
      ['mjerenje', () => initMjerenje(globalThis.L, map)],
      ['preuzimanje', () => initPreuzimanje(map, activeBase, globalThis.L)],
      ['karte', () => initKarte(globalThis.L, map, registerTeren, GITHUB_REPO)],
      ['lov', () => initLov(globalThis.L, map)],
      ['sekcije', () => initSekcije()],
      ['sekcija-ekran', () => initSekcijaEkran(globalThis.L, map)],
      ['tok', () => initTok()],
      ['stan', () => initStan()],
      ['meni', () => initMeni()],
      ['novi-lovac', () => initNoviLovac()],
      ['pas', () => initPas(globalThis.L, map)],
      ['moja-lokacija', () => initMojaLokacija(globalThis.L, map)],
      ['traka', () => initTraka()],
      ['divljac', () => initDivljac()],
      ['pregled', () => initPregled()],
      ['statistika', () => initStatistika()],
      ['prijave', () => initPrijave()],
      ['ping', () => initPing()],
      ['slike', () => initSlike(globalThis.L, map)],
      ['kamere', () => initKamere(globalThis.L, map)],
      ['lov-tragovi', () => initLovTragovi(globalThis.L, map)],
      ['arhiva', () => initArhiva()],
      ['fotosync', () => initFotoSync()],
      ['profil-lovca', () => initProfilLovca()],
      ['uzivo', () => initUzivo(globalThis.L, map)],
      ['istrazivac', () => initIstrazivac(globalThis.L, map)],
      ['kompas', () => initKompas()],
      ['upute', () => initUpute()],
      ['kontakt', () => initKontakt()],
      ['propisi', () => initPropisiAdmin()],
    ]) {
      try { fn(); } catch (err) { console.error(name, err); }
    }
    try {
      initAdmin();
    } catch (err) {
      console.error('admin', err);
    }
    try {
      initTragovi(globalThis.L, map);
    } catch (err) {
      console.error('tragovi', err);
    }
    // Leaflet treba stvarnu veličinu kontejnera nakon što ekran postane vidljiv.
    requestAnimationFrame(() => map.invalidateSize());
  }
}

// Sigurnosna mreža: ako nešto pukne, nikad ne vodi na prijavu dok postoji keširan profil.
function safetyNet(err) {
  console.error('neuhvaćena greška', err);
  if (shownScreen) return;
  try {
    enter(cachedProfile() || !isServerConfigured() ? 'mapa' : 'prijava');
  } catch (e) {
    console.error('safetyNet', e);
  }
}

async function doLogout() {
  // Prvi (sinhroni) dio odjave briše keširan profil; ekran se mijenja odmah,
  // a odjava na serveru ide u pozadini.
  const done = logout();
  enter('prijava');
  await done;
}

function readForm(form) {
  const fd = new FormData(form);
  return { ime: fd.get('ime'), prezime: fd.get('prezime'), nadimak: fd.get('nadimak'), pin: fd.get('pin') };
}

function wireAuthForms() {
  const form = document.getElementById('forma-prijava');
  const status = document.getElementById('prijava-status');
  const submit = async (action) => {
    status.textContent = 'Šaljem…';
    form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const profile = action === 'registracija' ? await register(readForm(form)) : await login(readForm(form));
      status.textContent = '';
      enter(profile.odobren ? 'mapa' : 'cekanje');
    } catch (err) {
      status.textContent = err.message;
    } finally {
      form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  };
  form?.addEventListener('submit', (e) => { e.preventDefault(); submit(e.submitter?.value || 'prijava'); });
  document.getElementById('btn-provjeri-odobrenje')?.addEventListener('click', () => backgroundSession(true));
  document.getElementById('btn-odjava')?.addEventListener('click', doLogout);
}

async function backgroundSession(userAsked = false) {
  if (!isServerConfigured()) return;
  try {
    const profile = await refreshProfileInBackground();
    if (profile === null) {
      // Server je izričito odbio sesiju — tek tada prijava.
      await logout();
      enter('prijava');
      return;
    }
    const next = profile.odobren ? 'mapa' : 'cekanje';
    if (next !== shownScreen) enter(next);
    else if (userAsked && !profile.odobren) toast('Još čeka odobrenje administratora');
  } catch (err) {
    console.warn('pozadinska sesija', err);
    if (userAsked) toast('Nema veze sa serverom');
  }
}

async function updateCheck() {
  try {
    const ver = await checkForUpdate(APP_VER);
    if (!ver) return;
    const bar = document.getElementById('nova-verzija');
    bar.querySelector('.nv-tekst').textContent = `Nova verzija ${ver}`;
    bar.hidden = false;
    bar.querySelector('button').addEventListener('click', () => installUpdate(), { once: true });
  } catch (err) {
    console.warn('provjera verzije', err);
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (shouldUseServiceWorker(globalThis.location, Boolean(globalThis.AndroidUpdate))) {
    await navigator.serviceWorker.register('sw.js');
    return;
  }
  // APK: ukloni SW i keš app shell-a koje su ostavile ranije verzije.
  for (const reg of await navigator.serviceWorker.getRegistrations()) await reg.unregister();
  if (globalThis.caches) {
    for (const k of await caches.keys()) if (k.startsWith('shell-')) await caches.delete(k);
  }
}

function wireConnectionBadge() {
  const el = document.getElementById('veza');
  onQualityChange((q) => {
    if (!el) return;
    el.dataset.veza = q;
    el.textContent = { nema: 'Bez veze', slaba: 'Slaba veza', dobra: 'Veza OK' }[q] || '';
  });
}

globalThis.addEventListener('error', (e) => safetyNet(e.error || e.message));
globalThis.addEventListener('unhandledrejection', (e) => safetyNet(e.reason));

onDomReady(() => {
  runSteps([
    ['verzija', () => { document.querySelectorAll('.app-ver').forEach((el) => { el.textContent = APP_VER; }); }],
    ['tema', initTheme],
    ['velicina', initVelicina],
    ['pohrana', () => setStorageReporter(alarm)],
    ['nazad', () => { globalThis.__nazad = handleBack; }],
    ['veza', wireConnectionBadge],
    ['forme', wireAuthForms],
    ['ekran', () => enter(decideStartScreen(cachedProfile(), isServerConfigured()))],
    ['server-nije-podesen', () => {
      if (!isServerConfigured()) document.getElementById('bez-servera').hidden = false;
    }],
    ['sesija', () => backgroundSession()],
    ['spiskovi', () => (isServerConfigured() ? refreshAllSpiskovi() : null)],
    ['sinhronizacija', () => (isServerConfigured() ? initSync() : null)],
    ['sw', registerServiceWorker],
    ['azuriranje', updateCheck],
    ['autotest', () => {
      const at = new URLSearchParams(globalThis.location.search).get('autotest');
      if (at === 'trag') return runRecordingAutotest();
      if (at === 'karte') return runKarteAutotest();
      return null;
    }],
  ]);
  console.info('BOOT_OK', APP_VER);
});
