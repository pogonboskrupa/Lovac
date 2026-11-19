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

// Dugme Nazad na telefonu (MainActivity pita window.__nazad()): zadnje otvoreno se zatvara prvo,
// a tek kad ništa nije otvoreno, Android izlazi iz aplikacije.
const backHandlers = [];

export function registerBackHandler(fn) {
  backHandlers.push(fn);
}

export function handleBack() {
  for (let i = backHandlers.length - 1; i >= 0; i--) {
    try {
      if (backHandlers[i]()) return true;
    } catch (err) {
      console.error('nazad', err);
    }
  }
  const menu = document.getElementById('meni-podloga');
  if (menu && !menu.hidden) { menu.hidden = true; return true; }
  return false;
}

// Potvrda opasne radnje drugim dodirom (WebView ne prikazuje confirm()).
export function wireTwoTap(btn, confirmLabel, action, ms = 4000) {
  const normal = btn.textContent;
  let timer = null;
  const reset = () => { btn.textContent = normal; delete btn.dataset.potvrda; clearTimeout(timer); };
  btn.addEventListener('click', async (e) => {
    if (!btn.dataset.potvrda) {
      btn.dataset.potvrda = '1';
      btn.textContent = confirmLabel;
      timer = setTimeout(reset, ms);
      return;
    }
    reset();
    await action(e);
  });
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
