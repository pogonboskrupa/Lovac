// Administracija korisnika. Pravo provjerava SERVER (admin_* funkcije provjeravaju je_admin());
// skrivanje u UI-ju je samo pogodnost, ne zaštita.

import { inTrial, trialLeftText } from './probni.js';
import { getClient, cachedProfile, validatePin } from './auth.js';
import { registerBackHandler, wireTwoTap, escapeHtml, toast } from './ui.js';
import { idbGet } from './db.js';
import { saveSoft } from './storage.js';
import { initialsOf } from './lokacija.js';
import { profileRoles } from './profil.js';
import { userState, STATE_LABELS, usersOverview, filterUsers, filterCounts, reviewOrder, sectionLines, USER_FILTERS, pendingBadgeText, approvableRequests, approveLabel, registeredText, roleInfo, sectionTargets, leaderTargets, rolesOverview, rolesText } from './korisnici-pregled.js';
import { downloadSekcije } from './sekcije-ui.js';
import { assignRole } from './uloge-dodjela.js';
import { drustvoSlot, revirVodjaTargets, ULOGA_LOVOCUVAR, ULOGA_LOVOVODJA_DRUSTVA } from './hijerarhija.js';

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
        <span class="kor-cip">${m.status === 'ceka' ? 'traži ulaz' : 'član'}</span>${info.vodi.some((v) => v.id === m.id) ? '<span class="kor-cip kor-uloga">lovovođa sekcije</span>' : ''}</div>
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

const imeKorisnika = (users, id) => { const x = users.find((u) => u.id === id); return x ? `${x.ime} ${x.prezime}` : ''; };

// Lovočuvar društva / lovovođa društva: jedno dugme (postavi / skini); kad je mjesto puno kaže ko ga drži.
function drustvoGrupa(u, data, grupa, uloga, naslov, napomena, users) {
  const slot = drustvoSlot(u.id, uloga, data.drustvoUloge || [], (id) => imeKorisnika(users, id));
  const tijelo = slot.ima
    ? `<span class="kor-uloga-red"><span>${escapeHtml(naslov)}</span><button type="button" class="dugme" data-akcija="${grupa}-skini" data-dvaput="Dodirni ponovo — skida ulogu">Skini</button></span>`
    : slot.slobodno
      ? `<button type="button" class="dugme" data-akcija="${grupa}-postavi">Postavi za: ${escapeHtml(naslov)}</button>`
      : `<span class="sitno">Mjesto je popunjeno (${escapeHtml(slot.zauzeli.join(', '))}). Prvo skini postojećeg.</span>`;
  return `<div class="kor-uloga-grupa" data-grupa="${grupa}"><b>${escapeHtml(naslov)}</b><span class="sitno">${escapeHtml(napomena)}</span>${tijelo}</div>`;
}

// Grupovođa grupe: grupa nema naziv, pa su redovi sekcije u kojima korisnik vodi grupu; postavlja se u sekciji u kojoj je član.
function grupaGrupa(u, data) {
  const naziv = (id) => (data.sekcije || []).find((x) => x.id === id)?.naziv || 'sekcija';
  const vodi = (data.grupe || []).filter((g) => g.grupovodja_id === u.id);
  const mete = (data.sekcije || []).filter((sek) => sek.aktivno !== false
    && (data.clanovi || []).some((c) => c.sekcija_id === sek.id && c.korisnik_id === u.id && c.status === 'odobren')
    && !vodi.some((g) => g.sekcija_id === sek.id)).map((sek) => ({ id: sek.id, tekst: sek.naziv }));
  const chips = vodi.map((g) => `<span class="kor-uloga-red" data-gid="${escapeHtml(g.id)}"><span>${escapeHtml(naziv(g.sekcija_id))}</span>
    <button type="button" class="dugme" data-akcija="gg-skini" data-dvaput="Dodirni ponovo — uklanja grupu (lovci ostaju bez grupe)">Skini</button></span>`).join('');
  return `<div class="kor-uloga-grupa" data-grupa="gg"><b>Grupovođa grupe</b><span class="sitno">Grupa nema naziv; vodi je grupovođa. Mora biti član sekcije.</span>
    ${chips || '<span class="sitno">Ne vodi nijednu grupu.</span>'}
    ${mete.length ? `<div class="kor-sek-akcije">${select(u.id, 'gg', 'Izaberi sekciju…', mete, `Postavi ${u.ime} za grupovođu grupe`)}
      <button type="button" class="dugme" data-akcija="gg-postavi">Postavi za grupovođu grupe</button></div>` : ''}</div>`;
}

