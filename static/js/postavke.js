// Ekran Postavke: izgled, podloga, keš karte, nalog, verzija i ažuriranje.

import { applyTheme, toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import { tileCacheCount, clearTileCache } from './tiles.js';
import { cachedProfile, changePin } from './auth.js';
import { isServerConfigured } from './config.js';
import { connectionDetail } from './net.js';
import { checkForUpdate, installUpdate } from './update.js';
import { AZUR_EVENT } from './update-stanje.js';
import { refreshAdminVisibility } from './admin.js';
import { cachedSekcije } from './sekcije-ui.js';
import { setVelicina } from './prikaz.js';
import { queueCount } from './sync.js';
import { initialsOfProfile, profileRoles } from './profil.js';
import { getShareSettings, setShareSettings } from './lokacija-ui.js';
import { SHARE_INTERVALS } from './lokacija.js';
import { listRecords, saveRecord } from './zapisi.js';
import { shareFile } from './dijeljenje.js';
import { storageSummary, syncText, backupAdvice } from './postavke-pregled.js';
import { reliabilityItems, needsAttention } from './pouzdanost.js';
import { loadJSON, saveSoft } from './storage.js';
import { buildBackup, parseBackup, recordsToImport, backupFileName, BACKUP_STORES } from './rezerva.js';

const VEZA_TEKST = {
  nema: 'Bez veze',
  preslaba: 'Slab signal — radim offline',
  slaba: 'Slaba veza',
  dobra: 'Veza je dobra',
  nepoznato: 'Još nije provjereno',
};

export function describeProfile(p) {
  if (!p) return 'Niste prijavljeni';
  const ime = `${p.ime} ${p.prezime}${p.nadimak ? ` (${p.nadimak})` : ''}`;
  const status = !p.odobren ? 'čeka odobrenje' : p.is_admin ? 'administrator' : 'lovac';
  return `${ime} · ${status}`;
}

const BACKUP_KEY = 'lovac.rezerva.zadnja';

const el = (id) => document.getElementById(id);

export function isSettingsOpen() {
  const s = el('postavke');
  return Boolean(s && !s.hidden);
}

export function closeSettings() {
  const s = el('postavke');
  if (s) s.hidden = true;
}


async function refreshCacheCount() {
  const out = el('postavke-kes');
  try {
    out.textContent = `Sačuvano pločica: ${await tileCacheCount()}`;
  } catch (err) {
    console.warn('broj pločica', err);
    out.textContent = 'Sačuvano pločica: —';
  }
}

function refreshStatic(appVer) {
  el('postavke-nalog').textContent = describeProfile(cachedProfile());
  el('postavke-verzija').textContent = appVer;
  refreshAdminVisibility();
  renderProfile();
  renderShare();
  el('postavke-server').textContent = isServerConfigured()
    ? VEZA_TEKST[connectionDetail()] || VEZA_TEKST.nepoznato
    : 'Server nije podešen';
  document.querySelectorAll('[data-velicina]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.velicina === document.documentElement.dataset.velicina));
  });
  const tema = document.documentElement.dataset.tema;
  document.querySelectorAll('[data-tema-izbor]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.temaIzbor === tema));
  });
}

async function renderProfile() {
  const p = cachedProfile();
  // Avatar (slika ili logo društva) crta profil-ui.js; inicijali samo dok on još nije nacrtao.
  if (!el('p-avatar').classList.contains('ima-sliku')) el('p-avatar').textContent = initialsOfProfile(p);
  el('p-ime').textContent = p ? `${p.ime} ${p.prezime}${p.nadimak ? ` (${p.nadimak})` : ''}` : 'Niste prijavljeni';
  const ctx = await cachedSekcije().catch(() => ({}));
  el('p-uloge').innerHTML = profileRoles(p, ctx).map((r) => `<span class="p-uloga" data-uloga="${r.kod}">${escapeHtml(r.tekst)}</span>`).join('');
  const n = await queueCount().catch(() => 0);
  el('p-stanje').textContent = `${isServerConfigured() ? VEZA_TEKST[connectionDetail()] || VEZA_TEKST.nepoznato : 'Server nije podešen'} · ${n ? `čeka slanje: ${n}` : 'sve je poslano'}`;
  const warn = el('postavke-odjava-upozorenje');
  warn.hidden = !n;
  warn.textContent = n ? `Imaš ${n} neposlanih zapisa. Odjava ih ne briše, ali se šalju tek kad se opet prijaviš.` : '';
  return n;
}

