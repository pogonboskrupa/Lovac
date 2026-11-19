// Ekran Postavke: izgled, podloga, keš karte, nalog, verzija i ažuriranje.

import { applyTheme, toast, registerBackHandler, wireTwoTap } from './ui.js';
import { tileCacheCount, clearTileCache } from './tiles.js';
import { cachedProfile } from './auth.js';
import { isServerConfigured } from './config.js';
import { connectionQuality } from './net.js';
import { checkForUpdate, installUpdate } from './update.js';
import { refreshAdminVisibility } from './admin.js';

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
  el('postavke-server').textContent = isServerConfigured()
    ? VEZA_TEKST[connectionQuality()] || VEZA_TEKST.nepoznato
    : 'Server nije podešen';
  const tema = document.documentElement.dataset.tema;
  document.querySelectorAll('[data-tema-izbor]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.temaIzbor === tema));
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
  el('btn-postavke-odjava').addEventListener('click', async () => {
    closeSettings();
    await onLogout();
  });
  wireCacheButton();
  wireUpdateButton(appVer);
}
