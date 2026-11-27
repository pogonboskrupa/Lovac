// Pokretanje: odluka o ekranu iz lokalnog stanja ODMAH, mreža samo u pozadini.

import { isServerConfigured, GITHUB_REPO } from './config.js';
import {
  cachedProfile, decideStartScreen, refreshProfileInBackground, register, login, logout, warmServer } from './auth.js';
import { setStorageReporter } from './storage.js';
import { onQualityChange, connectionDetail } from './net.js';
import { showScreen, toast, alarm, initTheme, handleBack, wireMenu, escapeHtml } from './ui.js';
import { cachedPublicSections, fetchPublicSections } from './sekcije-javno.js';
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
import { initMinirano } from './minirano-ui.js';
import { initTragoviKarta } from './tragovi-karta-ui.js';
import { initNagib } from './nagib-ui.js';
import { initMjerenje } from './mjerenje-ui.js';
import { initPreuzimanje } from './preuzimanje-ui.js';
import { initKarte, runKarteAutotest } from './karte-ui.js';
import { initLov } from './lov-ui.js';
import { initNav } from './nav.js';
import { initSekcije } from './sekcije-ui.js';
import { initOdluke } from './odluke-ui.js';
import { initSekcijaEkran } from './sekcija-ui.js';
import { initProfilLovca } from './profil-ui.js';
import { initFotoSync } from './fotosync.js';
import { initArhiva } from './arhiva-ui.js';
import { initLovTragovi } from './lov-tragovi-ui.js';
import { initKamere } from './kamere-ui.js';
import { initTerenTacke } from './teren-tacke-ui.js';
import { initSlike } from './slike-ui.js';
import { initDojave } from './dojave-ui.js';
import { initSlikeLovcima } from './slike-lovcima-ui.js';
import { initArhivaKarta } from './arhiva-karta-ui.js';
import { initMojaLokacija } from './lokacija-sekcija-ui.js';
import { initLokacijaIzabrani } from './lokacija-izabrani-ui.js';
import { initPas } from './pas-ui.js';
import { initVelicina } from './prikaz.js';
import { initTraka } from './traka.js';
import { initDivljac } from './divljac-ui.js';
import { initPregled } from './pregled-ui.js';
import { initStatistika } from './statistika-ui.js';
import { initPrijave } from './prijave-ui.js';
import { initPing } from './ping-ui.js';
import { initOdaziv } from './odaziv-ui.js';
import { initGrupaIzbor } from './grupa-izbor-ui.js';
import { initGrupaEkran } from './grupa-ui.js';
import { initNoviLovac } from './novi-lovac-ui.js';
import { initLdGrmec } from './ld-grmec-ui.js';
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
import { initDodaj } from './dodaj-ui.js';
import { initImageViewer } from './slika-pregled.js';
import { hasAppAccess, inTrial, trialBannerText, waitingText } from './probni.js';
import { initLovDanas } from './lov-danas-ui.js';
import { initMapDisplaySettings } from './razmjer-prikaz.js';
import { checkForUpdate, installUpdate, shouldUseServiceWorker } from './update.js';
import { initUpdateBridge, AZUR_EVENT, barView, startView } from './update-stanje.js';

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
  try { renderTrial(cachedProfile()); } catch (err) { console.warn('probni', err); }
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
      ['meniji', () => { wireMenu('btn-dodaj', 'meni-dodaj'); initDodaj(); initLovDanas(); initNav(); }],
      ['dijeljenje', () => setShareDialog(initDijeljenje())],
      ['navigacija', () => initNavigation(globalThis.L, map)],
      ['objekti', () => initObjekti(globalThis.L, map)],
      ['opazanja', () => initOpazanja(globalThis.L, map)],
      ['danas', () => initDanas(map)],
      ['odstrel', () => initOdstrel(globalThis.L, map)],
      ['odstrel-stat', () => initOdstrelStat()],
      ['slojevi', () => initSlojevi(globalThis.L, map)],
      ['minirano', () => initMinirano()],
      ['tragovi-karta', () => initTragoviKarta(globalThis.L, map)],
      ['nagib', () => initNagib(globalThis.L, map)],
      ['mjerenje', () => initMjerenje(globalThis.L, map)],
      ['preuzimanje', () => initPreuzimanje(map, activeBase, globalThis.L)],
      ['karte', () => initKarte(globalThis.L, map, registerTeren, GITHUB_REPO)],
      ['lov', () => initLov(globalThis.L, map)],
      ['sekcije', () => initSekcije()],
      ['odluke', () => { globalThis.__odluke = initOdluke(); }],
      ['sekcija-ekran', () => initSekcijaEkran(globalThis.L, map)],
      ['grupa-ekran', () => initGrupaEkran()],
      ['tok', () => initTok()],
      ['stan', () => initStan()],
      ['meni', () => initMeni()],
      ['novi-lovac', () => initNoviLovac()],
      ['ld-grmec', () => initLdGrmec()],
      ['pas', () => initPas(globalThis.L, map)],
      ['moja-lokacija', () => initMojaLokacija(globalThis.L, map)],
      ['lokacija-izabrani', () => initLokacijaIzabrani(globalThis.L, map)],
      ['traka', () => initTraka()],
      ['divljac', () => initDivljac()],
      ['pregled', () => initPregled()],
      ['statistika', () => initStatistika()],
      ['prijave', () => initPrijave()],
      ['ping', () => initPing()],
      ['odaziv', () => initOdaziv()],
      ['grupa-izbor', () => initGrupaIzbor()],
      ['slike', () => initSlike(globalThis.L, map)],
      ['dojave', () => initDojave(globalThis.L, map)],
      ['slike-lovcima', () => initSlikeLovcima(globalThis.L, map)],
      ['kamere', () => initKamere(globalThis.L, map)],
      ['teren-tacke', () => { globalThis.__terenTacke = initTerenTacke(globalThis.L, map, activeBase); }],
      ['lov-tragovi', () => initLovTragovi(globalThis.L, map)],
      ['arhiva', () => initArhiva()],
      ['arhiva-karta', () => initArhivaKarta(globalThis.L, map)],
      ['fotosync', () => initFotoSync()],
      ['profil-lovca', () => initProfilLovca()],
      ['uzivo', () => initUzivo(globalThis.L, map)],
      ['istrazivac', () => initIstrazivac(globalThis.L, map)],
      ['kompas', () => initKompas()],
      ['upute', () => initUpute()],
      ['kontakt', () => initKontakt()],
      ['propisi', () => initPropisiAdmin()],
      ['slika-pregled', () => initImageViewer()],
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
    // Ponovni ulazak na kartu (odjava pa prijava): veličina se mora izmjeriti ispočetka.
    document.addEventListener('ekran:mapa', () => requestAnimationFrame(() => map.invalidateSize({ animate: false })));
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

