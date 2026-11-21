// Ekran "Pregled stana": krupne vrijednosti pravca, sigurnosti, udaljenosti, vjetra i svjetla za stan u lovu.

import { currentFix, currentHeading, onGpsUpdate } from './gps.js';
import { sectorsForStand } from './lov.js';
import { standBrief } from './stan.js';
import { windFor } from './vjetar-ui.js';
import { ageText } from './vjetar.js';
import { sunTimes, daylightStatus } from './sunce.js';
import { startNavigation } from './navigacija.js';
import { registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);
const SIGURNOST = {
  zabranjeno: ['NE PUCAJ U OVOM PRAVCU', 'zabranjeno'],
  dozvoljeno: ['Pravac nije u zabranjenom sektoru', 'dozvoljeno'],
  nepoznato: ['Kompas nije dostupan — gledaj sektore na karti', 'nepoznato'],
};

export function initStan() {
  const screen = $('stan-ekran');
  let ctx = null; // { data, stand }
  let windState = { wind: null, fc: null };
  let windAt = 0;

  const render = () => {
    if (screen.hidden || !ctx) return;
    const { data, stand } = ctx;
    const brief = standBrief({
      heading: currentHeading(), arcs: sectorsForStand(stand, data).lukovi, fix: currentFix(), stand, wind: windState.wind,
    });
    $('stan-naslov-broj').textContent = `Stan ${stand.broj}`;
    const [text, state] = SIGURNOST[brief.sigurnost];
    $('stan-sigurnost').textContent = text;
    $('stan-sigurnost').dataset.stanje = state;
    $('stan-pravac').textContent = brief.pravac ? `${brief.pravac.stepeni}° ${brief.pravac.strana}` : '—';
    $('stan-udaljenost').textContent = brief.stan ? (brief.stan.nasStanu ? 'Na stanu' : `${brief.stan.tekst} ${brief.stan.strana}`) : 'Čekam GPS…';
    $('stan-vjetar').textContent = brief.vjetar
      ? `iz ${brief.vjetar.odakle} (${brief.vjetar.stepeni}°), ${brief.vjetar.brzina.toFixed(1).replace('.', ',')} m/s · miris ide ka ${brief.vjetar.mirisKa}`
      : 'Nema prognoze vjetra (potreban je internet bar jednom)';
    $('stan-vjetar-starost').textContent = windState.fc ? ageText(windState.fc.preuzeto) : '';
    const now = Date.now();
    const noon = (off) => new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + off, 12).getTime();
    $('stan-svjetlo').textContent = daylightStatus(now, sunTimes(noon(0), stand.lat, stand.lon), sunTimes(noon(1), stand.lat, stand.lon)).tekst;
  };

  const loadWind = async () => {
    if (!ctx || Date.now() - windAt < 60000) return;
    windAt = Date.now();
    try { windState = await windFor(ctx.stand.lat, ctx.stand.lon); } catch (err) { console.warn('vjetar stan', err.message); }
    render();
  };

  document.addEventListener('stan:otvori', (e) => {
    ctx = e.detail;
    windAt = 0;
    screen.hidden = false;
    render();
    loadWind();
  });
  const close = () => { screen.hidden = true; };
  $('btn-stan-zatvori').addEventListener('click', close);
  $('btn-stan-vodi').addEventListener('click', () => {
    if (!ctx) return;
    close();
    startNavigation({ lat: ctx.stand.lat, lon: ctx.stand.lon, naziv: `Stan ${ctx.stand.broj}` });
  });
  registerBackHandler(() => { if (screen.hidden) return false; close(); return true; });
  onGpsUpdate(render);
  setInterval(render, 5000);
}
