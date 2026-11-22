// Ekran "Divljač": kartice vrsta (rastvaraju se), pretraga, i stanje lovostaja iz spiska koji unosi administrator.

import { VRSTE_DIVLJACI, DIVLJAC_NAPOMENA, filterSpecies } from './divljac.js';
import { getSpisakAll } from './spiskovi.js';
import { seasonStatus } from './propisi.js';
import { seasonText } from './danas-ui.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);

const cardHtml = (v) => `
  <li class="tr-kartica div-kartica" data-id="${escapeHtml(v.kod)}">
    <details>
      <summary>
        <span class="tr-chip">${escapeHtml(v.grupa)}</span>
        <b class="div-naziv">${escapeHtml(v.naziv)}</b>
        <span class="sitno div-latinski">${escapeHtml(v.latinski)}</span>
        <span class="div-kratko">${escapeHtml(v.kratko)}</span>
      </summary>
      <dl class="tabela-info div-brojke">${v.brojke.map(([k, t]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(t)}</dd>`).join('')}</dl>
      <p class="div-sezona" data-sezona="${escapeHtml(v.kod)}"></p>
      ${v.sekcije.map(([naslov, tacke]) => `<h4>${escapeHtml(naslov)}</h4><ul class="div-tacke">${tacke.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`).join('')}
    </details>
  </li>`;

export function initDivljac() {
  const panel = $('divljac');
  $('divljac-napomena').textContent = DIVLJAC_NAPOMENA;

  // Lovostaj nikad nije zakucan u kod: čita se iz spiska koji unosi administrator (ili "Nije uneseno").
  const fillSeasons = async () => {
    try {
      const [lovostaj, vrste] = await Promise.all([getSpisakAll('lovostaj'), getSpisakAll('vrste')]);
      panel.querySelectorAll('[data-sezona]').forEach((el) => {
        const st = seasonStatus(lovostaj, el.dataset.sezona, null, new Date());
        el.dataset.stanje = st.stanje;
        el.textContent = `Lovostaj (iz spiska društva): ${seasonText(st, vrste, el.dataset.sezona)}`;
      });
    } catch (err) {
      console.warn('divljač lovostaj', err);
    }
  };

  const render = () => {
    const list = filterSpecies($('divljac-trazi').value);
    $('divljac-spisak').innerHTML = list.map(cardHtml).join('');
    $('divljac-prazno').hidden = list.length > 0;
    fillSeasons();
  };

  const open = () => {
    $('meni-spiskovi').hidden = true;
    render();
    panel.hidden = false;
  };
  const close = () => { panel.hidden = true; };

  $('btn-divljac').addEventListener('click', open);
  $('btn-divljac-zatvori').addEventListener('click', close);
  $('divljac-trazi').addEventListener('input', render);
  document.addEventListener('spiskovi:promjena', () => { if (!panel.hidden) fillSeasons(); });
  registerBackHandler(() => { if (panel.hidden) return false; close(); return true; });
  return { count: VRSTE_DIVLJACI.length };
}