// Traka probnog perioda na karti i tekst ekrana čekanja (iz zadnjeg poznatog profila).
function renderTrial(profile) {
  const bar = document.getElementById('probni-traka');
  if (bar) {
    bar.hidden = !inTrial(profile);
    if (!bar.hidden) bar.textContent = trialBannerText(profile);
  }
  const txt = document.getElementById('cekanje-tekst');
  if (txt && profile) txt.textContent = waitingText(profile);
}

function readForm(form) {
  const fd = new FormData(form);
  return { ime: fd.get('ime'), prezime: fd.get('prezime'), nadimak: fd.get('nadimak'), pin: fd.get('pin'), sekcija: fd.get('sekcija') || '' };
}

// Zadnje ime i prezime (bez PIN-a) se pamte da lovac poslije odjave ne kuca sve iznova.
const ZADNJA_PRIJAVA = 'lovac.prijava.zadnja';
const MODOVI = {
  prijava: { naslov: 'Dobro došli', dugme: 'Prijavi se' },
  registracija: { naslov: 'Novi nalog', dugme: 'Napravi nalog' },
};

function wireAuthForms() {
  const form = document.getElementById('forma-prijava');
  const status = document.getElementById('prijava-status');
  const submitBtn = document.getElementById('btn-prijava');
  let mode = 'prijava';
  const setMode = (m) => {
    mode = m;
    document.querySelectorAll('#pr-mod [data-mod]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mod === m)));
    document.getElementById('pr-mod-naslov').textContent = MODOVI[m].naslov;
    document.getElementById('btn-prijava-tekst').textContent = MODOVI[m].dugme;
    document.getElementById('pr-reg-napomena').hidden = m !== 'registracija';
    document.getElementById('pr-sekcija-blok').hidden = m !== 'registracija';
    if (m === 'registracija') loadSectionChoices();
    submitBtn.value = m;
    status.textContent = '';
  };
  // Revir i sekcija pri registraciji: izbor je neobavezan zahtjev, a odobrava ga lovovođa sekcije/lovočuvar/administrator.
  let sectionsLoaded = false;
  const fillSections = (groups) => {
    const revirSel = document.getElementById('pr-revir');
    const sekSel = document.getElementById('pr-sekcija');
    const prevRevir = revirSel.value;
    revirSel.innerHTML = '<option value="">— izaberi revir —</option>' + groups.map((g) => `<option value="${escapeHtml(g.revir_id)}">${escapeHtml(g.revir)}</option>`).join('');
    revirSel.value = groups.some((g) => g.revir_id === prevRevir) ? prevRevir : '';
    const fillSek = () => {
      const g = groups.find((x) => x.revir_id === revirSel.value);
      const prev = sekSel.value;
      sekSel.innerHTML = '<option value="">— izaberi sekciju —</option>' + (g?.sekcije || []).map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.naziv)}</option>`).join('');
      sekSel.value = g?.sekcije.some((s) => s.id === prev) ? prev : '';
      sekSel.disabled = !g;
    };
    revirSel.onchange = fillSek;
    fillSek();
    document.getElementById('pr-sekcija-prazno').hidden = groups.length > 0;
  };
  const loadSectionChoices = async () => {
    fillSections(cachedPublicSections());
    if (sectionsLoaded) return;
    sectionsLoaded = true;
    fillSections(await fetchPublicSections());
  };
  document.getElementById('pr-mod')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mod]');
    if (b) setMode(b.dataset.mod);
  });
  document.getElementById('btn-pin-prikazi')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const show = btn.getAttribute('aria-pressed') !== 'true';
    form.pin.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Sakrij PIN' : 'Prikaži PIN');
  });
  try {
    const last = JSON.parse(localStorage.getItem(ZADNJA_PRIJAVA) || 'null');
    if (last?.ime) {
      form.ime.value = last.ime;
      form.prezime.value = last.prezime || '';
      if (last.nadimak) { form.nadimak.value = last.nadimak; document.getElementById('pr-nadimak').open = true; }
    }
  } catch { /* zapamćeno ime je samo pogodnost */ }
  // Server se budi dok lovac upisuje ime i PIN (prvi zahtjev poslije mirovanja je spor).
  if (!cachedProfile()) warmServer();
  const submit = async (action) => {
    status.classList.add('info');
    status.textContent = 'Šaljem…';
    submitBtn.setAttribute('aria-busy', 'true');
    form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const slow = setTimeout(() => { status.textContent = 'Server sporo odgovara, čekam… (do 30 s)'; }, 6000);
    try {
      const data = readForm(form);
      const profile = action === 'registracija' ? await register(data) : await login(data);
      status.textContent = '';
      try { localStorage.setItem(ZADNJA_PRIJAVA, JSON.stringify({ ime: data.ime, prezime: data.prezime, nadimak: data.nadimak || '' })); } catch { /* nije bitno */ }
      form.pin.value = '';
      enter(hasAppAccess(profile) ? 'mapa' : 'cekanje');
    } catch (err) {
      status.classList.remove('info');
      status.textContent = err.message;
    } finally {
      clearTimeout(slow);
      submitBtn.removeAttribute('aria-busy');
      form.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  };
  form?.addEventListener('submit', (e) => { e.preventDefault(); submit(e.submitter?.value || mode); });
  document.getElementById('btn-provjeri-odobrenje')?.addEventListener('click', () => backgroundSession(true));
  document.getElementById('btn-odjava')?.addEventListener('click', doLogout);
  // Ponovna prijava na zahtjev lovca (traka "Prijava istekla"); neposlani zapisi ostaju u redu.
  // Traka probnog perioda vodi na "Sekcije i pristup" (tamo se traži članstvo, a lovovođa sekcije ga odobrava).
  document.getElementById('probni-traka')?.addEventListener('click', () => document.getElementById('btn-sekcije')?.click());
  document.getElementById('prijava-istekla')?.addEventListener('click', () => {
    document.getElementById('prijava-istekla').hidden = true;
    doLogout();
  });
}

async function backgroundSession(userAsked = false) {
  if (!isServerConfigured()) return;
  try {
    const profile = await refreshProfileInBackground();
    if (profile === null) {
      // Sa sačuvanim profilom lovac NIKAD ne biva izbačen na prijavu sam od sebe: na slabom signalu (prazan ili čudan
      // odgovor operatera/proksija) i biblioteka za prijavu zna proglasiti sesiju nevažećom. Aplikacija radi dalje
      // offline, zapisi čekaju u redu (bez sesije se ne šalju), a prijava je jedan dodir na traci kad lovac to želi.
      if (shownScreen === 'mapa' && cachedProfile()) {
        document.getElementById('prijava-istekla').hidden = false;
        return;
      }
      await logout();
      enter('prijava');
      return;
    }
    document.getElementById('prijava-istekla').hidden = true;
    const next = hasAppAccess(profile) ? 'mapa' : 'cekanje';
    renderTrial(profile);
    if (next !== shownScreen) enter(next);
    else if (userAsked && !profile.odobren) toast('Još čeka odobrenje administratora ili lovovođe sekcije');
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
    const text = bar.querySelector('.nv-tekst');
    const progress = bar.querySelector('.nv-napredak');
    const btn = bar.querySelector('button');
    let stage = 'azuriraj';
    const show = (v) => {
      stage = v.dugme;
      text.textContent = v.tekst;
      progress.hidden = v.napredak == null;
      if (v.napredak != null) progress.value = v.napredak;
      btn.disabled = v.dugme === 'zauzeto';
      btn.textContent = { azuriraj: 'Ažuriraj', instaliraj: 'Instaliraj', ponovo: 'Ponovo', zauzeto: 'Preuzimam…' }[v.dugme];
    };
    show(barView(null, ver));
    bar.hidden = false;
    // Dodir odmah pokreće preuzimanje i traka pokazuje napredak (ne treba ići u Postavke).
    btn.addEventListener('click', () => {
      if (stage === 'instaliraj') { globalThis.AndroidUpdate?.instalirajPreuzeto?.(); return; }
      show(startView(installUpdate(), ver));
    });
    document.addEventListener(AZUR_EVENT, (e) => show(barView(e.detail, ver)));
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

let lastWeakToast = 0;
function offlineToast() {
  // Najviše jednom u 5 min: lovac mora znati da signal ne valja, ali ne treba ga zasipati porukama.
  if (Date.now() - lastWeakToast < 300000) return;
  lastWeakToast = Date.now();
  toast('Slab signal: aplikacija radi offline, a zapisi se šalju čim veza bude bolja');
}

function wireConnectionBadge() {
  const el = document.getElementById('veza');
  onQualityChange((q) => {
    if (!el) return;
    const d = connectionDetail();
    el.dataset.veza = d;
    el.textContent = { nema: 'Bez veze — radim offline', preslaba: 'Slab signal — radim offline', slaba: 'Slaba veza', dobra: 'Veza OK' }[d] || '';
    if (d === 'preslaba') offlineToast();
  });
}

globalThis.addEventListener('error', (e) => safetyNet(e.error || e.message));
globalThis.addEventListener('unhandledrejection', (e) => safetyNet(e.reason));

onDomReady(() => {
  runSteps([
    ['verzija', () => { document.querySelectorAll('.app-ver').forEach((el) => { el.textContent = APP_VER; }); }],
    ['tema', initTheme],
    ['velicina', initVelicina],
    ['prikaz-karta', initMapDisplaySettings],
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
    ['azuriranje-most', () => initUpdateBridge()],
    ['azuriranje', updateCheck],
    // tastatura smanji vidljivi dio: polje u fokusu se dovodi na vidno mjesto (poslije promjene veličine prozora)
    ['fokus', () => document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!el?.matches?.('input, select, textarea')) return;
      setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* bez toga radi i dalje */ } }, 350);
    })],
    ['autotest', () => {
      const at = new URLSearchParams(globalThis.location.search).get('autotest');
      if (at === 'trag') return runRecordingAutotest();
      if (at === 'karte') return runKarteAutotest();
      return null;
    }],
  ]);
  console.info('BOOT_OK', APP_VER);
});
