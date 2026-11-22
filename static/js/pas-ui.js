// Ekran "Moj pas": pozicija sa ogrlice se zalijepi kao tekst, prikaže na karti sa smjerom i udaljenošću od lovca.

import { loadJSON, saveSoft } from './storage.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { startNavigation } from './navigacija.js';
import { parseLocation, addDogPoint, dogAge, dogSummary } from './pas.js';
import { rangeLabel } from './istrazivac.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';

export const PAS_KEY = 'lovac.pas';
const $ = (id) => document.getElementById(id);
const hm = (t) => new Date(t).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' });

export const loadDog = () => ({ ime: 'Pas', pozicije: [], ...loadJSON(PAS_KEY, {}) });

export function initPas(L, map) {
  const screen = $('pas-ekran');
  const layer = L.layerGroup();
  let dog = loadDog();

  const last = () => dog.pozicije[dog.pozicije.length - 1] || null;

  const drawMap = () => {
    layer.clearLayers();
    const p = last();
    if (!p) { map.removeLayer(layer); return; }
    layer.addTo(map);
    if (dog.pozicije.length > 1) L.polyline(dog.pozicije.map((x) => [x.lat, x.lon]), { color: '#a16207', weight: 3, dashArray: '4 6', interactive: false }).addTo(layer);
    const icon = L.divIcon({ className: 'uc-ikona', html: '<span class="uc-marker pas-marker">P</span>', iconSize: [34, 34], iconAnchor: [17, 17] });
    L.marker([p.lat, p.lon], { icon, keyboard: false })
      .bindTooltip(() => `${dog.ime} · ${dogSummary(currentFix(), p)}`, { permanent: false }).addTo(layer);
  };

  const render = () => {
    const p = last();
    const box = $('pas-stanje');
    $('pas-ime').value = $('pas-ime').value || (dog.ime === 'Pas' ? '' : dog.ime);
    $('pas-akcije').hidden = !p;
    if (!p) {
      box.dataset.stanje = 'nema';
      box.textContent = 'Pozicija psa još nije unesena.';
    } else {
      const age = dogAge(p.t);
      const me = currentFix();
      box.dataset.stanje = age.zastarjelo ? 'staro' : 'svjeze';
      box.textContent = `${dog.ime}: ${me ? `${rangeLabel(me, p)} od tebe` : 'čekam tvoj GPS za udaljenost'} · ${age.text}${age.zastarjelo ? ' — podatak je star!' : ''}`;
    }
    $('pas-historija').innerHTML = dog.pozicije.slice().reverse().slice(0, 10).map((x) => `<li class="trag-red">
      <b>${hm(x.t)}</b> <span class="sitno">${currentFix() ? escapeHtml(rangeLabel(currentFix(), x)) : `${x.lat.toFixed(5)}, ${x.lon.toFixed(5)}`}</span></li>`).join('')
      || '<li class="sitno">Još nema pozicija.</li>';
    $('btn-pas-obrisi').hidden = !p;
  };

  const save = () => { saveSoft(PAS_KEY, dog); drawMap(); render(); document.dispatchEvent(new CustomEvent('pas:promjena')); };

  const open = () => { dog = loadDog(); $('pas-greska').textContent = ''; $('meni-spiskovi').hidden = true; render(); screen.hidden = false; };
  const close = () => { screen.hidden = true; };
  $('btn-pas').addEventListener('click', open);
  $('btn-pas-zatvori').addEventListener('click', close);
  registerBackHandler(() => { if (screen.hidden) return false; close(); return true; });

  $('btn-pas-zalijepi').addEventListener('click', async () => {
    try {
      $('pas-unos').value = await navigator.clipboard.readText();
    } catch {
      $('pas-greska').textContent = 'Međuspremnik nije dostupan: dugo dodirni polje iznad i izaberi Zalijepi.';
    }
  });

  $('btn-pas-prikazi').addEventListener('click', () => {
    const r = parseLocation($('pas-unos').value);
    if (r.greska) { $('pas-greska').textContent = r.greska; return; }
    $('pas-greska').textContent = '';
    dog = { ime: $('pas-ime').value.trim().slice(0, 30) || dog.ime || 'Pas', pozicije: addDogPoint(dog.pozicije, r) };
    $('pas-unos').value = '';
    save();
    toast(`${dog.ime} je na karti`);
  });

  $('btn-pas-karta').addEventListener('click', () => {
    const p = last();
    if (!p) return;
    close();
    map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16));
  });
  $('btn-pas-vodi').addEventListener('click', () => {
    const p = last();
    if (!p) return;
    close();
    startNavigation({ lat: p.lat, lon: p.lon, naziv: dog.ime });
  });
  $('btn-pas-obrisi').addEventListener('click', () => {
    dog = { ime: dog.ime, pozicije: [] };
    $('pas-ime').value = '';
    save();
  });

  onGpsUpdate(() => { if (!screen.hidden) render(); });
  setInterval(() => { if (!screen.hidden) render(); }, 30000);
  drawMap();
}
