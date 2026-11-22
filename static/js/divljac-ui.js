// Ekran "Divljač": mreža vrsta sa emblemom, filter grupe, pregled "ovaj mjesec u prirodi" i detalj vrste sa tabovima.
// Lovostaj nikad nije zakucan: čita se iz spiska koji unosi administrator (ili "Nije uneseno").

import {
  VRSTE_DIVLJACI, DIVLJAC_NAPOMENA, MJESECI, GRUPE, DETALJ_TABOVI, filterSpecies, filterByGroup, sectionsOfTab, bestTimes, monthEvents,
  calendarRows, activityRows,
} from './divljac.js';
import { getSpisakAll } from './spiskovi.js';
import { seasonStatus } from './propisi.js';
import { seasonText } from './danas-ui.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const MJESECI_NAZIV = ['januaru', 'februaru', 'martu', 'aprilu', 'maju', 'junu', 'julu', 'augustu', 'septembru', 'oktobru', 'novembru', 'decembru'];

const emblem = (v, velik = false) => `<span class="div-emblem${velik ? ' velik' : ''}" style="background:${escapeHtml(v.boja)}" aria-hidden="true">${escapeHtml(v.znak)}</span>`;

const tileHtml = (v) => `
  <li class="div-plocica div-kartica" data-id="${escapeHtml(v.kod)}">
    <button type="button" class="div-plocica-dugme" data-otvori="${escapeHtml(v.kod)}">
      ${emblem(v)}
      <b class="div-naziv">${escapeHtml(v.naziv)}</b>
      <span class="sitno div-latinski">${escapeHtml(v.latinski)}</span>
      <span class="div-cinjenice"><span>${escapeHtml(v.brojke[0]?.[1] || '')}</span><span>Aktivan: ${escapeHtml(bestTimes(v))}</span></span>
    </button>
  </li>`;

const calendarHtml = (v, month) => {
  const rows = calendarRows(v);
  if (!rows.length) return '';
  return `<h4>Biološki kalendar <span class="sitno">(nije lovostaj)</span></h4>
    <div class="div-kal" role="table" aria-label="Biološki kalendar">
      <div class="div-kal-red div-kal-glava" role="row"><span></span>${MJESECI.map((m, i) => `<span${i + 1 === month ? ' class="ovaj"' : ''}>${m}</span>`).join('')}</div>
      ${rows.map((r) => `<div class="div-kal-red" role="row" data-dogadjaj="${escapeHtml(r.kod)}"><span class="div-kal-naziv">${escapeHtml(r.naziv)}</span>${r.mjeseci.map((on, i) => `<span class="div-kal-celija${on ? ' on' : ''}${i + 1 === month ? ' ovaj' : ''}" data-kod="${escapeHtml(r.kod)}"></span>`).join('')}</div>`).join('')}
    </div>`;
};

const activityHtml = (v) => {
  const rows = activityRows(v);
  if (!rows.length) return '';
  return `<h4>Aktivnost tokom dana <span class="sitno">(orijentaciono)</span></h4>
    <div class="div-akt" role="list">${rows.map((r) => `<div class="div-akt-stup" role="listitem" data-doba="${r.kod}" data-nivo="${r.nivo}">
        <span class="div-akt-bar"><i style="height:${Math.round((r.nivo / 3) * 100)}%"></i></span><span class="sitno">${escapeHtml(r.naziv)}</span></div>`).join('')}</div>`;
};

const sectionsHtml = (v, tab) => sectionsOfTab(v, tab).map(([naslov, tacke]) => `<h4>${escapeHtml(naslov)}</h4><ul class="div-tacke">${tacke.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`).join('');