// Lovovođa revira: jedan po reviru; imenovanje zamjenjuje sadašnjeg.
function revirVodjaGrupa(u, data, users) {
  const mine = (data.revirVodje || []).filter((v) => v.korisnik_id === u.id);
  const naziv = (id) => (data.reviri || []).find((r) => r.id === id)?.naziv || 'revir';
  const targets = revirVodjaTargets(u.id, data.reviri || [], data.revirVodje || [], (id) => imeKorisnika(users, id))
    .map((t) => ({ id: t.id, tekst: t.trenutni ? `${t.tekst} — zamjenjuje: ${t.trenutni}` : t.tekst }));
  const chips = mine.map((v) => `<span class="kor-uloga-red" data-revir="${escapeHtml(v.revir_id)}"><span>${escapeHtml(naziv(v.revir_id))}</span>
    <button type="button" class="dugme" data-akcija="lvr-skini" data-dvaput="Dodirni ponovo — skida lovovođu revira">Skini</button></span>`).join('');
  return `<div class="kor-uloga-grupa" data-grupa="lvr"><b>Lovovođa revira</b><span class="sitno">Jedan po reviru; organizuje lov u svom reviru.</span>
    ${chips || '<span class="sitno">Nije lovovođa nijednog revira.</span>'}
    ${targets.length ? `<div class="kor-sek-akcije">${select(u.id, 'lvr', 'Izaberi revir…', targets, `Postavi ${u.ime} za lovovođu revira`)}
      <button type="button" class="dugme" data-akcija="lvr-postavi">Postavi za lovovođu revira</button></div>` : ''}</div>`;
}

