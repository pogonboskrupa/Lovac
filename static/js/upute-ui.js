// Ekran "Upute za korištenje" (Postavke → Nalog → O aplikaciji).

import { UPUTE, UPUTE_NAPOMENA, filterUpute, matchingItems } from './upute.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);

export function initUpute() {
  const screen = $('upute');
  if (!screen) return;
  const draw = (query = '') => {
    const list = filterUpute(UPUTE, query);
    $('upute-prazno').hidden = list.length > 0;
    $('upute-sadrzaj').innerHTML = list.map((s) => `
      <details class="upute-sekcija" data-id="${escapeHtml(s.id)}"${query.trim() ? ' open' : ''}>
        <summary>${escapeHtml(s.naslov)}</summary>
        <p class="sitno">${escapeHtml(s.uvod)}</p>
        <dl class="upute-stavke">${matchingItems(s, query).map(([n, t]) => `<dt>${escapeHtml(n)}</dt><dd>${escapeHtml(t)}</dd>`).join('')}</dl>
      </details>`).join('');
  };
  const open = () => {
    $('upute-napomena').textContent = UPUTE_NAPOMENA;
    $('upute-pretraga').value = '';
    draw();
    screen.hidden = false;
    screen.scrollTop = 0;
  };
  $('btn-upute')?.addEventListener('click', open);
  $('btn-upute-zatvori').addEventListener('click', () => { screen.hidden = true; });
  $('upute-pretraga').addEventListener('input', (e) => draw(e.target.value));
  registerBackHandler(() => {
    if (screen.hidden) return false;
    screen.hidden = true;
    return true;
  });
}
