// "Dijeli sa izabranim lovcima" u ploči "Moja lokacija": pretraga svih lovaca društva (samo pretraga — spisak se ne prikazuje
// dok se ne upiše bar 2 slova), izbor jednog ili više lovaca i dijeljenje lokacije samo sa njima na 1 h / 4 h / do kraja dana.
// Server: tabela `lokacije_izabranih` (migracija 037); vide je samo lovac koji dijeli i primalac, ne ni administrator.

import { getClient, cachedProfile } from './auth.js';
import { setSharing } from './dijeli-znak.js';
import { currentFix, onGpsUpdate } from './gps.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { memberCard, formatMemberDistance } from './istrazivac.js';
import { compassName } from './geo.js';
import { getShareSettings } from './lokacija-ui.js';
import { shareIntervalMs, initialsOf } from './lokacija.js';
import { SHARE_DURATIONS, shareUntil, untilText } from './lokacija-sekcija.js';
import {
  IZABRANI_KEY, IZABRANI_UKLANJANJE_KEY, MAX_PRIMALACA, searchHunters, displayName, activeSelectedShare, addRecipient, removeRecipient,
  shareRows, receivedShares, validRecipients,
} from './lokacija-izabrani.js';
import { toast, escapeHtml } from './ui.js';

const MEMBERS_KEY = 'lovac.clanovi';
const DRAFT_KEY = 'lovac.izabrani_nacrt';
const POLL_OPEN_MS = 30000;
const POLL_BG_MS = 120000; // pozadina rjeđe: besplatni server (budžet zahtjeva u opterecenje.spec.mjs)
const $ = (id) => document.getElementById(id);

