// Ekran "Sekcije i pristup": reviri -> sekcije, zahtjev za pristup, odobravanje (grupovođa/admin),
// pravljenje sekcije sa spiskom lovaca i (admin) određivanje grupovođa. Server provodi sva prava.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { refreshMembers, memberName } from './dijeljenje-ui.js';
import {
  myStatus, pristupText, canManage, creatableRevirIds, groupByRevir, pendingRequests, candidatesToAdd, validateSekcija, mySectionsAsLeader,
} from './sekcije.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';

const CACHE_ID = 'sekcije';
export const MOJE_SEKCIJE_KEY = 'lovac.moje_sekcije';
const $ = (id) => document.getElementById(id);

async function qSek(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

export async function downloadSekcije() {
  const sb = getClient();
  const data = {
    reviri: await qSek(sb.from('reviri').select('*')),
    sekcije: await qSek(sb.from('sekcije').select('*')),
    clanovi: await qSek(sb.from('sekcija_clanovi').select('*')),
    grupovodje: await qSek(sb.from('grupovodje').select('*')),
    preuzeto: Date.now(),
  };
  await idbPut('spiskovi', { id: CACHE_ID, rows: data });
  const me = cachedProfile();
  saveSoft(MOJE_SEKCIJE_KEY, mySectionsAsLeader(data.sekcije, me?.id).map((s) => s.id));
  return data;
}

export async function cachedSekcije() {
  const c = await idbGet('spiskovi', CACHE_ID);
  return c?.rows || { reviri: [], sekcije: [], clanovi: [], grupovodje: [] };
}

const opt = (id, label, sel) => `<option value="${escapeHtml(id)}" ${sel ? 'selected' : ''}>${escapeHtml(label)}</option>`;

export function initSekcije() {
  const screen = $('sekcije');
  const form = $('sekcija-forma');
  let data = { reviri: [], sekcije: [], clanovi: [], grupovodje: [] };
  const otvoreno = new Set(); // paneli "Upravljanje" ostaju otvoreni poslije svake radnje
  const me = () => cachedProfile();
  const users = () => loadJSON('lovac.clanovi', []);

  const run = async (fn, ok) => {
    $('sekcije-status').textContent = 'Šaljem…';
    try {
      await fn();
      if (ok) toast(ok);
      await load(false);
    } catch (err) {
      $('sekcije-status').textContent = `Nije uspjelo (potreban je internet): ${err.message}`;
    }
  };

  const manageHtml = (s) => {
    const members = data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren');
    const pending = pendingRequests(s.id, data.clanovi);
    const candidates = candidatesToAdd(s, data.clanovi, users());
    const isAdmin = Boolean(me()?.is_admin);
    return `<details class="uprava" ${otvoreno.has(s.id) ? 'open' : ''}><summary>Upravljanje sekcijom${pending.length ? ` · zahtjeva: ${pending.length}` : ''}</summary>
      ${pending.length ? `<h4>Zahtjevi za pristup</h4><ul class="spisak">${pending.map((c) => `<li class="trag-red" data-uid="${escapeHtml(c.korisnik_id)}">
        <b>${escapeHtml(memberName(c.korisnik_id))}</b>
        <div class="red-dugmadi"><button type="button" class="dugme glavno" data-akcija="odobri">Odobri</button>
        <button type="button" class="dugme" data-akcija="odbij">Odbij</button></div></li>`).join('')}</ul>` : '<p class="sitno">Nema zahtjeva na čekanju.</p>'}
      <h4>Članovi (${members.length})</h4>
      <ul class="spisak">${members.map((c) => `<li class="trag-red" data-uid="${escapeHtml(c.korisnik_id)}"><b>${escapeHtml(memberName(c.korisnik_id))}</b>
        <button type="button" class="dugme" data-akcija="ukloni">Ukloni</button></li>`).join('') || '<li class="sitno">Nema članova.</li>'}</ul>
      <h4>Dodaj lovce sa spiska</h4>
      <div class="clanovi" data-spisak>${candidates.map((u) => `<label class="red-check"><input type="checkbox" value="${escapeHtml(u.id)}"> ${escapeHtml(memberName(u.id))}</label>`).join('')
    || '<p class="sitno">Nema lovaca za dodavanje (spisak se preuzima uz internet).</p>'}</div>
      <button type="button" class="dugme" data-akcija="dodaj">Dodaj izabrane</button>
      <label>Naziv sekcije<input data-naziv value="${escapeHtml(s.naziv)}" maxlength="60"></label>
      <button type="button" class="dugme" data-akcija="naziv">Sačuvaj naziv</button>
      ${isAdmin ? `<label>Grupovođa<select data-gv><option value="">— niko —</option>${users().map((u) => opt(u.id, memberName(u.id), u.id === s.grupovodja_id)).join('')}</select></label>
        <label>Lovočuvar<select data-lc><option value="">— niko —</option>${users().map((u) => opt(u.id, memberName(u.id), u.id === s.lovocuvar_id)).join('')}</select></label>
        <button type="button" class="dugme" data-akcija="uloge">Sačuvaj grupovođu i lovočuvara</button>` : ''}
      <button type="button" class="dugme" data-akcija="sakrij">Sakrij sekciju</button>
    </details>`;
  };

  const cardHtml = (s) => {
    const st = myStatus(s, data.clanovi, me()?.id, Boolean(me()?.is_admin));
    const members = data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren');
    const memberList = ['clan', 'grupovodja', 'lovocuvar', 'admin'].includes(st) && members.length
      ? `<span class="sitno">Članovi: ${members.map((c) => escapeHtml(memberName(c.korisnik_id))).join(', ')}</span>` : '';
    const buttons = st === 'nema' ? '<button type="button" class="dugme glavno" data-akcija="zatrazi">Zatraži pristup</button>'
      : st === 'ceka' ? '<button type="button" class="dugme" data-akcija="povuci">Povuci zahtjev</button>'
        : st === 'clan' ? '<button type="button" class="dugme" data-akcija="napusti">Napusti sekciju</button>' : '';
    return `<li class="trag-red sekcija-kartica" data-id="${escapeHtml(s.id)}" data-pristup="${st}">
      <div class="trag-naslov"><b>${escapeHtml(s.naziv)}</b>
        <span class="sitno">Grupovođa: ${s.grupovodja_id ? escapeHtml(memberName(s.grupovodja_id)) : '—'} · Lovočuvar: ${s.lovocuvar_id ? escapeHtml(memberName(s.lovocuvar_id)) : '—'}</span>
        <span class="pristup-status" data-status="${st}">${escapeHtml(pristupText(st))}</span>${memberList}</div>
      <div class="red-dugmadi">${buttons}</div>
      ${canManage(s, me()) ? manageHtml(s) : ''}
    </li>`;
  };

  const render = () => {
    const admin = Boolean(me()?.is_admin);
    $('btn-sekcija-nova').hidden = !creatableRevirIds(me(), data.grupovodje, data.reviri).length;
    $('grupovodje-blok').hidden = !admin;
    if (admin) {
      $('grupovodje-spisak').innerHTML = data.grupovodje.map((g) => `<li class="trag-red" data-uid="${escapeHtml(g.korisnik_id)}" data-revir="${escapeHtml(g.revir_id)}">
        <b>${escapeHtml(memberName(g.korisnik_id))}</b> <span class="sitno">${escapeHtml(data.reviri.find((r) => r.id === g.revir_id)?.naziv || '')}</span>
        <button type="button" class="dugme" data-akcija="ukloni-gv">Ukloni</button></li>`).join('') || '<li class="sitno">Još nema grupovođa.</li>';
      $('grupovodja-korisnik').innerHTML = users().map((u) => opt(u.id, memberName(u.id))).join('');
      $('grupovodja-revir').innerHTML = data.reviri.map((r) => opt(r.id, r.naziv)).join('');
    }
    $('sekcije-spisak').innerHTML = groupByRevir(data.reviri, data.sekcije).map(({ revir, sekcije }) => `
      <h3>Revir ${escapeHtml(revir.naziv)}</h3>
      <ul class="spisak">${sekcije.map(cardHtml).join('') || '<li class="sitno">Nema sekcija u ovom reviru.</li>'}</ul>`).join('');
  };

  // Pri otvaranju ekrana odmah se crta keš; poslije radnje samo jednom, sa svježim podacima servera.
  const load = async (showCache = true) => {
    if (showCache) {
      data = await cachedSekcije();
      render();
    }
    try {
      await refreshMembers().catch(() => {});
      data = await downloadSekcije();
      $('sekcije-status').textContent = '';
    } catch (err) {
      $('sekcije-status').textContent = `Nema veze sa serverom — prikazan je keš (${err.message})`;
    }
    render();
  };

  $('sekcije-spisak').addEventListener('toggle', (e) => {
    const sid = e.target.closest?.('[data-id]')?.dataset.id;
    if (!sid || !e.target.matches('details.uprava')) return;
    if (e.target.open) otvoreno.add(sid); else otvoreno.delete(sid);
  }, true);

  // ---- akcije nad karticama ----
  $('sekcije-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-akcija]');
    if (!b) return;
    const card = b.closest('[data-id]');
    const sid = card.dataset.id;
    const uid = b.closest('[data-uid]')?.dataset.uid;
    const sb = () => getClient();
    switch (b.dataset.akcija) {
      case 'zatrazi':
        run(() => qSek(sb().from('sekcija_clanovi').insert({ sekcija_id: sid, korisnik_id: me().id })), 'Zahtjev poslan grupovođi');
        break;
      case 'povuci':
      case 'napusti':
        run(() => qSek(sb().from('sekcija_clanovi').delete().eq('sekcija_id', sid).eq('korisnik_id', me().id)), 'Gotovo');
        break;
      case 'odobri':
        run(() => qSek(sb().from('sekcija_clanovi').update({ status: 'odobren' }).eq('sekcija_id', sid).eq('korisnik_id', uid)), 'Pristup odobren');
        break;
      case 'odbij':
      case 'ukloni':
        run(() => qSek(sb().from('sekcija_clanovi').delete().eq('sekcija_id', sid).eq('korisnik_id', uid)), 'Gotovo');
        break;
      case 'dodaj': {
        const ids = [...card.querySelectorAll('[data-spisak] input:checked')].map((i) => i.value);
        if (!ids.length) { toast('Izaberi bar jednog lovca'); break; }
        run(() => qSek(sb().from('sekcija_clanovi').insert(ids.map((id) => ({ sekcija_id: sid, korisnik_id: id, status: 'odobren' })))), 'Lovci dodani');
        break;
      }
      case 'naziv': {
        const naziv = card.querySelector('[data-naziv]').value.trim();
        const err = validateSekcija({ naziv, revir_id: 'x' });
        if (err) { $('sekcije-status').textContent = err; break; }
        run(() => qSek(sb().from('sekcije').update({ naziv }).eq('id', sid)), 'Naziv sačuvan');
        break;
      }
      case 'uloge':
        run(() => qSek(sb().from('sekcije').update({
          grupovodja_id: card.querySelector('[data-gv]').value || null, lovocuvar_id: card.querySelector('[data-lc]').value || null,
        }).eq('id', sid)), 'Grupovođa i lovočuvar sačuvani');
        break;
      case 'sakrij':
        run(() => qSek(sb().from('sekcije').update({ aktivno: false }).eq('id', sid)), 'Sekcija sakrivena');
        break;
      default:
    }
  });

  // ---- grupovođe (admin) ----
  $('btn-grupovodja-dodaj').addEventListener('click', () => run(() => qSek(getClient().from('grupovodje')
    .insert({ korisnik_id: $('grupovodja-korisnik').value, revir_id: $('grupovodja-revir').value })), 'Grupovođa postavljen'));
  $('grupovodje-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="ukloni-gv"]');
    if (!b) return;
    const row = b.closest('[data-uid]');
    run(() => qSek(getClient().from('grupovodje').delete().eq('korisnik_id', row.dataset.uid).eq('revir_id', row.dataset.revir)), 'Grupovođa uklonjen');
  });

  // ---- nova sekcija ----
  const openForm = () => {
    const allowed = creatableRevirIds(me(), data.grupovodje, data.reviri);
    $('sekcija-revir').innerHTML = data.reviri.filter((r) => allowed.includes(r.id)).map((r) => opt(r.id, r.naziv)).join('');
    const admin = Boolean(me()?.is_admin);
    $('sekcija-admin-polja').hidden = !admin;
    if (admin) {
      const none = '<option value="">— niko —</option>';
      $('sekcija-grupovodja').innerHTML = none + users().map((u) => opt(u.id, memberName(u.id))).join('');
      $('sekcija-lovocuvar').innerHTML = none + users().map((u) => opt(u.id, memberName(u.id))).join('');
    }
    $('sekcija-lovci').innerHTML = users().filter((u) => u.id !== me()?.id).map((u) => `<label class="red-check"><input type="checkbox" value="${escapeHtml(u.id)}"> ${escapeHtml(memberName(u.id))}</label>`).join('')
      || '<p class="sitno">Spisak lovaca se preuzima uz internet.</p>';
    $('sekcija-forma-status').textContent = '';
    form.querySelector('[name=naziv]').value = '';
    screen.hidden = true;
    form.hidden = false;
  };
  $('btn-sekcija-nova').addEventListener('click', openForm);
  $('btn-sekcija-odustani').addEventListener('click', () => { form.hidden = true; screen.hidden = false; });
  $('forma-sekcija').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const naziv = f.naziv.value.trim();
    const err = validateSekcija({ naziv, revir_id: f.revir.value });
    if (err) { $('sekcija-forma-status').textContent = err; return; }
    const admin = Boolean(me()?.is_admin);
    const ids = [...$('sekcija-lovci').querySelectorAll('input:checked')].map((i) => i.value);
    try {
      const row = (await qSek(getClient().from('sekcije').insert({
        revir_id: f.revir.value, naziv,
        grupovodja_id: admin ? (f.grupovodja.value || null) : me().id,
        lovocuvar_id: admin ? (f.lovocuvar.value || null) : null,
        created_by: me().id,
      }).select('*')))[0];
      if (ids.length) await qSek(getClient().from('sekcija_clanovi').insert(ids.map((id) => ({ sekcija_id: row.id, korisnik_id: id, status: 'odobren' }))));
      form.hidden = true;
      screen.hidden = false;
      toast('Sekcija napravljena');
      await load();
    } catch (er) {
      $('sekcija-forma-status').textContent = `Server odbio: ${er.message}`;
    }
  });

  $('btn-sekcije').addEventListener('click', async () => {
    $('meni-spiskovi').hidden = true;
    screen.hidden = false;
    await load();
  });
  $('btn-sekcije-osvjezi').addEventListener('click', () => load());
  $('btn-sekcije-zatvori').addEventListener('click', () => { screen.hidden = true; });
  registerBackHandler(() => {
    if (!form.hidden) { form.hidden = true; screen.hidden = false; return true; }
    if (!screen.hidden) { screen.hidden = true; return true; }
    return false;
  });
}
