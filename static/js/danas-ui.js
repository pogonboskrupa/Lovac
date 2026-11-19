// Ekran "Danas": svjetlo, lovno vrijeme sa odbrojavanjem i šta se danas smije loviti.
// Sve se računa offline; propise (lovostaj, lovno vrijeme) daje samo admin spisak.

import { sunTimes, moonAge, moonPhaseName, moonIllumination } from './sunce.js';
import { pickRule, huntingWindow, huntingStatus, formatCountdown, seasonStatus, formatDayMonth } from './propisi.js';
import { getSpisak, getSpisakAll, lookupNaziv } from './spiskovi.js';
import { currentFix } from './gps.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const hm = (ms) => (ms == null ? '—' : `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`);

function categoryLabel(vrste, vrsta, kod) {
  return vrste.find((v) => v.kod === vrsta)?.kategorije?.find((k) => k.kod === kod)?.naziv || kod;
}

export function seasonText(st, vrste, vrsta) {
  if (st.stanje === 'nepoznato') return 'Nije uneseno (pitaj lovočuvara)';
  if (st.stanje === 'lovostaj') return st.od ? `Lovostaj — otvara se ${formatDayMonth(st.od)}` : 'Lovostaj';
  const samo = st.samoZa?.length ? ` (samo: ${st.samoZa.map((k) => categoryLabel(vrste, vrsta, k)).join(', ')})` : '';
  return `Otvoreno do ${formatDayMonth(st.do)}${samo}`;
}

// Upozorenje za opažanje/odstrel; null kad nema razloga za upozorenje.
export async function lovostajWarning(vrsta, kategorija, date = new Date()) {
  const rows = await getSpisakAll('lovostaj');
  const st = seasonStatus(rows, vrsta, kategorija === 'nepoznato' ? null : kategorija, date);
  if (st.stanje !== 'lovostaj') return null;
  return `Vrsta je u lovostaju${st.od ? ` (otvara se ${formatDayMonth(st.od)})` : ''}. Opažanje je u redu, odstrel nije dozvoljen.`;
}

function where(map) {
  const fix = currentFix();
  if (fix) return { lat: fix.lat, lon: fix.lon, opis: 'tvoja GPS pozicija' };
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng, opis: 'sredina karte' };
}

function todaySun(p, now = Date.now()) {
  const d = new Date(now);
  return sunTimes(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), p.lat, p.lon);
}

function statusSentence(st) {
  if (st.stanje === 'prije') return `Lovno vrijeme počinje za ${formatCountdown(st.zaMs)}`;
  if (st.stanje === 'traje') return `Lovno vrijeme završava za ${formatCountdown(st.zaMs)}`;
  return 'Lovno vrijeme je za danas završeno';
}

export function initDanas(map) {
  const panel = $('danas');
  const chip = $('lovno-chip');

  const updateChip = async () => {
    const rule = pickRule(await getSpisakAll('lovno_vrijeme'), null);
    const w = rule && huntingWindow(todaySun(where(map)), rule);
    chip.hidden = !w;
    if (!w) return;
    const st = huntingStatus(Date.now(), w);
    chip.dataset.stanje = st.stanje;
    chip.textContent = statusSentence(st);
  };

  const render = async () => {
    const p = where(map);
    const now = Date.now();
    const sun = todaySun(p, now);
    const age = moonAge(now);
    const d = new Date(now);
    $('danas-mjesto').textContent = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}. · računato za ${p.opis}`;
    $('danas-svjetlo').innerHTML = [
      ['Svitanje (građanski sumrak)', hm(sun.svitanje)], ['Izlazak sunca', hm(sun.izlazak)],
      ['Zalazak sunca', hm(sun.zalazak)], ['Suton (građanski sumrak)', hm(sun.suton)],
      ['Mjesec', `${moonPhaseName(age)}, ${Math.round(moonIllumination(age) * 100)} % osvijetljen`],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');

    const rules = await getSpisakAll('lovno_vrijeme');
    const vrsteAll = await getSpisakAll('vrste');
    const general = pickRule(rules, null);
    const w = general && huntingWindow(sun, general);
    $('danas-lovno').textContent = w
      ? `${hm(w.od)} – ${hm(w.do)} (${general.prije_izlaska_min} min prije izlaska, ${general.poslije_zalaska_min} min poslije zalaska). ${statusSentence(huntingStatus(now, w))}.`
      : 'Pravilo lovnog vremena još nije unio administrator.';
    $('danas-lovno-vrste').innerHTML = rules.filter((r) => r.aktivno !== false && r.vrsta_kod).map((r) => {
      const wv = huntingWindow(sun, r);
      return `<li>${escapeHtml(lookupNaziv(vrsteAll, r.vrsta_kod))}: ${hm(wv?.od)} – ${hm(wv?.do)}</li>`;
    }).join('');

    const lovostaj = await getSpisakAll('lovostaj');
    const order = { otvoreno: 0, lovostaj: 1, nepoznato: 2 };
    const rows = (await getSpisak('vrste'))
      .map((v) => ({ v, st: seasonStatus(lovostaj, v.kod, null, d) }))
      .sort((a, b) => order[a.st.stanje] - order[b.st.stanje] || (a.v.redoslijed ?? 0) - (b.v.redoslijed ?? 0));
    $('danas-lovostaj').innerHTML = rows.map(({ v, st }) => `
      <li class="danas-red" data-id="${escapeHtml(v.kod)}" data-stanje="${st.stanje}">
        <b>${escapeHtml(v.naziv)}</b><span>${escapeHtml(seasonText(st, vrsteAll, v.kod))}</span>
      </li>`).join('');
    const izvori = [...new Set(lovostaj.filter((r) => r.aktivno !== false && r.izvor).map((r) => r.izvor))];
    $('danas-izvor').textContent = izvori.length ? `Izvor: ${izvori.join('; ')}` : '';
  };

  const open = async () => {
    $('meni-spiskovi').hidden = true;
    await render();
    panel.hidden = false;
  };

  $('btn-danas').addEventListener('click', open);
  chip.addEventListener('click', open);
  $('btn-danas-zatvori').addEventListener('click', () => { panel.hidden = true; });
  registerBackHandler(() => {
    if (panel.hidden) return false;
    panel.hidden = true;
    return true;
  });

  // Upozorenje o lovostaju u formi opažanja.
  document.addEventListener('opazanje:vrsta', async (e) => {
    const el = $('op-upozorenje');
    const msg = await lovostajWarning(e.detail.vrsta, e.detail.kategorija);
    el.textContent = msg || '';
    el.hidden = !msg;
  });

  document.addEventListener('spiskovi:promjena', () => { updateChip(); if (!panel.hidden) render(); });
  updateChip();
  setInterval(updateChip, 30000);
}
