// Administracija korisnika. Pravo provjerava SERVER (admin_* funkcije provjeravaju je_admin());
// skrivanje u UI-ju je samo pogodnost, ne zaštita.

import { inTrial, trialLeftText } from './probni.js';
import { getClient, cachedProfile, validatePin } from './auth.js';
import { registerBackHandler, wireTwoTap, escapeHtml, toast } from './ui.js';
import { idbGet } from './db.js';
import { saveSoft } from './storage.js';
import { initialsOf } from './lokacija.js';
import { profileRoles } from './profil.js';
import { userState, STATE_LABELS, usersOverview, filterUsers, filterCounts, reviewOrder, sectionLines, USER_FILTERS, pendingBadgeText, approvableRequests, approveLabel, registeredText, roleInfo, sectionTargets, leaderTargets, keeperTargets, rolesOverview, rolesText } from './korisnici-pregled.js';
import { downloadSekcije } from './sekcije-ui.js';

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

// Otvoreni paneli "Upravljanje" ostaju otvoreni poslije ponovnog crtanja (poslije svake radnje lista se osvježi),
// a izbor u padajućim listama se pamti po korisniku (podaci sa servera stižu i dok admin bira).
const otvoreno = new Set();
const izbori = new Map();
const izbor = (uid, ime) => izbori.get(`${uid}|${ime}`) || '';

const select = (uid, ime, placeholder, options, label) => {
  const cur = izbor(uid, ime);
  return `<select data-izbor="${escapeHtml(ime)}" aria-label="${escapeHtml(label)}"><option value="">${escapeHtml(placeholder)}</option>${options.map((o) => `<option value="${escapeHtml(o.id)}"${o.id === cur ? ' selected' : ''}>${escapeHtml(o.tekst)}</option>`).join('')}</select>`;
};

function sectionsBlock(u, info, data) {
  const rows = [...info.clan.map((c) => ({ ...c, status: 'odobren' })), ...info.traze.map((c) => ({ ...c, status: 'ceka' }))];
  const targets = sectionTargets(u.id, data);
  const list = rows.map((m) => `
    <div class="kor-sek" data-sid="${escapeHtml(m.id)}" data-status="${m.status}">
      <div class="kor-sek-ime"><b>${escapeHtml(m.tekst)}</b>
        <span class="kor-cip">${m.status === 'ceka' ? 'traži ulaz' : 'član'}</span>${info.vodi.some((v) => v.id === m.id) ? '<span class="kor-cip kor-uloga">grupovođa</span>' : ''}</div>
      <div class="kor-sek-akcije">
        ${select(u.id, `cilj:${m.id}`, 'Premjesti u…', targets, `Premjesti ${u.ime} iz ${m.tekst} u`)}
        <button type="button" class="dugme" data-akcija="premjesti">Premjesti</button>
        <button type="button" class="dugme" data-akcija="ukloni-sek" data-dvaput="Dodirni ponovo — ${m.status === 'ceka' ? 'odbija zahtjev' : 'uklanja iz sekcije'}">${m.status === 'ceka' ? 'Odbij' : 'Ukloni'}</button>
      </div>
    </div>`).join('');
  const add = u.odobren && targets.length ? `
    <div class="kor-sek kor-sek-dodaj">
      <div class="kor-sek-ime"><b>Dodaj u sekciju</b></div>
      <div class="kor-sek-akcije">${select(u.id, 'dodaj', 'Izaberi sekciju…', targets, `Dodaj ${u.ime} u sekciju`)}
        <button type="button" class="dugme" data-akcija="dodaj-sek">Dodaj</button></div>
    </div>` : '';
  return `<h4 class="kor-podnaslov">Sekcije</h4>${list || '<p class="sitno">Nije član nijedne sekcije.</p>'}${add}`;
}