function rolesBlock(u, info, data, users) {
  if (!u.odobren) return '<h4 class="kor-podnaslov">Uloge</h4><p class="sitno">Uloge se dodjeljuju tek kad je nalog odobren.</p>';
  const gv = leaderTargets(u.id, users, data).map((t) => ({ id: t.id, tekst: t.trenutni ? `${t.tekst} — zamjenjuje: ${t.trenutni}` : t.tekst }));
  const chips = (arr, akcija, kljuc, poruka) => arr.map((x) => `<span class="kor-uloga-red" data-${kljuc}="${escapeHtml(x.id)}"><span>${escapeHtml(x.tekst)}</span>
    <button type="button" class="dugme" data-akcija="${akcija}" data-dvaput="${escapeHtml(poruka)}">Skini</button></span>`).join('');
  return `<h4 class="kor-podnaslov">Uloge</h4>
    <div class="kor-uloga-grupa" data-grupa="gv"><b>Lovovođa sekcije</b>
      ${chips(info.vodi, 'gv-skini', 'sid', 'Dodirni ponovo — skida lovovođu sekcije') || '<span class="sitno">Nije lovovođa sekcije nijedne sekcije.</span>'}
      ${gv.length ? `<div class="kor-sek-akcije">${select(u.id, 'gv', 'Izaberi sekciju…', gv, `Postavi ${u.ime} za lovovođu sekcije`)}
        <button type="button" class="dugme" data-akcija="gv-postavi">Postavi za lovovođu sekcije</button></div>` : ''}</div>
    ${grupaGrupa(u, data)}
    ${drustvoGrupa(u, data, 'lcd', ULOGA_LOVOCUVAR, 'Lovočuvar društva', 'Radi na cijelom području; društvo ima najviše 2 lovočuvara.', users)}
    ${drustvoGrupa(u, data, 'ldd', ULOGA_LOVOVODJA_DRUSTVA, 'Lovovođa društva', 'Glavni lovovođa; društvo ima samo jednog.', users)}
    ${revirVodjaGrupa(u, data, users)}
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
  let sekData = { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [], drustvoUloge: [], revirVodje: [], grupe: [] };
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
      try { sekData = { ...sekData, ...(await downloadSekcije({ grupe: true })) }; } catch { /* ostaje keš */ }
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
    if (refresh) downloadSekcije({ grupe: true }).then((d) => { sekData = { ...sekData, ...d }; draw(); }).catch(() => { /* ostaje keš */ });
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
        await run(() => q(sb().from('sekcije').update({ grupovodja_id: u.id }).eq('id', to)), `${u.ime} ${u.prezime} je lovovođa sekcije: ${sekcijaNaziv(to)}`);
        break;
      }
      case 'gv-skini': {
        const sid = btn.closest('[data-sid]').dataset.sid;
        await run(() => q(sb().from('sekcije').update({ grupovodja_id: null }).eq('id', sid).eq('grupovodja_id', u.id)), 'Lovovođa sekcije skinut sa sekcije');
        break;
      }
      case 'gg-postavi': {
        const to = val('gg');
        if (!need(to, 'Izaberi sekciju')) return;
        const sek = sekData.sekcije.find((x) => x.id === to);
        await run(() => assignRole(sb(), 'grupovodja_grupe', { userId: u.id, sekcija: sek }), `${u.ime} ${u.prezime} je grupovođa grupe: ${sekcijaNaziv(to)}`);
        break;
      }
      case 'gg-skini': {
        const gid = btn.closest('[data-gid]').dataset.gid;
        await run(() => q(sb().from('grupe').delete().eq('id', gid)), 'Grupa je uklonjena');
        break;
      }
      case 'lcd-postavi':
        await run(() => q(sb().from('drustvo_uloge').insert({ korisnik_id: u.id, uloga: ULOGA_LOVOCUVAR })), `${u.ime} ${u.prezime} je lovočuvar društva`);
        break;
      case 'lcd-skini':
        await run(() => q(sb().from('drustvo_uloge').delete().eq('korisnik_id', u.id).eq('uloga', ULOGA_LOVOCUVAR)), 'Lovočuvar društva skinut');
        break;
      case 'ldd-postavi':
        await run(() => q(sb().from('drustvo_uloge').insert({ korisnik_id: u.id, uloga: ULOGA_LOVOVODJA_DRUSTVA })), `${u.ime} ${u.prezime} je lovovođa društva`);
        break;
      case 'ldd-skini':
        await run(() => q(sb().from('drustvo_uloge').delete().eq('korisnik_id', u.id).eq('uloga', ULOGA_LOVOVODJA_DRUSTVA)), 'Lovovođa društva skinut');
        break;
      case 'lvr-postavi': {
        const to = val('lvr');
        if (!need(to, 'Izaberi revir')) return;
        await run(async () => {
          // jedan lovovođa po reviru: sadašnji se prvo skida (server to traži), pa ide novi
          await q(sb().from('revir_vodje').delete().eq('revir_id', to));
          await q(sb().from('revir_vodje').insert({ revir_id: to, korisnik_id: u.id }));
        }, `${u.ime} ${u.prezime} je lovovođa revira`);
        break;
      }
      case 'lvr-skini': {
        const rid = btn.closest('[data-revir]').dataset.revir;
        await run(() => q(sb().from('revir_vodje').delete().eq('korisnik_id', u.id).eq('revir_id', rid)), 'Lovovođa revira skinut');
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
  $('btn-korisnici-novi').addEventListener('click', () => document.dispatchEvent(new CustomEvent('lovac:novi', {})));
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