export function initLokacijaIzabrani(L, map) {
  const panel = $('lok-ploca');
  if (!panel || !$('lok-izabrani')) return;
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());
  const members = () => loadJSON(MEMBERS_KEY, []);
  const markers = L.layerGroup().addTo(map);
  let received = [];
  let query = '';
  let duration = '1';
  let sendTimer = null;
  let tableMissing = false;
  let draft = loadJSON(DRAFT_KEY, []).filter((x) => typeof x === 'string');

  const isOpen = () => !panel.hidden;
  const sharing = () => activeSelectedShare(loadJSON(IZABRANI_KEY, null));
  const ids = () => sharing()?.ids || draft;
  const setIds = (next) => {
    if (sharing()) saveSoft(IZABRANI_KEY, { ids: next, do: sharing().do });
    else { draft = next; saveSoft(DRAFT_KEY, next); }
  };

  // ---------- brisanje sa servera (pamti se dok nema veze) ----------
  const pendingRemovals = () => loadJSON(IZABRANI_UKLANJANJE_KEY, []);
  const queueRemoval = (idList) => saveSoft(IZABRANI_UKLANJANJE_KEY, [...new Set([...pendingRemovals(), ...idList])]);
  const flushRemovals = async () => {
    const list = pendingRemovals();
    if (!list.length || !online() || !me()) return;
    try {
      const q = getClient().from('lokacije_izabranih').delete().eq('vlasnik_id', me().id);
      const { error } = await (list.includes('*') ? q : q.in('primalac_id', list));
      if (error && !['PGRST205', '42P01'].includes(error.code)) throw new Error(error.message);
      saveSoft(IZABRANI_UKLANJANJE_KEY, []);
    } catch (err) {
      console.warn('uklanjanje dijeljenja', err.message);
    }
  };

  // ---------- slanje ----------
  const stopSending = () => { clearInterval(sendTimer); sendTimer = null; setSharing('izabrani', false); };
  const sendNow = async () => {
    const sh = sharing();
    if (!sh) { stopSending(); render(); return; }
    const fix = currentFix();
    if (!fix || !online() || !me()) return;
    const good = validRecipients(sh.ids, members());
    if (!good.length) return;
    const sb = getClient();
    try {
      const { error } = await sb.from('lokacije_izabranih').upsert(shareRows(good, fix, sh.do, me().id), { onConflict: 'vlasnik_id,primalac_id' });
      if (!error) return;
      if (['PGRST205', '42P01'].includes(error.code)) {
        if (!tableMissing) toast('Dijeljenje sa izabranim lovcima server još ne podržava (treba nadogradnja servera)', 6000);
        tableMissing = true;
        return;
      }
      if (error.code === '54000') { toast('Server dozvoljava najviše 30 primalaca', 5000); return; }
      // jedan neprihvaćen primalac (npr. nije član društva) ne smije zaustaviti ostale
      const bad = [];
      for (const row of shareRows(good, fix, sh.do, me().id)) {
        const r = await sb.from('lokacije_izabranih').upsert(row, { onConflict: 'vlasnik_id,primalac_id' });
        if (r.error) bad.push(row.primalac_id);
      }
      if (bad.length) {
        setIds(sh.ids.filter((x) => !bad.includes(x)));
        toast(`Server nije prihvatio: ${bad.map((x) => memberName(x)).join(', ')}`, 6000);
        render();
      }
    } catch (err) {
      console.warn('dijeljenje sa izabranima', err.message);
    }
  };
  const armSending = () => {
    stopSending();
    setSharing('izabrani', true);
    sendTimer = setInterval(sendNow, shareIntervalMs(getShareSettings().interval));
    sendNow();
  };

  // ---------- prijem ----------
  const drawMarkers = () => {
    markers.clearLayers();
    for (const m of receivedShares(received, me()?.id, memberName, currentFix())) {
      const icon = L.divIcon({ className: 'uc-ikona', html: `<span class="uc-marker sek-marker" data-uid="${escapeHtml(m.id)}" data-stanje="${m.stanje}">${escapeHtml(initialsOf(m.ime))}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      L.marker([m.lat, m.lon], { icon, keyboard: false, clan: { korisnik_id: m.id, lat: m.lat, lon: m.lon, t: new Date(Date.now() - m.starost * 60000).toISOString() } })
        .bindPopup(() => memberCard(m.ime, currentFix(), m, m.starost, 'dijeli samo sa tobom'), { closeButton: true, autoPan: true }).addTo(markers);
    }
  };
  let lastPull = 0;
  const pull = async (force = false) => {
    if (!online() || !me() || tableMissing) return;
    if (!force && Date.now() - lastPull < (isOpen() ? POLL_OPEN_MS : POLL_BG_MS) - 1000) return;
    lastPull = Date.now();
    try {
      const { data, error } = await getClient().from('lokacije_izabranih').select('*').eq('primalac_id', me().id);
      if (error) {
        if (['PGRST205', '42P01'].includes(error.code)) tableMissing = true;
        return;
      }
      received = data || [];
    } catch (err) {
      console.warn('lokacije izabranih', err.message);
      return;
    }
    drawMarkers();
    if (isOpen()) renderReceived();
  };

  // ---------- prikaz ----------
  const renderResults = () => {
    const found = searchHunters(members(), query, { myId: me()?.id, selected: ids() });
    const box = $('lok-iz-rezultati');
    const full = ids().length >= MAX_PRIMALACA;
    if (!query.trim()) { box.innerHTML = ''; $('lok-iz-uputa').hidden = false; return; }
    $('lok-iz-uputa').hidden = true;
    if (full) { box.innerHTML = `<li class="sitno">Najviše ${MAX_PRIMALACA} lovaca odjednom.</li>`; return; }
    box.innerHTML = found.length
      ? found.map((m) => `<li class="clan-red" data-uid="${escapeHtml(m.id)}"><span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(`${m.ime} ${m.prezime}`))}</span>
        <span class="clan-tekst"><b>${escapeHtml(displayName(m))}</b></span><button type="button" class="dugme" data-akcija="dodaj">Dodaj</button></li>`).join('')
      : `<li class="sitno">${query.replace(/\s/g, '').length < 2 ? 'Upiši bar 2 slova.' : 'Nema lovca sa tim imenom.'}${members().length ? '' : ' Spisak lovaca još nije preuzet (potreban je internet).'}</li>`;
  };
  const renderChips = () => {
    $('lok-iz-izabrani').innerHTML = ids().map((id) => `<span class="lok-iz-cip" data-uid="${escapeHtml(id)}">${escapeHtml(memberName(id))}<button type="button" data-akcija="ukloni" aria-label="Ukloni ${escapeHtml(memberName(id))}">×</button></span>`).join('')
      || '<span class="sitno">Još nikoga nisi izabrao.</span>';
  };
  const renderShare = () => {
    const sh = sharing();
    $('lok-iz-trajanje').innerHTML = SHARE_DURATIONS.map((d) => `<button type="button" data-trajanje="${d.id}" aria-pressed="${d.id === duration}">${d.naziv}</button>`).join('');
    $('lok-iz-trajanje').hidden = Boolean(sh);
    const btn = $('lok-iz-prekidac');
    btn.setAttribute('aria-pressed', String(Boolean(sh)));
    btn.disabled = !sh && !ids().length;
    btn.textContent = sh ? 'Prekini dijeljenje' : `Počni dijeliti sa izabranima${ids().length ? ` (${ids().length})` : ''}`;
    $('lok-iz-stanje').textContent = sh
      ? `Dijeliš lokaciju sa ${sh.ids.length === 1 ? memberName(sh.ids[0]) : `${sh.ids.length} lovaca`} do ${untilText(sh.do)}. Vide je samo oni.`
      : 'Lokaciju vide samo izabrani lovci, i samo dok dijeljenje traje (najviše 24 h).';
  };
  const renderReceived = () => {
    const list = receivedShares(received, me()?.id, memberName, currentFix());
    $('lok-iz-broj').textContent = list.length ? `(${list.length})` : '';
    $('lok-iz-lista').innerHTML = list.map((m) => `<li class="clan-red" data-uid="${escapeHtml(m.id)}" data-stanje="${m.stanje}">
        <span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(m.ime))}</span>
        <span class="clan-tekst"><b>${escapeHtml(m.ime)}</b><span class="sitno">${m.udaljenost != null ? `${compassName(m.smjer)} ${formatMemberDistance(m.udaljenost)} · ` : ''}${m.starost > 1 ? `prije ${m.starost} min` : 'upravo'}</span></span>
        <button type="button" class="dugme" data-akcija="na-karti">Na karti</button></li>`).join('')
      || '<li class="sitno">Niko ne dijeli lokaciju samo sa tobom.</li>';
  };
  const render = () => { renderResults(); renderChips(); renderShare(); renderReceived(); };

  // ---------- radnje ----------
  $('lok-iz-trazi').addEventListener('input', (e) => { query = e.target.value; renderResults(); });
  $('lok-iz-rezultati').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="dodaj"]');
    if (!b) return;
    setIds(addRecipient(ids(), b.closest('[data-uid]').dataset.uid));
    query = '';
    $('lok-iz-trazi').value = '';
    render();
    if (sharing()) sendNow();
  });
  $('lok-iz-izabrani').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="ukloni"]');
    if (!b) return;
    const id = b.closest('[data-uid]').dataset.uid;
    const wasSharing = Boolean(sharing());
    const next = removeRecipient(ids(), id);
    if (wasSharing) {
      queueRemoval([id]);
      if (!next.length) { saveSoft(IZABRANI_KEY, null); stopSending(); } else setIds(next);
      flushRemovals();
    } else setIds(next);
    render();
  });
  $('lok-iz-trajanje').addEventListener('click', (e) => {
    const b = e.target.closest('[data-trajanje]');
    if (b) { duration = b.dataset.trajanje; renderShare(); }
  });
  $('lok-iz-prekidac').addEventListener('click', () => {
    const sh = sharing();
    if (sh) {
      saveSoft(IZABRANI_KEY, null);
      draft = sh.ids; saveSoft(DRAFT_KEY, draft);
      stopSending();
      queueRemoval(['*']);
      flushRemovals();
      toast('Dijeljenje sa izabranim lovcima prekinuto');
    } else {
      if (!ids().length) return;
      saveSoft(IZABRANI_KEY, { ids: ids(), do: shareUntil(duration) });
      armSending();
      toast(`Lokaciju sada vide samo izabrani lovci (${ids().length})`);
    }
    render();
  });
  $('lok-iz-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="na-karti"]');
    const m = b && receivedShares(received, me()?.id, memberName, currentFix()).find((x) => x.id === b.closest('[data-uid]').dataset.uid);
    if (!m) return;
    panel.querySelector('#btn-lok-zatvori')?.click();
    map.setView([m.lat, m.lon], Math.max(map.getZoom(), 16), { animate: false });
  });

  // pri otvaranju ploče: osvježi spisak lovaca (ako ima veze) i primljene pozicije; sve ostalo radi iz keša
  new MutationObserver(() => {
    if (!isOpen()) return;
    render();
    if (online()) { refreshMembers().then(() => render()).catch(() => {}); pull(true); flushRemovals(); }
  }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  onGpsUpdate(() => { if (isOpen()) renderReceived(); });
  document.addEventListener('lokacija:postavke', () => { if (sharing()) armSending(); });

  setInterval(() => {
    const sh = activeSelectedShare(loadJSON(IZABRANI_KEY, null));
    if (!sh && loadJSON(IZABRANI_KEY, null)) { // isteklo
      saveSoft(IZABRANI_KEY, null); stopSending(); queueRemoval(['*']); toast('Dijeljenje sa izabranim lovcima je isteklo'); if (isOpen()) render();
    }
    flushRemovals();
    pull();
  }, 30000);
  if (sharing()) armSending();
  render();
}