function renderShare() {
  const s = getShareSettings();
  const b = el('p-dijeli');
  b.setAttribute('aria-pressed', String(s.on));
  b.textContent = s.on ? 'Dijelim lokaciju — dodirni za isključivanje' : 'Lokacija isključena — dodirni za uključivanje';
  el('p-interval').innerHTML = SHARE_INTERVALS.map((i) => `<button type="button" data-interval="${i.id}" aria-pressed="${s.interval === i.id}">${i.naziv}</button>`).join('');
}

function wireShare() {
  el('p-dijeli').addEventListener('click', () => { setShareSettings({ on: !getShareSettings().on }); renderShare(); });
  el('p-interval').addEventListener('click', (e) => {
    const b = e.target.closest('[data-interval]');
    if (b) { setShareSettings({ interval: b.dataset.interval }); renderShare(); }
  });
  document.addEventListener('lokacija:postavke', renderShare);
}

async function renderReadiness() {
  if (!el('sp-veza')) return;
  el('sp-veza').textContent = isServerConfigured() ? VEZA_TEKST[connectionDetail()] || VEZA_TEKST.nepoznato : 'Server nije podešen';
  const n = await queueCount().catch(() => 0);
  el('sp-slanje').textContent = syncText(n, loadJSON('lovac.sync.zadnje', null));
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = await navigator.storage?.persisted?.() ?? null;
    const s = storageSummary(est, persisted);
    el('sp-pohrana').textContent = s.tekst;
    el('sp-pohrana').dataset.stanje = s.upozorenje ? 'upozorenje' : 'ok';
    el('sp-traka').hidden = s.postotak === null;
    if (s.postotak !== null) el('sp-traka-puna').style.width = `${s.postotak}%`;
    const zast = el('sp-pohrana-zastita');
    zast.hidden = s.zasticena === null;
    zast.textContent = s.zasticena ? 'Pohrana je zaštićena od automatskog brisanja.' : 'Sistem može obrisati podatke aplikacije kad ponestane prostora.';
    el('btn-zastiti-pohranu').hidden = s.zasticena !== false;
  } catch (err) {
    console.warn('pohrana', err);
    el('sp-pohrana').textContent = 'Pohrana: nije dostupno na ovom uređaju';
  }
  try {
    el('sp-karta').textContent = `Sačuvano pločica: ${await tileCacheCount()}`;
  } catch { el('sp-karta').textContent = 'Sačuvano pločica: —'; }
  let ukupno = 0;
  for (const s of BACKUP_STORES) ukupno += (await listRecords(s).catch(() => [])).filter((r) => !r.obrisan && !r.tudji).length;
  const b = backupAdvice(loadJSON(BACKUP_KEY, null), ukupno > 0);
  el('sp-kopija').textContent = b.tekst;
  el('sp-kopija').dataset.stanje = b.stanje;
}

// Obavijesti i izuzeće od optimizacije baterije (samo u aplikaciji na telefonu).
function renderReliability() {
  const list = el('pouzdanost-lista');
  if (!list) return;
  const n = globalThis.AndroidNotif;
  const g = globalThis.AndroidGps;
  const hasBridge = Boolean(n?.imaDozvolu || g?.isIgnoringBattery);
  let notif = null;
  let battery = null;
  try { if (n?.imaDozvolu) notif = Boolean(n.imaDozvolu()); } catch (err) { console.warn('obavijesti', err); }
  try { if (g?.isIgnoringBattery) battery = Boolean(g.isIgnoringBattery()); } catch (err) { console.warn('baterija', err); }
  const items = reliabilityItems({ hasBridge, notif, battery });
  list.innerHTML = items.map((i) => `<li class="p-pouzdanost" data-stanje="${i.stanje}" data-id="${i.id}"><b>${escapeHtml(i.naslov)}</b><span class="sitno">${escapeHtml(i.tekst)}</span></li>`).join('');
  el('p-pouzdanost').dataset.stanje = needsAttention(items) ? 'upozorenje' : 'ok';
  el('btn-dozvoli-obavijesti').hidden = !(hasBridge && n?.trazi && notif === false);
  // Postavke obavijesti i baterije su uvijek na dohvat: dugme vodi direktno u sistem, bez obzira na trenutno stanje.
  el('btn-postavke-obavijesti').hidden = !(hasBridge && n?.postavke);
  el('btn-iskljuci-bateriju').hidden = !(hasBridge && (g?.openBatterySettings || g?.requestBatteryExemption));
}

