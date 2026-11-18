// Pokretanje: odluka o ekranu iz lokalnog stanja ODMAH, mreža samo u pozadini.

import { isServerConfigured } from './config.js';
import {
  cachedProfile, decideStartScreen, refreshProfileInBackground, register, login, logout,
} from './auth.js';
import { setStorageReporter } from './storage.js';
import { onQualityChange } from './net.js';
import { showScreen, toast, alarm, initTheme } from './ui.js';
import { initMap } from './map.js';
import { initGps } from './gps.js';
import { checkForUpdate, installUpdate } from './update.js';

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
    const { map } = initMap(globalThis.L, 'karta');
    initGps(globalThis.L, map);
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
  document.getElementById('btn-odjava')?.addEventListener('click', async () => {
    await logout();
    enter('prijava');
  });
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

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  return navigator.serviceWorker.register('sw.js').catch((err) => console.warn('sw', err));
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
    ['pohrana', () => setStorageReporter(alarm)],
    ['veza', wireConnectionBadge],
    ['forme', wireAuthForms],
    ['ekran', () => enter(decideStartScreen(cachedProfile(), isServerConfigured()))],
    ['server-nije-podesen', () => {
      if (!isServerConfigured()) document.getElementById('bez-servera').hidden = false;
    }],
    ['sesija', () => backgroundSession()],
    ['sw', registerServiceWorker],
    ['azuriranje', updateCheck],
  ]);
  console.info('BOOT_OK', APP_VER);
});