function rolesBlock(u, info, data, users) {
  if (!u.odobren) return '<h4 class="kor-podnaslov">Uloge</h4><p class="sitno">Uloge se dodjeljuju tek kad je nalog odobren.</p>';
  const gv = leaderTargets(u.id, users, data).map((t) => ({ id: t.id, tekst: t.trenutni ? `${t.tekst} — zamjenjuje: ${t.trenutni}` : t.tekst }));
  const lc = keeperTargets(u.id, data);
  const chips = (arr, akcija, kljuc, poruka) => arr.map((x) => `<span class="kor-uloga-red" data-${kljuc}="${escapeHtml(x.id)}"><span>${escapeHtml(x.tekst)}</span>
    <button type="button" class="dugme" data-akcija="${akcija}" data-dvaput="${escapeHtml(poruka)}">Skini</button></span>`).join('');
  return `<h4 class="kor-podnaslov">Uloge</h4>
    <div class="kor-uloga-grupa" data-grupa="gv"><b>Grupovođa sekcije</b>
      ${chips(info.vodi, 'gv-skini', 'sid', 'Dodirni ponovo — skida grupovođu') || '<span class="sitno">Nije grupovođa nijedne sekcije.</span>'}
      ${gv.length ? `<div class="kor-sek-akcije">${select(u.id, 'gv', 'Izaberi sekciju…', gv, `Postavi ${u.ime} za grupovođu sekcije`)}
        <button type="button" class="dugme" data-akcija="gv-postavi">Postavi za grupovođu</button></div>` : ''}</div>
    <div class="kor-uloga-grupa" data-grupa="lc"><b>Lovočuvar revira</b>
      ${chips(info.lovocuvar, 'lc-skini', 'revir', 'Dodirni ponovo — skida lovočuvara') || '<span class="sitno">Nije lovočuvar nijednog revira.</span>'}
      ${lc.length ? `<div class="kor-sek-akcije">${select(u.id, 'lc', 'Izaberi revir…', lc, `Postavi ${u.ime} za lovočuvara revira`)}
        <button type="button" class="dugme" data-akcija="lc-postavi">Postavi za lovočuvara</button></div>` : ''}</div>
    <div class="kor-uloga-grupa" data-grupa="admin"><b>Administrator</b>
      <button type="button" class="dugme" data-akcija="admin">${u.is_admin ? 'Ukloni admina' : 'Postavi za admina'}</button></div>`;
}

