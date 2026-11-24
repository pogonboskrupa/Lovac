// "Vodi me do": pravac i udaljenost do cilja iz GPS-a i kompasa. Radi potpuno offline.

import { onGpsUpdate, currentFix, currentHeading } from './gps.js';
import { bearing, formatBearing } from './geo.js';
import { haversine, formatDistance } from './trag.js';
import { walkEta, trendOf, TREND_TEKST, arrivalState, STIGAO_M } from './vodi.js';

// Ugao strelice na ekranu: sa kompasom relativno na smjer telefona, bez kompasa sjever je gore.
export function navArrowAngle(brg, heading) {
  const a = heading == null ? brg : brg - heading;
  return ((a % 360) + 360) % 360;
}

const $ = (id) => document.getElementById(id);

let target = null;
let line = null;
let unsubscribe = null;
let mapRef = null;
let Lref = null;

let prevDist = null;
let arrivedBuzz = false;

function update(fix, heading) {
  if (!target) return;
  const box = $('navigacija');
  const dist = $('nav-udaljenost');
  if (!fix) {
    dist.textContent = 'Čekam GPS…';
    $('nav-smjer').textContent = '';
    $('nav-eta').textContent = '';
    box.dataset.stanje = 'ceka';
    return;
  }
  const d = haversine(fix, target);
  const brg = bearing(fix, target);
  const stanje = arrivalState(d);
  box.dataset.stanje = stanje;
  dist.textContent = d < STIGAO_M ? 'Stigao si' : formatDistance(d);
  $('nav-smjer').textContent = formatBearing(brg);
  $('nav-eta').textContent = walkEta(d);
  // trend se računa tek kad se udaljenost promijeni preko šuma GPS-a; inače ostaje zadnja ocjena
  const tr = trendOf(prevDist, d, fix.acc);
  if (tr !== 'isto') {
    const el = $('nav-trend');
    el.dataset.trend = tr;
    el.textContent = stanje === 'stigao' ? '' : TREND_TEKST[tr];
    prevDist = d;
  }
  if (prevDist == null) prevDist = d;
  if (stanje === 'stigao' && !arrivedBuzz) {
    arrivedBuzz = true;
    try { navigator.vibrate?.([120, 80, 120]); } catch { /* vibracija nije obavezna */ }
  } else if (stanje !== 'stigao') arrivedBuzz = false;
  $('nav-strelica').style.transform = `rotate(${navArrowAngle(brg, heading)}deg)`;
  $('nav-sjever').style.transform = `rotate(${navArrowAngle(0, heading)}deg) translateY(-29px)`;
  $('nav-napomena').textContent = heading == null ? 'Sjever je gore (kompas nije dostupan)' : 'Strelica pokazuje pravac · kompas može griješiti';
  const pts = [[fix.lat, fix.lon], [target.lat, target.lon]];
  if (line) line.setLatLngs(pts);
  else if (mapRef) line = Lref.polyline(pts, { color: '#2f7dff', weight: 3, dashArray: '6 8', interactive: false }).addTo(mapRef);
}

export function initNavigation(L, map) {
  Lref = L;
  mapRef = map;
  $('btn-nav-kraj').addEventListener('click', stopNavigation);
  $('btn-nav-zatvori').addEventListener('click', stopNavigation);
  $('btn-nav-karta').addEventListener('click', () => {
    if (!target) return;
    const fix = currentFix();
    const pts = fix ? [[fix.lat, fix.lon], [target.lat, target.lon]] : [[target.lat, target.lon]];
    // panel navigacije pokriva gornji dio karte, pa gornja margina mora biti veća
    if (fix) map.fitBounds(pts, { paddingTopLeft: [40, 220], paddingBottomRight: [40, 140], maxZoom: 17, animate: false });
    else map.setView(pts[0], Math.max(map.getZoom(), 15), { animate: false });
  });
}

export function startNavigation(t) {
  target = { lat: t.lat, lon: t.lon, naziv: t.naziv };
  $('nav-cilj').textContent = t.naziv || 'Cilj';
  prevDist = null;
  arrivedBuzz = false;
  $('nav-trend').textContent = '';
  $('navigacija').hidden = false;
  unsubscribe?.();
  unsubscribe = onGpsUpdate(update);
  update(currentFix(), currentHeading());
}

export function stopNavigation() {
  target = null;
  unsubscribe?.();
  unsubscribe = null;
  if (line && mapRef) mapRef.removeLayer(line);
  line = null;
  $('navigacija').hidden = true;
}
