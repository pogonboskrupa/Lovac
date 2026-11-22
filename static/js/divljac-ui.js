// Ekran "Divljač": kartice vrsta (rastvaraju se), pretraga, i stanje lovostaja iz spiska koji unosi administrator.

import { VRSTE_DIVLJACI, DIVLJAC_NAPOMENA, MJESECI, filterSpecies, calendarRows, activityRows } from './divljac.js';
import { getSpisakAll } from './spiskovi.js';
import { seasonStatus } from './propisi.js';
import { seasonText } from './danas-ui.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);

const calendarHtml = (v) => {
  const rows = calendarRows(v);
  if (!rows.length) return '';
  return `<h4>Biološki kalendar <span class="sitno">(nije lovostaj)</span></h4>
    <div class="div-kal" role="table" aria-label="Biološki kalendar">
      <div class="div-kal-red div-kal-glava" role="row"><span></span>${MJESECI.map((m) => `<span>${m}</span>`).join('')}</div>
      ${rows.map((r) => `<div class="div-kal-red" role="row" data-dogadjaj="${escapeHtml(r.kod)}"><span class="div-kal-naziv">${escapeHtml(r.naziv)}</span>${r.mjeseci.map((on) => `<span class="div-kal-celija${on ? ' on' : ''}" data-kod="${escapeHtml(r.kod)}"></span>`).join('')}</div>`).join('')}
    </div>`;
};

const activityHtml = (v) => {
  const rows = activityRows(v);
  if (!rows.length) return '';
  return `<h4>Aktivnost tokom dana <span class="sitno">(orijentaciono)</span></h4>
    <div class="div-akt" role="list">${rows.map((r) => `<div class="div-akt-stup" role="listitem" data-doba="${r.kod}" data-nivo="${r.nivo}">
        <span class="div-akt-bar"><i style="height:${Math.round((r.nivo / 3) * 100)}%"></i></span><span class="sitno">${escapeHtml(r.naziv)}</span></div>`).join('')}</div>`;
};

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
      ${calendarHtml(v)}
      ${activityHtml(v)}
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
