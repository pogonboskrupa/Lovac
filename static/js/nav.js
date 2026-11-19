// Donja navigacija (Mapa / Karte / Meni / Postavke). Ekrani se otvaraju iznad mape, a navigacija
// ostaje vidljiva; dodir na tab prvo zatvara sve otvoreno (kroz registrovane "nazad" funkcije,
// pa se forme čiste kao pri dugmetu Nazad), a tek onda otvara traženo.

import { handleBack, registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);

export function closeAllScreens() {
  for (let i = 0; i < 20; i++) if (!handleBack()) break;
}

function visible(id) {
  const el = $(id);
  return Boolean(el && !el.hidden);
}

export function activeTab() {
  if (visible('postavke')) return 'postavke';
  if (visible('karte')) return 'karte';
  if (visible('meni-spiskovi') || [...document.querySelectorAll('.list-preko')]
    .some((s) => !s.hidden && s.id !== 'postavke' && s.id !== 'karte')) return 'meni';
  return 'mapa';
}

const TAB_BUTTON = { mapa: 'nav-mapa', karte: 'btn-karte', meni: 'btn-spiskovi', postavke: 'btn-postavke' };

function markActive() {
  const tab = activeTab();
  for (const [name, id] of Object.entries(TAB_BUTTON)) {
    const b = $(id);
    if (name === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
}

export function initNav() {
  const nav = document.querySelector('.donja-nav');
  const karte = $('karte');

  registerBackHandler(() => {
    if (karte.hidden) return false;
    karte.hidden = true;
    return true;
  });

  // Capture: zatvaranje ide PRIJE rukovaoca samog dugmeta (Postavke otvara svoj ekran).
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const menu = $('meni-spiskovi');
    const menuWasOpen = !menu.hidden;
    closeAllScreens();
    if (btn.id === 'btn-spiskovi' && !menuWasOpen) menu.hidden = false;
    if (btn.id === 'btn-karte') {
      karte.hidden = false;
      document.dispatchEvent(new CustomEvent('karte:otvorene'));
    }
  }, true);

  // Ista funkcija kao u Meniju.
  $('btn-slojevi-karte').addEventListener('click', () => {
    karte.hidden = true;
    $('btn-slojevi').click();
  });

  new MutationObserver(markActive).observe(document.getElementById('ekran-mapa').parentElement, {
    subtree: true, attributes: true, attributeFilter: ['hidden'],
  });
  markActive();
}
