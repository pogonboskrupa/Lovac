// Ekran Postavke: izgled, podloga, keš karte, nalog, verzija i ažuriranje.

import { applyTheme, toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import { tileCacheCount, clearTileCache } from './tiles.js';
import { cachedProfile } from './auth.js';
import { isServerConfigured } from './config.js';
import { connectionQuality } from './net.js';
import { checkForUpdate, installUpdate } from './update.js';
import { refreshAdminVisibility } from './admin.js';
import { cachedSekcije } from './sekcije-ui.js';
import { queueCount } from './sync.js';
import { initialsOfProfile, profileRoles } from './profil.js';
import { getShareSettings, setShareSettings } from './lokacija-ui.js';
import { SHARE_INTERVALS } from './lokacija.js';
import { listRecords, saveRecord } from './zapisi.js';
import { shareFile } from './dijeljenje.js';
import { buildBackup, parseBackup, recordsToImport, backupFileName, BACKUP_STORES } from './rezerva.js';

const VEZA_TEKST = {
  nema: 'Bez veze',
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
    ? VEZA_TEKST[connectionQuality()] || VEZA_TEKST.nepoznato
    : 'Server nije podešen';
  const tema = document.documentElement.dataset.tema;
  document.querySelectorAll('[data-tema-izbor]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.temaIzbor === tema));
  });
}

async function renderProfile() {
  const p = cachedProfile();
  el('p-avatar').textContent = initialsOfProfile(p);
  el('p-ime').textContent = p ? `${p.ime} ${p.prezime}${p.nadimak ? ` (${p.nadimak})` : ''}` : 'Niste prijavljeni';
  const ctx = await cachedSekcije().catch(() => ({}));
  el('p-uloge').innerHTML = profileRoles(p, ctx).map((r) => `<span class="p-uloga" data-uloga="${r.kod}">${escapeHtml(r.tekst)}</span>`).join('');
  const n = await queueCount().catch(() => 0);
  el('p-stanje').textContent = `${isServerConfigured() ? VEZA_TEKST[connectionQuality()] || VEZA_TEKST.nepoznato : 'Server nije podešen'} · ${n ? `čeka slanje: ${n}` : 'sve je poslano'}`;
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

function wireBackup(appVer) {
  const status = el('rezerva-status');
  el('btn-rezerva-izvoz').addEventListener('click', async () => {
    const data = {};
    for (const s of BACKUP_STORES) data[s] = await listRecords(s);
    const text = buildBackup(data, cachedProfile(), appVer);
    shareFile(backupFileName(), 'application/json', text);
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
    toast('Keš karte obrisan');
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
  install.addEventListener('click', () => installUpdate());
  el('btn-preuzmi-zadnju').addEventListener('click', () => installUpdate());
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
  wireShare();
  wireBackup(appVer);
  document.addEventListener('sekcije:promjena', () => { if (isSettingsOpen()) renderProfile(); });
  wireCacheButton();
  document.addEventListener('karte:otvorene', refreshCacheCount);
  wireUpdateButton(appVer);
}