function wireReliability() {
  el('btn-dozvoli-obavijesti').addEventListener('click', () => { try { globalThis.AndroidNotif.trazi(); } catch (err) { console.warn(err); } setTimeout(renderReliability, 1500); });
  el('btn-postavke-obavijesti').addEventListener('click', () => { try { globalThis.AndroidNotif.postavke(); } catch (err) { console.warn(err); } });
  el('btn-iskljuci-bateriju').addEventListener('click', () => {
    try {
      const g = globalThis.AndroidGps;
      // Starija aplikacija nema openBatterySettings: koristi dijalog izuzeća.
      if (g.openBatterySettings) g.openBatterySettings(); else g.requestBatteryExemption();
    } catch (err) { console.warn(err); }
  });
  // Povratak iz sistemskih postavki: ponovo pročitaj stanje.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderReliability(); });
  document.addEventListener('postavke:podaci', renderReliability);
  renderReliability();
}

function wireReadiness() {
  document.addEventListener('postavke:podaci', renderReadiness);
  el('btn-zastiti-pohranu').addEventListener('click', async () => {
    try {
      const ok = await navigator.storage.persist();
      toast(ok ? 'Pohrana je zaštićena' : 'Sistem nije odobrio zaštitu pohrane');
    } catch (err) {
      console.warn('persist', err);
      toast('Zaštita pohrane nije dostupna');
    }
    renderReadiness();
  });
}

function wirePin() {
  el('btn-pin-promijeni').addEventListener('click', async () => {
    const status = el('pin-status');
    status.textContent = 'Mijenjam…';
    try {
      await changePin(el('novi-pin').value);
      el('novi-pin').value = '';
      status.textContent = 'PIN je promijenjen. Od sada se prijavljuješ novim PIN-om.';
    } catch (err) {
      status.textContent = /fetch|network|timeout/i.test(err.message) ? 'Potreban je internet za promjenu PIN-a.' : err.message;
    }
  });
}

function wireBackup(appVer) {
  const status = el('rezerva-status');
  el('btn-rezerva-izvoz').addEventListener('click', async () => {
    const data = {};
    for (const s of BACKUP_STORES) data[s] = await listRecords(s);
    const text = buildBackup(data, cachedProfile(), appVer);
    shareFile(backupFileName(), 'application/json', text);
    saveSoft(BACKUP_KEY, Date.now());
    renderReadiness();
    status.textContent = `Kopija napravljena: ${BACKUP_STORES.map((s) => `${data[s].filter((r) => !r.obrisan && !r.tudji).length} ${s}`).join(', ')}.`;
  });
  el('rezerva-ulaz').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) { status.textContent = parsed.greska; return; }
      const existing = {};
      for (const s of BACKUP_STORES) existing[s] = new Set((await listRecords(s)).map((r) => r.id));
      const { dodaj, preskoceno } = recordsToImport(parsed.podaci, existing);
      for (const { store, rec } of dodaj) await saveRecord(store, rec);
      document.dispatchEvent(new CustomEvent('zapisi:promjena', { detail: { izvor: 'uvoz' } }));
      status.textContent = `Vraćeno zapisa: ${dodaj.length}, preskočeno (već postoje ili neispravni): ${preskoceno}.`;
    } catch (err) {
      status.textContent = `Uvoz nije uspio: ${err.message}`;
    }
  });
}

function wireCacheButton() {
  wireTwoTap(el('btn-kes-obrisi'), 'Dodirni ponovo za brisanje', async () => {
    await clearTileCache();
    await refreshCacheCount();
    toast('Keš karte obrisan — preuzeta područja i Teren ostaju');
  });
}

