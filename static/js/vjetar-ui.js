// Vjetar za čeku (Open-Meteo, keš uz vidljivu starost), konus mirisa i termika; N.V. u traci koordinata.

import { fetchWithTimeout, connectionQuality } from './net.js';
import { loadJSON, saveSoft, removeKey } from './storage.js';
import { parseForecast, currentWind, ageText, formatWind, suitsStand, scentCone, thermalHint } from './vjetar.js';
import { terrainAt } from './dem.js';
import { sunTimes } from './sunce.js';

const KEY_PREFIX = 'lovac.vjetar.';
const REFRESH_MS = 60 * 60000;
const MAX_LOCATIONS = 10;
const $ = (id) => document.getElementById(id);

const cellKey = (lat, lon) => `${KEY_PREFIX}${(Math.round(lat * 20) / 20).toFixed(2)}_${(Math.round(lon * 20) / 20).toFixed(2)}`;

function pruneCache(keep) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(KEY_PREFIX) && k !== keep);
    const old = keys.map((k) => [k, loadJSON(k, {})?.preuzeto || 0]).sort((a, b) => a[1] - b[1]);
    while (old.length >= MAX_LOCATIONS) removeKey(old.shift()[0]);
  } catch (err) {
    console.warn('vjetar keš', err);
  }
}

export async function windFor(lat, lon, { allowNetwork = connectionQuality() !== 'nema' } = {}) {
  const key = cellKey(lat, lon);
  let fc = loadJSON(key, null);
  let error = null;
  if (allowNetwork && (!fc || Date.now() - fc.preuzeto > REFRESH_MS || !currentWind(fc))) {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast'
        + `?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
        + '&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=ms&timeformat=unixtime&forecast_days=3';
      const res = await fetchWithTimeout(url, {}, 10000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fc = parseForecast(await res.json());
      pruneCache(key);
      saveSoft(key, fc);
    } catch (err) {
      error = err.message;
    }
  }
  return { fc, wind: fc ? currentWind(fc) : null, error };
}

export function initVjetar(L, map) {
  let cone = null;
  let target = null;

  const hideCone = () => {
    if (cone) map.removeLayer(cone);
    cone = null;
    $('btn-od-konus').setAttribute('aria-pressed', 'false');
  };

  $('btn-od-konus').addEventListener('click', () => {
    if (cone) { hideCone(); return; }
    if (!target?.wind) return;
    cone = L.polygon(scentCone(target.o, target.wind.smjer, 400, 20), {
      interactive: false, color: '#d9a441', weight: 2, fillColor: '#d9a441', fillOpacity: 0.25, className: 'konus',
    }).addTo(map);
    $('btn-od-konus').setAttribute('aria-pressed', 'true');
  });

  // N.V. sredine karte iz DEM-a; offline samo iz keša.
  let nvTimer = null;
  const updateElevation = () => {
    clearTimeout(nvTimer);
    nvTimer = setTimeout(async () => {
      const c = map.getCenter();
      try {
        const t = await terrainAt(c.lat, c.lng, { allowNetwork: connectionQuality() !== 'nema' });
        $('koord-nv').textContent = t ? `${Math.round(t.visina)} m` : '—';
      } catch {
        $('koord-nv').textContent = '—';
      }
    }, 400);
  };
  map.on('moveend', updateElevation);
  updateElevation();

  return {
    hide() { hideCone(); target = null; },
    // Popunjava blok "Vjetar" u detaljima čeke.
    async show(o) {
      hideCone();
      const box = $('od-vjetar');
      box.hidden = false;
      const txt = $('od-vjetar-tekst');
      const st = $('od-vjetar-stanje');
      txt.textContent = 'Učitavam vjetar…';
      st.textContent = '';
      $('od-termika').textContent = '';
      const { fc, wind, error } = await windFor(o.lat, o.lon);
      target = { o, wind };
      if (!wind) {
        txt.textContent = fc
          ? `Nema svježe prognoze (${ageText(fc.preuzeto)}). Potreban je internet.`
          : `Prognoza vjetra nije dostupna${error ? ' — nema veze' : ''}. Potreban je internet.`;
        st.dataset.stanje = 'nepoznato';
        $('btn-od-konus').disabled = true;
      } else {
        txt.textContent = `Vjetar: ${formatWind(wind)} · ${ageText(fc.preuzeto)}`;
        const ok = suitsStand(wind.smjer, o.dozvoljeni_vjetar);
        st.dataset.stanje = ok == null ? 'nepoznato' : ok ? 'ok' : 'ne';
        st.textContent = ok == null ? 'Dozvoljeni smjerovi vjetra za ovu čeku nisu zadani (Uredi).'
          : ok ? 'Odgovara današnjem vjetru' : 'NE odgovara današnjem vjetru';
        $('btn-od-konus').disabled = false;
      }
      try {
        const t = await terrainAt(o.lat, o.lon);
        const d = new Date();
        const sun = sunTimes(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime(), o.lat, o.lon);
        $('od-termika').textContent = (t && thermalHint(t.uzbrdo, sun, Date.now())) || '';
      } catch (err) {
        console.warn('termika', err);
      }
    },
  };
}