export function initDivljac() {
  const panel = $('divljac');
  let group = 'sve';
  let current = null;
  let tab = 'pregled';
  let seasons = { lovostaj: [], vrste: [] };
  $('divljac-napomena').textContent = DIVLJAC_NAPOMENA;

  const month = () => new Date().getMonth() + 1;

  // Lovostaj nikad nije zakucan u kod: čita se iz spiska koji unosi administrator (ili "Nije uneseno").
  const loadSeasons = async () => {
    try {
      const [lovostaj, vrste] = await Promise.all([getSpisakAll('lovostaj'), getSpisakAll('vrste')]);
      seasons = { lovostaj, vrste };
    } catch (err) {
      console.warn('divljač lovostaj', err);
    }
    fillSeason();
  };
  const fillSeason = () => {
    const el = $('divljac-detalj-sezona');
    if (!current) { el.textContent = ''; return; }
    const st = seasonStatus(seasons.lovostaj, current.kod, null, new Date());
    el.dataset.stanje = st.stanje;
    el.textContent = `Lovostaj (iz spiska društva): ${seasonText(st, seasons.vrste, current.kod)}`;
  };

  const renderMonth = () => {
    const ev = monthEvents(month());
    $('divljac-mjesec-naslov').textContent = `U ${MJESECI_NAZIV[month() - 1]} u prirodi`;
    $('divljac-mjesec-lista').innerHTML = ev.map((e) => {
      const v = VRSTE_DIVLJACI.find((x) => x.kod === e.vrsta);
      return `<li data-vrsta="${escapeHtml(e.vrsta)}" data-dogadjaj="${escapeHtml(e.kod)}"><button type="button" data-otvori="${escapeHtml(e.vrsta)}">${emblem(v)}<span><b>${escapeHtml(e.nazivVrste)}</b><span class="sitno">${escapeHtml(e.dogadjaj)}</span></span></button></li>`;
    }).join('') || '<li class="sitno">Nema posebnih događaja u ovom mjesecu.</li>';
  };

  const renderList = () => {
    $('divljac-grupe').innerHTML = GRUPE.map(([k, n]) => `<button type="button" data-grupa="${k}" aria-pressed="${k === group}">${n}</button>`).join('');
    const list = filterByGroup(filterSpecies($('divljac-trazi').value), group);
    $('divljac-spisak').innerHTML = list.map(tileHtml).join('');
    $('divljac-prazno').hidden = list.length > 0;
  };

  const renderDetail = () => {
    const v = current;
    $('divljac-detalj-glava').innerHTML = `${emblem(v, true)}<div><h3>${escapeHtml(v.naziv)}</h3><span class="sitno">${escapeHtml(v.latinski)}</span><span class="tr-chip">${escapeHtml(v.grupa)}</span></div>`;
    $('divljac-tabovi').innerHTML = DETALJ_TABOVI.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}" aria-pressed="${k === tab}">${n}</button>`).join('');
    let html = '';
    if (tab === 'pregled') {
      html += `<p class="div-kratko">${escapeHtml(v.kratko)}</p>
        <dl class="tabela-info div-brojke">${v.brojke.map(([k, t]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(t)}</dd>`).join('')}</dl>`;
      html += calendarHtml(v, month()) + activityHtml(v);
    }
    html += sectionsHtml(v, tab);
    $('divljac-detalj-sadrzaj').innerHTML = html;
    fillSeason();
  };

  const openSpecies = (kod, startTab = 'pregled') => {
    current = VRSTE_DIVLJACI.find((v) => v.kod === kod) || null;
    if (!current) return;
    tab = startTab;
    $('divljac-lista').hidden = true;
    $('divljac-detalj').hidden = false;
    renderDetail();
    panel.scrollTop = 0;
  };
  const backToList = () => { current = null; $('divljac-detalj').hidden = true; $('divljac-lista').hidden = false; };

  const open = () => {
    $('meni-spiskovi').hidden = true;
    backToList();
    renderMonth();
    renderList();
    panel.hidden = false;
    loadSeasons();
  };
  const close = () => { panel.hidden = true; backToList(); };

  $('btn-divljac').addEventListener('click', open);
  $('btn-divljac-zatvori').addEventListener('click', close);
  $('btn-divljac-nazad').addEventListener('click', backToList);
  $('divljac-trazi').addEventListener('input', renderList);
  $('divljac-grupe').addEventListener('click', (e) => {
    const b = e.target.closest('[data-grupa]');
    if (b) { group = b.dataset.grupa; renderList(); }
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-otvori]');
    if (b) openSpecies(b.dataset.otvori);
  });
  $('divljac-tabovi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; renderDetail(); }
  });
  document.addEventListener('spiskovi:promjena', () => { if (!panel.hidden) loadSeasons(); });
  registerBackHandler(() => {
    if (panel.hidden) return false;
    if (current) { backToList(); return true; }
    close();
    return true;
  });
  return { count: VRSTE_DIVLJACI.length };
}
