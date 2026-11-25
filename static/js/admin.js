// Administracija korisnika. Pravo provjerava SERVER (admin_* funkcije provjeravaju je_admin());
// skrivanje u UI-ju je samo pogodnost, ne zaštita.

import { inTrial, trialLeftText } from './probni.js';
import { getClient, cachedProfile, validatePin } from './auth.js';
import { registerBackHandler, wireTwoTap, escapeHtml, toast } from './ui.js';
import { idbGet } from './db.js';
import { saveSoft } from './storage.js';
import { initialsOf } from './lokacija.js';
import { userState, STATE_LABELS, usersOverview, filterUsers, filterCounts, reviewOrder, sectionLines, USER_FILTERS, pendingBadgeText } from './korisnici-pregled.js';

const $ = (id) => document.getElementById(id);
export const CEKA_KEY = 'lovac.korisnici.cekaju';

// Neodobreni prvi (njih admin traži), zatim po prezimenu.
export function sortUsers(users) {
  return [...users].sort((a, b) => (a.odobren - b.odobren)
    || String(a.prezime).localeCompare(String(b.prezime), 'bs')
    || String(a.ime).localeCompare(String(b.ime), 'bs'));
}

async function callRpc(fn, args) {
  const sb = getClient();
  if (!sb) throw new Error('Server nije podešen');
  const { error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
}

async function loadUsers() {
  const sb = getClient();
  if (!sb) throw new Error('Server nije podešen');
  const { data, error } = await sb.from('korisnici').select('*');
  if (error) throw new Error(error.message);
  return sortUsers(data || []);
}

// Otvoreni paneli "Više radnji" ostaju otvoreni poslije ponovnog crtanja (poslije svake radnje lista se osvježi).
const otvoreno = new Set();

function userRow(u, meId, data, now = Date.now()) {
  const ja = u.id === meId;
  const state = userState(u, now);
  const odobri = ja ? '' : `<button type="button" class="dugme${u.odobren ? '' : ' glavno'}" data-akcija="odobri">${u.odobren ? 'Opozovi pristup' : 'Odobri'}</button>`;
  const obrisi = ja ? '' : '<button type="button" class="dugme" data-akcija="obrisi">Obriši</button>';
  const sek = sectionLines(u.id, data);
  const lines = [];
  if (state === 'probni') lines.push(`Probni period: još ${trialLeftText(u, now)}`);
  if (sek.traze.length) lines.push(`Traži ulaz: ${sek.traze.join(', ')}`);
  if (sek.clan.length) lines.push(`Član: ${sek.clan.join(', ')}`);
  if (!lines.length && state !== 'odobren' && state !== 'admin') lines.push('Nije tražio nijednu sekciju');
  const name = `${u.ime} ${u.prezime}${u.nadimak ? ` (${u.nadimak})` : ''}`;
  return `
    <li class="trag-red tr-kartica kor-kartica" data-id="${escapeHtml(u.id)}" data-stanje="${state}">
      <div class="kor-glava">
        <span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(`${u.ime} ${u.prezime}`))}</span>
        <div class="kor-tekst">
          <b>${escapeHtml(name)}</b>${ja ? ' <span class="sitno">(ti)</span>' : ''}
          <span class="kor-cip" data-stanje="${state}">${STATE_LABELS[state]}</span>
        </div>
      </div>
      ${lines.map((l) => `<p class="sitno kor-red">${escapeHtml(l)}</p>`).join('')}
      <div class="red-dugmadi">${odobri}</div>
      <details class="kor-vise"${otvoreno.has(u.id) ? ' open' : ''}>
        <summary>Više radnji</summary>
        <div class="red-dugmadi">
          <button type="button" class="dugme" data-akcija="admin">${u.is_admin ? 'Ukloni admina' : 'Postavi za admina'}</button>
          ${obrisi}
        </div>
        <div class="red-dugmadi">
          <input name="novi-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Novi PIN" aria-label="Novi PIN za ${escapeHtml(u.ime)}">
          <button type="button" class="dugme" data-akcija="pin">Postavi PIN</button>
        </div>
      </details>
    </li>`;
}

export function initAdmin() {
  document.addEventListener('korisnici:promjena', renderPendingBadge);
  const panel = $('korisnici');
  const status = $('korisnici-status');
  let users = [];

  let filter = 'svi';
  let query = '';
  let sekData = { reviri: [], sekcije: [], clanovi: [] };
  const draw = () => {
    const me = cachedProfile()?.id;
    const now = Date.now();
    const o = usersOverview(users, now);
    $('korisnici-ceka').textContent = String(o.ceka);
    $('kor-hero-probni').textContent = String(o.probni);
    $('kor-hero-odobreni').textContent = String(o.odobreni);
    $('kor-hero-admini').textContent = String(o.admini);
    const counts = filterCounts(users, now);
    $('kor-filter').innerHTML = USER_FILTERS.map(([k, naziv]) => `<button type="button" data-filter="${k}" aria-pressed="${k === filter}">${naziv} (${counts[k]})</button>`).join('');
    const shown = reviewOrder(filterUsers(users, { filter, q: query, now, extra: (u) => { const s = sectionLines(u.id, sekData); return [...s.traze, ...s.clan].join(' '); } }), now);
    $('korisnici-spisak').innerHTML = shown.map((u) => userRow(u, me, sekData, now)).join('');
    $('korisnici-prazno').hidden = shown.length > 0 || !users.length;
    $('korisnici-spisak').querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo za brisanje', async () => {
        await run(() => callRpc('admin_obrisi_korisnika', { p_korisnik: b.closest('[data-id]').dataset.id }), 'Korisnik obrisan');
      });
    });
  };

  const render = async () => {
    status.textContent = 'Učitavam…';
    try {
      users = await loadUsers();
      status.textContent = '';
    } catch (err) {
      status.textContent = `Nema veze sa serverom (${err.message})`;
      return;
    }
    // Sekcije iz keša (koga traži koju sekciju); bez keša se red jednostavno ne prikazuje.
    try { sekData = { reviri: [], sekcije: [], clanovi: [], ...((await idbGet('spiskovi', 'sekcije'))?.rows || {}) }; } catch { /* keš nije obavezan */ }
    saveSoft(CEKA_KEY, usersOverview(users).ceka + usersOverview(users).probni);
    document.dispatchEvent(new CustomEvent('korisnici:promjena'));
    draw();
  };

  const run = async (fn, okMsg) => {
    status.textContent = 'Šaljem…';
    try {
      await fn();
      status.textContent = '';
      toast(okMsg);
      await render();
    } catch (err) {
      status.textContent = err.message;
    }
  };

  $('korisnici-spisak').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-akcija]');
    if (!btn || btn.dataset.akcija === 'obrisi') return;
    const row = btn.closest('[data-id]');
    const u = users.find((x) => x.id === row.dataset.id);
    if (!u) return;
    if (btn.dataset.akcija === 'odobri') {
      await run(() => callRpc('admin_odobri', { p_korisnik: u.id, p_odobren: !u.odobren }), u.odobren ? 'Pristup opozvan' : 'Korisnik odobren');
    } else if (btn.dataset.akcija === 'admin') {
      await run(() => callRpc('admin_postavi_ulogu', { p_korisnik: u.id, p_admin: !u.is_admin }), 'Uloga promijenjena');
    } else if (btn.dataset.akcija === 'pin') {
      const pin = row.querySelector('input[name="novi-pin"]').value;
      const err = validatePin(pin);
      if (err) { status.textContent = err; return; }
      await run(() => callRpc('admin_reset_pin', { p_korisnik: u.id, p_pin: pin }), 'PIN promijenjen');
    }
  });

  $('korisnici-spisak').addEventListener('toggle', (e) => {
    const id = e.target.closest?.('[data-id]')?.dataset.id;
    if (!id || !e.target.matches('details.kor-vise')) return;
    if (e.target.open) otvoreno.add(id); else otvoreno.delete(id);
  }, true);
  $('kor-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) { filter = b.dataset.filter; draw(); }
  });
  $('kor-trazi').addEventListener('input', (e) => { query = e.target.value; draw(); });

  $('btn-korisnici').addEventListener('click', async () => {
    $('postavke').hidden = true;
    panel.hidden = false;
    await render();
  });
  $('btn-korisnici-zatvori').addEventListener('click', () => { panel.hidden = true; });
  $('btn-korisnici-osvjezi').addEventListener('click', render);
  registerBackHandler(() => {
    if (panel.hidden) return false;
    panel.hidden = true;
    return true;
  });
}

// Značka na dugmetu "Korisnici i odobrenja": koliko ih čeka odluku (iz zadnjeg učitavanja, bez dodatnih zahtjeva).
export function renderPendingBadge() {
  const el = $('korisnici-znacka');
  if (!el) return;
  let n = 0;
  try { n = Number(JSON.parse(localStorage.getItem(CEKA_KEY) || '0')) || 0; } catch { /* nije bitno */ }
  el.textContent = pendingBadgeText(n);
  el.hidden = n <= 0;
}

// Prikaz admin dijela postavki prema keširanom profilu (server svejedno provjerava).
export function refreshAdminVisibility() {
  const sec = $('postavke-admin');
  if (sec) sec.hidden = !cachedProfile()?.is_admin;
  renderPendingBadge();
}
