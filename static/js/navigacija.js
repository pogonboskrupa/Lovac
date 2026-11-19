// "Vodi me do": pravac i udaljenost do cilja iz GPS-a i kompasa. Radi potpuno offline.

import { onGpsUpdate, currentFix, currentHeading } from './gps.js';
import { bearing, formatBearing } from './geo.js';
import { haversine, formatDistance } from './trag.js';

const ARRIVED_M = 15;

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

function update(fix, heading) {
  if (!target) return;
  const dist = $('nav-udaljenost');
  if (!fix) {
    dist.textContent = 'Čekam GPS…';
    $('nav-smjer').textContent = '';
    return;
  }
  const d = haversine(fix, target);
  const brg = bearing(fix, target);
  dist.textContent = d < ARRIVED_M ? 'Stigao si' : formatDistance(d);
  $('nav-smjer').textContent = formatBearing(brg);
  $('nav-strelica').style.transform = `rotate(${navArrowAngle(brg, heading)}deg)`;
  $('nav-napomena').textContent = heading == null ? 'Sjever je gore (kompas nije dostupan)' : 'Strelica pokazuje pravac';
  const pts = [[fix.lat, fix.lon], [target.lat, target.lon]];
  if (line) line.setLatLngs(pts);
  else if (mapRef) line = Lref.polyline(pts, { color: '#2f7dff', weight: 3, dashArray: '6 8', interactive: false }).addTo(mapRef);
}

export function initNavigation(L, map) {
  Lref = L;
  mapRef = map;
  $('btn-nav-kraj').addEventListener('click', stopNavigation);
}

export function startNavigation(t) {
  target = { lat: t.lat, lon: t.lon, naziv: t.naziv };
  $('nav-cilj').textContent = t.naziv || 'Cilj';
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
