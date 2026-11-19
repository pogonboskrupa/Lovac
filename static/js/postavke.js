// Ekran Postavke: izgled, podloga, keš karte, nalog, verzija i ažuriranje.

import { applyTheme, toast } from './ui.js';
import { tileCacheCount, clearTileCache } from './tiles.js';
import { cachedProfile } from './auth.js';
import { isServerConfigured } from './config.js';
import { connectionQuality } from './net.js';
import { checkForUpdate, installUpdate } from './update.js';

const VEZA_TEKST = {
  nema: 'Bez veze',
  slaba: 'Slaba veza',
  dobra: 'Veza je dobra',
  nepoznato: 'Još nije provjereno',
};
const POTVRDA_MS = 4000;

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

// Dugme Nazad na telefonu: prvo zatvara otvoreno, tek onda dozvoljava izlaz iz aplikacije.
export function handleBack() {
  if (isSettingsOpen()) { closeSettings(); return true; }
  const menu = el('meni-podloga');
  if (menu && !menu.hidden) { menu.hidden = true; return true; }
  return false;
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
  el('postavke-server').textContent = isServerConfigured()
    ? VEZA_TEKST[connectionQuality()] || VEZA_TEKST.nepoznato
    : 'Server nije podešen';
  const tema = document.documentElement.dataset.tema;
  document.querySelectorAll('[data-tema-izbor]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.temaIzbor === tema));
  });
}

function wireCacheButton() {
  const btn = el('btn-kes-obrisi');
  const normal = btn.textContent;
  let timer = null;
  const reset = () => { btn.textContent = normal; delete btn.dataset.potvrda; clearTimeout(timer); };
  btn.addEventListener('click', async () => {
    // WebView ne prikazuje confirm() dijalog, pa potvrda ide drugim dodirom.
    if (!btn.dataset.potvrda) {
      btn.dataset.potvrda = '1';
      btn.textContent = 'Dodirni ponovo za brisanje';
      timer = setTimeout(reset, POTVRDA_MS);
      return;
    }
    reset();
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
      status.textContent = 'Nema veze sa serverom';
    }
  });
  install.addEventListener('click', () => installUpdate());
}

export function initPostavke({ setBase, onLogout, appVer }) {
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
  el('btn-postavke-odjava').addEventListener('click', async () => {
    closeSettings();
    await onLogout();
  });
  wireCacheButton();
  wireUpdateButton(appVer);
}