function wireUpdateButton(appVer) {
  const status = el('postavke-azur-status');
  const install = el('btn-instaliraj-azuriranje');
  el('btn-provjeri-azuriranje').addEventListener('click', async () => {
    status.textContent = 'Provjeravam…';
    install.hidden = true;
    try {
      const ver = await checkForUpdate(appVer);
      status.textContent = ver ? `Nova verzija ${ver}` : 'Imate najnoviju verziju';
      install.hidden = !ver;
    } catch (err) {
      console.warn('provjera verzije', err);
      status.textContent = 'Provjera nije uspjela (nema veze sa serverom). Možeš preuzeti zadnju verziju dugmetom ispod.';
    }
  });
  const startDownload = () => {
    const mode = installUpdate();
    const st = el('azur-preuzimanje');
    if (mode === 'preuzimanje') {
      el('azur-napredak').hidden = false;
      el('azur-napredak').value = 0;
      el('btn-preuzmi-zadnju').disabled = true;
      install.disabled = true;
      installDownloaded.hidden = true;
      st.textContent = 'Preuzimam zadnju verziju… 0 %';
    } else if (mode === 'apk') {
      st.textContent = 'Preuzimanje je pokrenuto (obavijest na telefonu). Kad završi, otvara se instalacija.';
    } else {
      st.textContent = 'Preuzimam APK fajl na uređaj. Otvori ga iz preuzimanja da instaliraš aplikaciju.';
    }
  };
  const doneDownload = () => {
    el('btn-preuzmi-zadnju').disabled = false;
    install.disabled = false;
  };
  // Ako sistemski dijalog instalacije nije izašao (ili je zatvoren), preuzeti APK se instalira bez novog preuzimanja.
  const installDownloaded = el('btn-instaliraj-preuzeto');
  installDownloaded.addEventListener('click', () => globalThis.AndroidUpdate?.instalirajPreuzeto?.());
  // Isti događaji kao u traci "Nova verzija" na mapi (update-stanje.js)
  document.addEventListener(AZUR_EVENT, (e) => {
    const d = e.detail || {};
    if (d.vrsta === 'status') el('azur-preuzimanje').textContent = d.text;
    if (d.vrsta === 'napredak') {
      el('azur-napredak').hidden = false;
      el('azur-napredak').value = d.pct;
      el('azur-preuzimanje').textContent = `Preuzimam zadnju verziju… ${Math.round(d.pct)} %`;
    }
    if (d.vrsta === 'preuzeto') {
      el('azur-napredak').hidden = true;
      el('azur-preuzimanje').textContent = 'Nova verzija je preuzeta na telefon. Potvrdi instalaciju (podaci ostaju).';
      installDownloaded.hidden = !globalThis.AndroidUpdate?.instalirajPreuzeto;
      doneDownload();
    }
    if (d.vrsta === 'greska') {
      el('azur-napredak').hidden = true;
      el('azur-preuzimanje').textContent = d.text;
      doneDownload();
    }
  });
  install.addEventListener('click', startDownload);
  el('btn-preuzmi-zadnju').addEventListener('click', startDownload);
}

export function initPostavke({ setBase, onLogout, appVer }) {
  registerBackHandler(() => {
    if (!isSettingsOpen()) return false;
    closeSettings();
    return true;
  });
  const open = () => {
    refreshStatic(appVer);
    refreshCacheCount();
    el('postavke').hidden = false;
  };
  el('btn-postavke').addEventListener('click', open);
  el('btn-postavke-zatvori').addEventListener('click', closeSettings);
  document.querySelectorAll('[data-tema-izbor]').forEach((b) => {
    b.addEventListener('click', () => { applyTheme(b.dataset.temaIzbor); refreshStatic(appVer); });
  });
  el('postavke-podloge').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-podloga]');
    if (btn) setBase(btn.dataset.podloga);
  });
  // Ako ima neposlanih zapisa, odjava traži drugi dodir (bez confirm(), WebView ga ne prikazuje).
  let armed = false;
  el('btn-postavke-odjava').addEventListener('click', async () => {
    const btn = el('btn-postavke-odjava');
    if (!armed && await queueCount().catch(() => 0) > 0) {
      armed = true;
      btn.textContent = 'Ima neposlanih zapisa — dodirni ponovo za odjavu';
      setTimeout(() => { armed = false; btn.textContent = 'Odjava'; }, 4000);
      return;
    }
    armed = false;
    btn.textContent = 'Odjava';
    closeSettings();
    await onLogout();
  });
  el('p-velicina').addEventListener('click', (e) => {
    const b = e.target.closest('[data-velicina]');
    if (b) { setVelicina(b.dataset.velicina); refreshStatic(appVer); }
  });
  wireShare();
  wirePin();
  wireReadiness();
  wireReliability();
  wireBackup(appVer);
  document.addEventListener('sekcije:promjena', () => { if (isSettingsOpen()) renderProfile(); });
  wireCacheButton();
  document.addEventListener('karte:otvorene', refreshCacheCount);
  wireUpdateButton(appVer);
}
