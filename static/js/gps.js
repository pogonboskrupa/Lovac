// "Moja lokacija": pozicija, tačnost u boji, starost fiksa, Prati me / Centriraj, kompas.

import { accuracyLevel, formatFixAge } from './geo.js';
import { toast } from './ui.js';

const ACC_COLORS = { dobro: 'var(--gps-dobro)', srednje: 'var(--gps-srednje)', lose: 'var(--gps-lose)' };

export function screenAngle() {
  const a = globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0;
  return Number(a) || 0;
}

// alpha iz deviceorientationabsolute raste suprotno od kazaljke; azimut ide u smjeru kazaljke.
export function headingFromAlpha(alpha, screenDeg = 0) {
  if (!Number.isFinite(alpha)) return null;
  return ((360 - alpha + screenDeg) % 360 + 360) % 360;
}

export function initGps(L, map) {
  const state = { fix: null, follow: false, watchId: null, heading: null, marker: null, circle: null };

  const arrowIcon = L.divIcon({
    className: 'gps-ikona',
    html: '<div class="gps-tacka"><svg class="gps-strelica" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 19 20 12 16 5 20Z"/></svg></div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  const btnFollow = document.getElementById('btn-prati');
  const btnCenter = document.getElementById('btn-centriraj');
  const elAcc = document.getElementById('gps-tacnost');
  const elAge = document.getElementById('gps-starost');
  const panel = document.getElementById('gps-status');

  const render = () => {
    if (!state.fix) return;
    const { lat, lon, acc } = state.fix;
    const level = accuracyLevel(acc);
    if (!state.marker) {
      state.circle = L.circle([lat, lon], { radius: acc, weight: 1, interactive: false, className: 'gps-krug' }).addTo(map);
      state.marker = L.marker([lat, lon], { icon: arrowIcon, interactive: false, keyboard: false }).addTo(map);
    } else {
      state.marker.setLatLng([lat, lon]);
      state.circle.setLatLng([lat, lon]).setRadius(acc);
    }
    state.circle.setStyle({ color: ACC_COLORS[level], fillColor: ACC_COLORS[level] });
    const el = state.marker.getElement();
    if (el) {
      el.dataset.tacnost = level;
      const arrow = el.querySelector('.gps-strelica');
      const h = state.heading ?? state.fix.heading;
      arrow.style.visibility = h == null ? 'hidden' : 'visible';
      if (h != null) arrow.style.transform = `rotate(${h}deg)`;
    }
    if (elAcc) {
      elAcc.textContent = `±${Math.round(acc)} m`;
      elAcc.dataset.tacnost = level;
    }
    if (panel) panel.hidden = false;
    if (state.follow) map.panTo([lat, lon], { animate: true });
  };

  const onPos = (pos) => {
    const c = pos.coords;
    state.fix = {
      lat: c.latitude, lon: c.longitude, acc: c.accuracy,
      heading: Number.isFinite(c.heading) && c.speed > 0.5 ? c.heading : null,
      t: pos.timestamp || Date.now(),
    };
    render();
  };

  const onErr = (err) => {
    const msg = err.code === 1 ? 'Lokacija nije dozvoljena' : err.code === 3 ? 'GPS još traži signal…' : 'GPS nije dostupan';
    if (elAcc) elAcc.textContent = msg;
    if (panel) panel.hidden = false;
  };

  const start = () => {
    if (state.watchId != null) return;
    if (!navigator.geolocation) { toast('Uređaj nema GPS'); return; }
    state.watchId = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, maximumAge: 2000, timeout: 30000,
    });
    startCompass();
  };

  const startCompass = () => {
    const handler = (e) => {
      const h = headingFromAlpha(e.alpha, screenAngle());
      if (h != null && e.absolute !== false) { state.heading = h; render(); }
    };
    if ('ondeviceorientationabsolute' in globalThis) {
      globalThis.addEventListener('deviceorientationabsolute', handler);
    }
  };

  const setFollow = (on) => {
    state.follow = on;
    btnFollow?.setAttribute('aria-pressed', String(on));
    if (on && state.fix) map.panTo([state.fix.lat, state.fix.lon]);
  };

  btnFollow?.addEventListener('click', () => { start(); setFollow(!state.follow); });
  btnCenter?.addEventListener('click', () => {
    start();
    if (state.fix) map.setView([state.fix.lat, state.fix.lon], Math.max(map.getZoom(), 15));
    else toast('Čekam GPS…');
  });
  // Ručno pomjeranje karte gasi praćenje, inače se karta "otima" lovcu.
  map.on('dragstart', () => { if (state.follow) setFollow(false); });

  setInterval(() => {
    if (state.fix && elAge) elAge.textContent = formatFixAge(Date.now() - state.fix.t);
  }, 1000);

  start();
  return { state, start };
}
