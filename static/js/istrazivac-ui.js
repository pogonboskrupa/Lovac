// Dnevno svjetlo (čip na mapi) i Istraživač mod: 3D nagib karte + trake sa smjerom i udaljenošću članova.

import { sunTimes, daylightStatus } from './sunce.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { compassName } from './geo.js';
import { memberVectors, formatMemberDistance, arrowAngle } from './istrazivac.js';
import { cachedProfile } from './auth.js';
import { memberName } from './dijeljenje-ui.js';
import { escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const DAY = 86400000;

function localNoon(offsetDays = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays, 12).getTime();
}

export function initIstrazivac(L, map) {
  // ---------- dnevno svjetlo ----------
  const chip = $('svjetlo-chip');
  const updateLight = () => {
    const p = currentFix() || (({ lat, lng }) => ({ lat, lon: lng }))(map.getCenter());
    const st = daylightStatus(Date.now(), sunTimes(localNoon(), p.lat, p.lon), sunTimes(localNoon(1), p.lat, p.lon));
    chip.dataset.stanje = st.stanje;
    chip.textContent = st.tekst;
    chip.hidden = false;
  };
  updateLight();
  setInterval(updateLight, 60000);
  chip.addEventListener('click', () => $('btn-danas')?.click());

  // ---------- istraživač ----------
  const screen = $('ekran-mapa');
  const btn = $('btn-istrazivac');
  const bar = $('istrazivac-traka');
  let rows = [];
  let on = false;
  let pausedUntil = 0;

  const render = () => {
    const me = currentFix();
    if (!on) return;
    const izlaz = '<button type="button" class="istrazivac-izlaz" data-izlaz>Izađi iz 3D</button>';
    if (!me) { bar.innerHTML = `${izlaz}<span class="sitno">Čekam GPS…</span>`; return; }
    const v = memberVectors(me, rows, cachedProfile()?.id, memberName);
    bar.innerHTML = izlaz + (v.length
      ? v.map((m) => `<button type="button" class="clan-chip" data-uid="${escapeHtml(m.id)}" aria-label="${escapeHtml(m.ime)}, ${compassName(m.smjer)}, ${formatMemberDistance(m.udaljenost)}">
          <svg class="ic strelica" style="transform:rotate(${Math.round(arrowAngle(m.smjer, 0))}deg)"><use href="#ic-arrow"/></svg>
          <span><b>${escapeHtml(m.ime.split(' ')[0])}</b> ${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)}${m.starost > 1 ? ` · ${m.starost} min` : ''}</span></button>`).join('')
      : '<span class="sitno">Nema članova koji dijele lokaciju (lov u toku + internet).</span>');
  };

  const setOn = (value) => {
    on = value;
    screen.classList.toggle('istrazivac', on);
    btn.setAttribute('aria-pressed', String(on));
    bar.hidden = !on;
    for (const h of ['dragging', 'touchZoom', 'doubleClickZoom']) map[h][on ? 'disable' : 'enable']();
    if (on) {
      const me = currentFix();
      if (me) map.setView([me.lat, me.lon], Math.max(map.getZoom(), 15));
    }
    render();
  };

  btn.addEventListener('click', () => setOn(!on));
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-izlaz]')) { setOn(false); return; }
    const c = e.target.closest('[data-uid]');
    const r = c && rows.find((x) => x.korisnik_id === c.dataset.uid);
    if (!r) return;
    pausedUntil = Date.now() + 15000;
    map.panTo([r.lat, r.lon]);
  });
  document.addEventListener('uzivo:pozicije', (e) => { rows = e.detail.rows || []; render(); });
  onGpsUpdate((fix) => {
    render();
    if (on && fix && Date.now() > pausedUntil) map.setView([fix.lat, fix.lon], map.getZoom(), { animate: false });
  });
}
