// Administracija korisnika. Pravo provjerava SERVER (admin_* funkcije provjeravaju je_admin());
// skrivanje u UI-ju je samo pogodnost, ne zaštita.

import { inTrial, trialLeftText } from './probni.js';
import { getClient, cachedProfile, validatePin } from './auth.js';
import { registerBackHandler, wireTwoTap, escapeHtml, toast } from './ui.js';
import { describeProfile } from './postavke.js';

const $ = (id) => document.getElementById(id);

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

function userRow(u, meId) {
  const ja = u.id === meId;
  const odobri = ja ? '' : `<button type="button" class="dugme${u.odobren ? '' : ' glavno'}" data-akcija="odobri">${u.odobren ? 'Opozovi' : 'Odobri'}</button>`;
  const obrisi = ja ? '' : '<button type="button" class="dugme" data-akcija="obrisi">Obriši</button>';
  return `
    <li class="trag-red" data-id="${escapeHtml(u.id)}">
      <div class="trag-naslov"><b>${escapeHtml(describeProfile(u))}</b>${ja ? '<span class="sitno">(ti)</span>' : ''}${!u.odobren && inTrial(u) ? `<span class="sitno">Probni period: još ${trialLeftText(u)}</span>` : ''}</div>
      <div class="red-dugmadi">
        ${odobri}
        <button type="button" class="dugme" data-akcija="admin">${u.is_admin ? 'Ukloni admina' : 'Postavi za admina'}</button>
        ${obrisi}
      </div>
      <div class="red-dugmadi">
        <input name="novi-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Novi PIN" aria-label="Novi PIN za ${escapeHtml(u.ime)}">
        <button type="button" class="dugme" data-akcija="pin">Postavi PIN</button>
      </div>
    </li>`;
}

export function initAdmin() {
  const panel = $('korisnici');
  const status = $('korisnici-status');
  let users = [];

  const render = async () => {
    status.textContent = 'Učitavam…';
    try {
      users = await loadUsers();
      status.textContent = '';
    } catch (err) {
      status.textContent = `Nema veze sa serverom (${err.message})`;
      return;
    }
    const me = cachedProfile()?.id;
    $('korisnici-ceka').textContent = `Čeka odobrenje: ${users.filter((u) => !u.odobren).length}`;
    const ul = $('korisnici-spisak');
    ul.innerHTML = users.map((u) => userRow(u, me)).join('');
    ul.querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo za brisanje', async () => {
        await run(() => callRpc('admin_obrisi_korisnika', { p_korisnik: b.closest('[data-id]').dataset.id }), 'Korisnik obrisan');
      });
    });
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

// Prikaz admin dijela postavki prema keširanom profilu (server svejedno provjerava).
export function refreshAdminVisibility() {
  const sec = $('postavke-admin');
  if (sec) sec.hidden = !cachedProfile()?.is_admin;
}