function userRow(u, meId, data, users, now = Date.now()) {
  const ja = u.id === meId;
  const state = userState(u, now);
  const reqs = approvableRequests(u.id, data);
  const odobri = ja ? '' : `<button type="button" class="dugme${u.odobren ? '' : ' glavno'}" data-akcija="odobri">${u.odobren ? 'Opozovi pristup' : approveLabel(reqs)}</button>`;
  const obrisi = ja ? '' : '<button type="button" class="dugme" data-akcija="obrisi" data-dvaput="Dodirni ponovo za brisanje">Obriši</button>';
  const sek = sectionLines(u.id, data);
  const info = roleInfo(u.id, data);
  const lines = [];
  if (state === 'probni') lines.push(`Probni period: još ${trialLeftText(u, now)}`);
  if (sek.traze.length) lines.push(`Traži ulaz: ${sek.traze.join(', ')}`);
  if (sek.clan.length) lines.push(`Član: ${sek.clan.join(', ')}`);
  if (!lines.length && state !== 'odobren' && state !== 'admin') lines.push('Nije tražio nijednu sekciju');
  const reg = registeredText(u, now);
  if (reg) lines.push(reg);
  const roles = u.odobren ? profileRoles(u, data).filter((r) => !['lovac', 'admin'].includes(r.kod)) : [];
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
      ${roles.length ? `<div class="kor-uloge">${roles.map((r) => `<span class="kor-cip kor-uloga" data-uloga="${r.kod}">${escapeHtml(r.tekst)}</span>`).join('')}</div>` : ''}
      ${lines.map((l) => `<p class="sitno kor-red">${escapeHtml(l)}</p>`).join('')}
      <div class="red-dugmadi">${odobri}</div>
      <details class="kor-vise"${otvoreno.has(u.id) ? ' open' : ''}>
        <summary>Upravljanje</summary>
        ${sectionsBlock(u, info, data)}
        ${ja ? '' : rolesBlock(u, info, data, users)}
        <h4 class="kor-podnaslov">Nalog</h4>
        <div class="red-dugmadi">
          <input name="novi-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="Novi PIN" aria-label="Novi PIN za ${escapeHtml(u.ime)}">
          <button type="button" class="dugme" data-akcija="pin">Postavi PIN</button>
        </div>
        <div class="red-dugmadi">${obrisi}</div>
      </details>
    </li>`;
}

const q = async (promise) => {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
};

export function initAdmin() {
  document.addEventListener('korisnici:promjena', renderPendingBadge);
  const panel = $('korisnici');
  const status = $('korisnici-status');
  let users = [];

  let filter = 'svi';
  let query = '';
  let sekcija = '';
  let sekData = { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [] };
  const sb = () => getClient();

  const sekcijaOpcije = () => {
    const rev = (id) => sekData.reviri.find((r) => r.id === id)?.naziv;
    const opts = sekData.sekcije.filter((x) => x.aktivno !== false)
      .map((x) => ({ id: x.id, tekst: rev(x.revir_id) ? `${x.naziv} (${rev(x.revir_id)})` : x.naziv }))
      .sort((x, y) => x.tekst.localeCompare(y.tekst, 'bs'));
    return `<option value="">Sve sekcije</option>${opts.map((o) => `<option value="${escapeHtml(o.id)}"${o.id === sekcija ? ' selected' : ''}>${escapeHtml(o.tekst)}</option>`).join('')}<option value="bez"${sekcija === 'bez' ? ' selected' : ''}>Bez sekcije</option>`;
  };

  const draw = () => {
    const me = cachedProfile()?.id;
    const now = Date.now();
    const o = usersOverview(users, now);
    $('korisnici-ceka').textContent = String(o.ceka);
    $('kor-hero-probni').textContent = String(o.probni);
    $('kor-hero-odobreni').textContent = String(o.odobreni);
    $('kor-hero-admini').textContent = String(o.admini);
    $('kor-hero-uloge').textContent = users.length ? rolesText(rolesOverview(users, sekData, now)) : '';
    const counts = filterCounts(users, now, sekData);
    $('kor-filter').innerHTML = USER_FILTERS.map(([k, naziv]) => `<button type="button" data-filter="${k}" aria-pressed="${k === filter}">${naziv} (${counts[k]})</button>`).join('');
    $('kor-sekcija').innerHTML = sekcijaOpcije();
    const shown = reviewOrder(filterUsers(users, { filter, q: query, now, data: sekData, sekcija, extra: (u) => { const s = sectionLines(u.id, sekData); return [...s.traze, ...s.clan].join(' '); } }), now);
    $('korisnici-spisak').innerHTML = shown.map((u) => userRow(u, me, sekData, users, now)).join('');
    $('korisnici-prazno').hidden = shown.length > 0 || !users.length;
    // radnje koje traže drugi dodir (brisanje, uklanjanje iz sekcije, skidanje uloge)
    $('korisnici-spisak').querySelectorAll('[data-dvaput]').forEach((b) => {
      wireTwoTap(b, b.dataset.dvaput, () => act(b));
    });
  };

  const run = async (fn, okMsg) => {
    status.textContent = 'Šaljem…';
    try {
      await fn();
      status.textContent = '';
      toast(okMsg);
      // sekcije i uloge su se promijenile: svježi podaci prije ponovnog crtanja
      try { sekData = { ...sekData, ...(await downloadSekcije()) }; } catch { /* ostaje keš */ }
      await render({ refresh: false });
    } catch (err) {
      status.textContent = err.message;
    }
  };

  const render = async ({ refresh = true } = {}) => {
    status.textContent = 'Učitavam…';
    try {
      users = await loadUsers();
      status.textContent = '';
    } catch (err) {
      status.textContent = `Nema veze sa serverom (${err.message})`;
      return;
    }
    // Sekcije iz keša (ko je gdje i ko je šta); u pozadini se osvježe sa servera, bez keša se redovi jednostavno ne prikazuju.
    try { sekData = { ...sekData, ...((await idbGet('spiskovi', 'sekcije'))?.rows || {}) }; } catch { /* keš nije obavezan */ }
    saveSoft(CEKA_KEY, usersOverview(users).ceka + usersOverview(users).probni);
    document.dispatchEvent(new CustomEvent('korisnici:promjena'));
    draw();
    if (refresh) downloadSekcije().then((d) => { sekData = { ...sekData, ...d }; draw(); }).catch(() => { /* ostaje keš */ });
  };

  // jedna radnja nad korisnikom; poziva je običan klik i drugi dodir
  const act = async (btn) => {
    const row = btn.closest('[data-id]');
    const u = users.find((x) => x.id === row?.dataset.id);
    if (!u) return;
    const sekRow = btn.closest('[data-sid]');
    const val = (ime) => row.querySelector(`select[data-izbor="${ime}"]`)?.value || '';
    const led = (sid) => sekData.sekcije.find((x) => x.id === sid);
    const need = (v, poruka) => { if (!v) status.textContent = poruka; return Boolean(v); };
    switch (btn.dataset.akcija) {
      case 'odobri': {
        const reqs = u.odobren ? [] : approvableRequests(u.id, sekData);
        await run(async () => {
          await callRpc('admin_odobri', { p_korisnik: u.id, p_odobren: !u.odobren });
          // Odobren nalog sa zahtjevom za sekciju: odmah ga primi u traženu sekciju (admin smije; inače bi čekao u drugom ekranu).
          for (const r of reqs) {
            const { error } = await sb().from('sekcija_clanovi').update({ status: 'odobren' }).eq('sekcija_id', r.sekcija_id).eq('korisnik_id', u.id);
            if (error) throw new Error(`Nalog je odobren, ali prijem u sekciju nije uspio: ${error.message}`);
          }
        }, u.odobren ? 'Pristup opozvan' : reqs.length ? 'Korisnik odobren i primljen u sekciju' : 'Korisnik odobren');
        break;
      }
      case 'obrisi':
        await run(() => callRpc('admin_obrisi_korisnika', { p_korisnik: u.id }), 'Korisnik obrisan');
        break;
      case 'admin':
        await run(() => callRpc('admin_postavi_ulogu', { p_korisnik: u.id, p_admin: !u.is_admin }), 'Uloga promijenjena');
        break;
      case 'pin': {
        const pin = row.querySelector('input[name="novi-pin"]').value;
        const err = validatePin(pin);
        if (err) { status.textContent = err; return; }
        await run(() => callRpc('admin_reset_pin', { p_korisnik: u.id, p_pin: pin }), 'PIN promijenjen');
        break;
      }
      case 'premjesti': {
        const from = sekRow?.dataset.sid;
        const to = sekRow?.querySelector('select[data-izbor^="cilj:"]')?.value;
        if (!need(to, 'Izaberi sekciju u koju se premješta')) return;
        if (sekRow.dataset.status === 'ceka') {
          // zahtjev: server prebacuje i bilježi odluku "prebačen" (podnosilac dobija obavijest)
          await run(() => callRpc('premjesti_zahtjev', { p_iz: from, p_u: to, p_korisnik: u.id }), 'Zahtjev prebačen u drugu sekciju');
        } else {
          // član: prvo upis u novu sekciju, pa brisanje iz stare (ako pukne usred puta, ostaje u obje, ništa se ne gubi)
          await run(async () => {
            await q(sb().from('sekcija_clanovi').insert({ sekcija_id: to, korisnik_id: u.id, status: 'odobren' }));
            await q(sb().from('sekcija_clanovi').delete().eq('sekcija_id', from).eq('korisnik_id', u.id));
            if (led(from)?.grupovodja_id === u.id) await q(sb().from('sekcije').update({ grupovodja_id: null }).eq('id', from));
          }, `Premješten u ${sekcijaNaziv(to)}`);
        }
        break;
      }
      case 'ukloni-sek': {
        const from = sekRow?.dataset.sid;
        await run(async () => {
          await q(sb().from('sekcija_clanovi').delete().eq('sekcija_id', from).eq('korisnik_id', u.id));
          if (led(from)?.grupovodja_id === u.id) await q(sb().from('sekcije').update({ grupovodja_id: null }).eq('id', from));
        }, sekRow.dataset.status === 'ceka' ? 'Zahtjev odbijen' : 'Uklonjen iz sekcije');
        break;
      }
      case 'dodaj-sek': {
        const to = val('dodaj');
        if (!need(to, 'Izaberi sekciju')) return;
        await run(() => q(sb().from('sekcija_clanovi').insert({ sekcija_id: to, korisnik_id: u.id, status: 'odobren' })), `Dodan u ${sekcijaNaziv(to)}`);
        break;
      }
      case 'gv-postavi': {
        const to = val('gv');
        if (!need(to, 'Izaberi sekciju')) return;
        await run(() => q(sb().from('sekcije').update({ grupovodja_id: u.id }).eq('id', to)), `${u.ime} ${u.prezime} je grupovođa: ${sekcijaNaziv(to)}`);
        break;
      }
      case 'gv-skini': {
        const sid = btn.closest('[data-sid]').dataset.sid;
        await run(() => q(sb().from('sekcije').update({ grupovodja_id: null }).eq('id', sid).eq('grupovodja_id', u.id)), 'Grupovođa skinut sa sekcije');
        break;
      }
      case 'lc-postavi': {
        const to = val('lc');
        if (!need(to, 'Izaberi revir')) return;
        await run(() => q(sb().from('revir_lovocuvari').insert({ korisnik_id: u.id, revir_id: to })), `${u.ime} ${u.prezime} je lovočuvar revira`);
        break;
      }
      case 'lc-skini': {
        const rid = btn.closest('[data-revir]').dataset.revir;
        await run(() => q(sb().from('revir_lovocuvari').delete().eq('korisnik_id', u.id).eq('revir_id', rid)), 'Lovočuvar skinut sa revira');
        break;
      }
      default:
    }
  };
  const sekcijaNaziv = (id) => sekData.sekcije.find((x) => x.id === id)?.naziv || 'sekciju';

  $('korisnici-spisak').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-akcija]');
    if (!btn || btn.dataset.dvaput) return;
    act(btn);
  });
  $('korisnici-spisak').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-izbor]');
    const id = sel?.closest('[data-id]')?.dataset.id;
    if (id) izbori.set(`${id}|${sel.dataset.izbor}`, sel.value);
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
  $('kor-sekcija').addEventListener('change', (e) => { sekcija = e.target.value; draw(); });
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
