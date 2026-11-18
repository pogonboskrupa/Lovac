// Zajednički UI pomoćnici: ekrani, poruke, kopiranje, tema.

import { loadJSON, saveSoft } from './storage.js';

const THEME_KEY = 'lovac.tema';
const SCREENS = ['prijava', 'cekanje', 'mapa'];

export function showScreen(name) {
  SCREENS.forEach((s) => {
    const el = document.getElementById(`ekran-${s}`);
    if (el) el.hidden = s !== name;
  });
  document.body.dataset.ekran = name;
}

let toastTimer = null;
export function toast(msg, ms = 3000) {
  const el = document.getElementById('poruka');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// Glasna greška (ne nestaje sama): za neuspjele kritične upise.
export function alarm(msg) {
  const el = document.getElementById('alarm');
  if (!el) { console.error(msg); return; }
  el.querySelector('.alarm-tekst').textContent = msg;
  el.hidden = false;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* WebView često odbije clipboard API, ide rezerva ispod */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function applyTheme(theme) {
  const t = theme === 'dan' ? 'dan' : 'noc';
  document.documentElement.dataset.tema = t;
  saveSoft(THEME_KEY, t);
}

export function initTheme() {
  applyTheme(loadJSON(THEME_KEY, 'noc'));
  document.getElementById('btn-tema')?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.tema === 'dan' ? 'noc' : 'dan');
  });
}
