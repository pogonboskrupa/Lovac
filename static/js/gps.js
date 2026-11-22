// "Moja lokacija": pozicija, tačnost u boji, starost fiksa, Prati me / Centriraj, kompas.

import { accuracyLevel, formatFixAge, shouldStopFollow } from './geo.js';
import { toast } from './ui.js';
import { loadJSON } from './storage.js';
import { coneEnabled, STOZAC_KEY } from './kompas.js';

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

// Zadnji fiks i smjer za druge module (Vodi me do, opažanje na poziciji).
const gpsListeners = new Set();
let lastFix = null;
let lastHeading = null;

export function onGpsUpdate(fn) {
  gpsListeners.add(fn);
  return () => gpsListeners.delete(fn);
}

export function currentFix() {
  return lastFix;
}

export function currentHeading() {
  return lastHeading ?? lastFix?.heading ?? null;
}

function notifyGps() {
  gpsListeners.forEach((fn) => { try { fn(lastFix, currentHeading()); } catch (e) { console.error(e); } });
}

export function initGps(L, map) {
  const state = { fix: null, follow: false, watchId: null, heading: null, marker: null, circle: null, selfMove: false, dragging: false };

  const arrowIcon = L.divIcon({
    className: 'gps-ikona',
    html: '<div class="gps-tacka"><svg class="gps-stozac" viewBox="-60 -60 120 120" aria-hidden="true"><defs><radialGradient id="gps-stozac-grad" cx="0" cy="0" r="58" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2f7dff" stop-opacity=".75"/><stop offset="1" stop-color="#2f7dff" stop-opacity="0"/></radialGradient></defs><path d="M0 0 -32 -50 A60 60 0 0 1 32 -50Z" fill="url(#gps-stozac-grad)"/></svg><svg class="gps-nisan" viewBox="0 0 34 34" aria-hidden="true"><g class="gps-nisan-oblik"><circle cx="17" cy="17" r="9"/><path d="M17 2v9M17 23v9M2 17h9M23 17h9"/></g><circle class="gps-nisan-tacka" cx="17" cy="17" r="2.6"/></svg></div>',
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
      const h = state.heading ?? state.fix.heading;
      const cone = el.querySelector('.gps-stozac');
      if (cone) {
        cone.style.visibility = h != null && coneEnabled(loadJSON(STOZAC_KEY, null)) ? 'visible' : 'hidden';
        if (h != null) cone.style.transform = `rotate(${h}deg)`;
      }
    }
    if (elAcc) {
      elAcc.textContent = `±${Math.round(acc)} m`;
      elAcc.dataset.tacnost = level;
    }
    if (panel) panel.hidden = false;
    if (state.follow && !state.dragging) followPan();
  };

  const onPos = (pos) => {
    const c = pos.coords;
    state.fix = {
      lat: c.latitude, lon: c.longitude, acc: c.accuracy,
      heading: Number.isFinite(c.heading) && c.speed > 0.5 ? c.heading : null,
      t: pos.timestamp || Date.now(),
    };
    lastFix = state.fix;
    render();
    notifyGps();
  };

  document.addEventListener('kompas:promjena', () => render());

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
      if (h != null && e.absolute !== false) { state.heading = h; lastHeading = h; render(); notifyGps(); }
    };
    if ('ondeviceorientationabsolute' in globalThis) {
      globalThis.addEventListener('deviceorientationabsolute', handler);
    }
  };

  // Pomjeranje koje radi sama aplikacija ne smije se računati kao lovčevo (inače animacija prema novom fiksu ugasi praćenje).
  function followPan() {
    if (!state.fix) return;
    state.selfMove = true;
    map.once('moveend', () => { state.selfMove = false; });
    map.panTo([state.fix.lat, state.fix.lon], { animate: true });
  }

  const setFollow = (on) => {
    state.follow = on;
    btnFollow?.setAttribute('aria-pressed', String(on));
    if (on && state.fix) followPan();
  };

  btnFollow?.addEventListener('click', () => { start(); setFollow(!state.follow); });
  btnCenter?.addEventListener('click', () => {
    start();
    if (state.fix) map.setView([state.fix.lat, state.fix.lon], Math.max(map.getZoom(), 15), { animate: false });
    else toast('Čekam GPS…');
  });
  // Praćenje se gasi tek kad lovac odvuče kartu tako da je njegova pozicija 80 % puta od centra do ruba ekrana;
  // manji pomak se po otpuštanju vraća na poziciju.
  map.on('dragstart', () => { state.dragging = true; });
  map.on('move', () => {
    if (!state.follow || state.selfMove || !state.fix) return;
    const pt = map.latLngToContainerPoint([state.fix.lat, state.fix.lon]);
    if (shouldStopFollow(pt, map.getSize())) setFollow(false);
  });
  map.on('dragend', () => {
    state.dragging = false;
    if (state.follow) followPan();
  });

  setInterval(() => {
    if (state.fix && elAge) elAge.textContent = formatFixAge(Date.now() - state.fix.t);
  }, 1000);

  start();
  return { state, start };
}
