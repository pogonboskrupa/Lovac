// Meni: dinamičke informacije na pločicama (stanje lova, broj zapisa, svjetlo) — bez mreže, iz lokalnih podataka.

import { listRecords } from './zapisi.js';
import { needsRepair } from './objekti.js';
import { currentFix } from './gps.js';
import { loadJSON } from './storage.js';
import { sunTimes, daylightStatus } from './sunce.js';

const $ = (id) => document.getElementById(id);

// Čista funkcija: tekstovi pločica iz brojeva (test ne dira DOM).
export function menuTexts({ lov, odstrelGodina, opazanja30, objekti, popravka, tragovi, svjetlo }) {
  return {
    'btn-lovovi': lov ? `U TOKU: ${lov}` : 'Raspored, stanovi, sektori',
    'btn-odstrel-spisak': odstrelGodina ? `${odstrelGodina} ove godine · statistika` : 'Evidencija i statistika',
    'btn-opazanja': opazanja30 ? `${opazanja30} u zadnjih 30 dana` : 'Divljač na terenu',
    'btn-objekti': objekti ? `${objekti} ukupno${popravka ? ` · ${popravka} za popravku` : ''}` : 'Čeke, hranilišta, solila',
    'btn-tragovi': tragovi ? `${tragovi} snimljenih` : 'Snimljene ture',
    'btn-danas': svjetlo || 'Lovno vrijeme i lovostaj',
  };
}

const noon = (off = 0) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + off, 12).getTime(); };

async function gather(activeHunt) {
  const now = Date.now();
  const [odstrel, opazanja, objekti, tragovi] = await Promise.all(['odstrel', 'opazanja', 'objekti', 'tragovi'].map((s) => listRecords(s).catch(() => [])));
  const year = new Date().getFullYear();
  const p = currentFix() || (({ lat, lon }) => ({ lat, lon }))(loadJSON('lovac.pogled', { lat: 44.88, lon: 16.15 }));
  return {
    lov: activeHunt?.lov?.status === 'u_toku' ? activeHunt.lov.naziv : null,
    odstrelGodina: odstrel.filter((o) => new Date(o.vrijeme).getFullYear() === year).length,
    opazanja30: opazanja.filter((o) => o.vrijeme >= now - 30 * 86400000).length,
    objekti: objekti.length,
    popravka: objekti.filter(needsRepair).length,
    tragovi: tragovi.length,
    svjetlo: daylightStatus(now, sunTimes(noon(), p.lat, p.lon), sunTimes(noon(1), p.lat, p.lon)).tekst,
  };
}

export function initMeni() {
  let activeHunt = null;
  document.addEventListener('lov:aktivan', (e) => { activeHunt = e.detail.lov; });
  const refresh = async () => {
    try {
      const texts = menuTexts(await gather(activeHunt));
      for (const [id, text] of Object.entries(texts)) { const el = $(`${id}-opis`); if (el) el.textContent = text; }
      $('btn-lovovi').dataset.aktivan = String(Boolean(activeHunt));
    } catch (err) {
      console.warn('meni', err.message);
    }
  };
  $('btn-spiskovi').addEventListener('click', refresh);
  refresh();
}
