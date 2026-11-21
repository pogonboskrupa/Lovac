// Ekran "Lokacija u lovu": uključivanje/isključivanje dijeljenja, učestalost, ko dijeli, smjer i udaljenost.

import { loadJSON, saveSoft } from './storage.js';
import { currentFix } from './gps.js';
import { cachedProfile } from './auth.js';
import { memberName } from './dijeljenje-ui.js';
import { startNavigation } from './navigacija.js';
import { compassName } from './geo.js';
import { formatMemberDistance } from './istrazivac.js';
import { normalizeShare, SHARE_INTERVALS, shareList } from './lokacija.js';
import { escapeHtml, registerBackHandler } from './ui.js';

const KEY = 'lovac.lokacija';
const $ = (id) => document.getElementById(id);
const STANJE = { zivo: 'Dijeli uživo', staro: 'Dijeli (zastarjelo)', 'bez-signala': 'Bez signala', nema: 'Ne dijeli' };

export const getShareSettings = () => normalizeShare(loadJSON(KEY, null));

export function setShareSettings(patch) {
  const next = normalizeShare({ ...getShareSettings(), ...patch });
  saveSoft(KEY, next);
  document.dispatchEvent(new CustomEvent('lokacija:postavke', { detail: next }));
  return next;
}

// api: { lov(), rows(), lastSent() } iz uzivo-ui.js
export function initLokacijaEkran(map, api) {
  const screen = $('lokacija-ekran');
  const me = () => cachedProfile();
  const isOpen = () => !screen.hidden;

  const render = () => {
    if (!isOpen()) return;
    const s = getShareSettings();
    const lov = api.lov();
    $('lokacija-lov').textContent = lov ? `${lov.lov.naziv} — lov u toku` : 'Nema lova u toku u kojem učestvuješ.';
    const btn = $('lokacija-prekidac');
    btn.setAttribute('aria-pressed', String(s.on));
    btn.textContent = s.on ? 'Dijelim lokaciju — dodirni za isključivanje' : 'Lokacija isključena — dodirni za uključivanje';
    const sent = api.lastSent();
    $('lokacija-moje').textContent = !s.on ? 'Drugi ne vide gdje si.'
      : !currentFix() ? 'Čekam GPS…'
        : sent ? `Zadnje slanje u ${new Date(sent).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })} · ±${Math.round(currentFix().acc ?? 0)} m`
          : 'Još nije poslano (potreban je internet).';
    $('lokacija-interval').innerHTML = SHARE_INTERVALS.map((i) =>
      `<button type="button" data-interval="${i.id}" aria-pressed="${s.interval === i.id}">${i.naziv}</button>`).join('');
    const list = lov ? shareList(lov.ucesnici, api.rows(), me()?.id, memberName, currentFix()) : [];
    $('lokacija-clanovi').innerHTML = list.map((m) => `<li class="clan-red" data-uid="${escapeHtml(m.id)}" data-stanje="${m.stanje}">
        <span><b>${escapeHtml(m.ime)}</b><br><span class="sitno">${STANJE[m.stanje]}${m.udaljenost != null ? ` · ${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)}` : ''}${m.starost > 1 ? ` · prije ${m.starost} min` : ''}</span></span>
        ${m.lat != null ? '<button type="button" class="dugme" data-akcija="na-karti">Na karti</button><button type="button" class="dugme" data-akcija="vodi">Vodi me</button>' : ''}
      </li>`).join('') || '<li class="sitno">Nema drugih učesnika.</li>';
  };

  const open = () => { screen.hidden = false; render(); };
  const close = () => { screen.hidden = true; };
  $('btn-lokacija').addEventListener('click', open);
  $('btn-lokacija-zatvori').addEventListener('click', close);
  registerBackHandler(() => { if (screen.hidden) return false; close(); return true; });

  $('lokacija-prekidac').addEventListener('click', () => { setShareSettings({ on: !getShareSettings().on }); render(); });
  $('lokacija-interval').addEventListener('click', (e) => {
    const b = e.target.closest('[data-interval]');
    if (b) { setShareSettings({ interval: b.dataset.interval }); render(); }
  });
  $('lokacija-clanovi').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-akcija]');
    const row = b && api.rows().find((r) => r.korisnik_id === b.closest('[data-uid]').dataset.uid);
    if (!row) return;
    if (b.dataset.akcija === 'na-karti') {
      close();
      map.setView([row.lat, row.lon], Math.max(map.getZoom(), 16));
    } else {
      close();
      startNavigation({ lat: row.lat, lon: row.lon, naziv: memberName(row.korisnik_id) });
    }
  });
  document.addEventListener('uzivo:pozicije', render);
  document.addEventListener('uzivo:poslano', render);
  return { render };
}
