// Ekran "Sekcije i pristup": reviri -> sekcije, zahtjev za pristup, odobravanje (grupovođa/admin),
// pravljenje sekcije sa spiskom lovaca i (admin) određivanje grupovođa. Server provodi sva prava.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { refreshMembers, memberName } from './dijeljenje-ui.js';
import { matchesQuery } from './pretraga.js';
import { creationMode,
  sectionsOverview, approvalsForMe, filterSections, isMine, SEKCIJE_FILTERI, menuSummary,
  myStatus, pristupText, canManage, creatableRevirIds, groupByRevir, pendingRequests, candidatesToAdd, validateSekcija, mySectionsAsLeader,
} from './sekcije.js';
import { makeThumbnail } from './foto.js';
import { logoStyle } from './sekcija-logo.js';
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
    lovocuvari: await qSek(sb.from('revir_lovocuvari').select('*')),
    preuzeto: Date.now(),
  };
  await idbPut('spiskovi', { id: CACHE_ID, rows: data });
  const me = cachedProfile();
  saveSoft(MOJE_SEKCIJE_KEY, mySectionsAsLeader(data.sekcije, me?.id).map((s) => s.id));
  globalThis.document?.dispatchEvent(new CustomEvent('sekcije:promjena'));
  return data;
}

export async function cachedSekcije() {
  const c = await idbGet('spiskovi', CACHE_ID);
  return { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [], ...(c?.rows || {}) };
}

const opt = (id, label, sel) => `<option value="${escapeHtml(id)}" ${sel ? 'selected' : ''}>${escapeHtml(label)}</option>`;

export function initSekcije() {
  const screen = $('sekcije');
  const form = $('sekcija-forma');
  let data = { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [] };
  const otvoreno = new Set(); // paneli "Upravljanje" ostaju otvoreni poslije svake radnje
  let filterMode = null; // null = još nije izabrano: "Moje" ako lovac ima sekcije, inače "Sve"
  let searchText = '';
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

  const invitedBy = (sid, uid) => data.clanovi.find((c) => c.sekcija_id === sid && c.korisnik_id === uid && c.status === 'ceka')?.pozvao_id || null;

  const manageHtml = (s) => {
    const members = data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren');
    const pending = pendingRequests(s.id, data.clanovi);
    const candidates = candidatesToAdd(s, data.clanovi, users());
    const isAdmin = Boolean(me()?.is_admin);
    return `<details class="uprava" ${otvoreno.has(s.id) ? 'open' : ''}><summary>Upravljanje sekcijom${pending.length ? ` · zahtjeva: ${pending.length}` : ''}</summary>
      ${pending.length ? `<h4>Zahtjevi za pristup</h4><ul class="spisak">${pending.map((c) => `<li class="trag-red" data-uid="${escapeHtml(c.korisnik_id)}">
        <b>${escapeHtml(memberName(c.korisnik_id))}</b>${c.pozvao_id ? `<span class="sitno"> · predložio: ${escapeHtml(memberName(c.pozvao_id))} (novi nalog)</span>` : ''}
        <div class="red-dugmadi"><button type="button" class="dugme glavno" data-akcija="odobri">Odobri</button>
        <button type="button" class="dugme" data-akcija="odbij">Odbij</button></div></li>`).join('')}</ul>` : '<p class="sitno">Nema zahtjeva na čekanju.</p>'}
      <h4>Članovi (${members.length})</h4>
      <ul class="spisak">${members.map((c) => `<li class="trag-red" data-uid="${escapeHtml(c.korisnik_id)}"><b>${escapeHtml(memberName(c.korisnik_id))}</b>
        <button type="button" class="dugme" data-akcija="ukloni">Ukloni</button></li>`).join('') || '<li class="sitno">Nema članova.</li>'}</ul>
      <h4>Dodaj lovce sa spiska</h4>
      <div class="clanovi" data-spisak>${candidates.map((u) => `<label class="red-check"><input type="checkbox" value="${escapeHtml(u.id)}"> ${escapeHtml(memberName(u.id))}</label>`).join('')
    || '<p class="sitno">Nema lovaca za dodavanje (spisak se preuzima uz internet).</p>'}</div>
      <button type="button" class="dugme" data-akcija="dodaj">Dodaj izabrane</button>
      <h4>Logo sekcije</h4>
      <div class="pf-slika-red"><span class="sek-logo velik" style="${logoStyle(s)}"></span>
        <div class="pf-slika-dugmad"><button type="button" class="dugme" data-akcija="logo-ucitaj">Učitaj logo</button>
        <button type="button" class="dugme" data-akcija="logo-reset">Automatski logo</button></div></div>
      <label>Naziv sekcije<input data-naziv value="${escapeHtml(s.naziv)}" maxlength="60"></label>
      <button type="button" class="dugme" data-akcija="naziv">Sačuvaj naziv</button>
      ${isAdmin ? `<label>Grupovođa<select data-gv><option value="">— niko —</option>${users().map((u) => opt(u.id, memberName(u.id), u.id === s.grupovodja_id)).join('')}</select></label>
        <button type="button" class="dugme" data-akcija="uloge">Sačuvaj grupovođu</button>` : ''}
      <button type="button" class="dugme" data-akcija="sakrij">Sakrij sekciju</button>
    </details>`;
  };

  const cardHtml = (s) => {
    const st = myStatus(s, data.clanovi, me()?.id, Boolean(me()?.is_admin), data.lovocuvari);
    const lovocuvari = data.lovocuvari.filter((l) => l.revir_id === s.revir_id).map((l) => escapeHtml(memberName(l.korisnik_id))).join(', ') || '—';
    const members = data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren');
    const memberList = ['clan', 'grupovodja', 'lovocuvar', 'admin'].includes(st) && members.length
      ? `<span class="sitno">Članovi: ${members.map((c) => escapeHtml(memberName(c.korisnik_id))).join(', ')}</span>` : '';
    const buttons = st === 'nema' ? '<button type="button" class="dugme glavno" data-akcija="zatrazi">Zatraži pristup</button>'
      : st === 'ceka' ? '<button type="button" class="dugme" data-akcija="povuci">Povuci zahtjev</button>'
        : st === 'clan' ? '<button type="button" class="dugme" data-akcija="napusti">Napusti sekciju</button>' : '';
    const mode = creationMode(st);
    const newBtn = mode ? `<button type="button" class="dugme" data-akcija="novi-lovac">${mode === 'direct' ? 'Dodaj lovca (novi nalog)' : 'Predloži lovca (odobrava grupovođa)'}</button>` : '';
    const pendingN = pendingRequests(s.id, data.clanovi).length;
    const revirNaziv = data.reviri.find((r) => r.id === s.revir_id)?.naziv || '';
    return `<li class="trag-red sekcija-kartica sk2" data-id="${escapeHtml(s.id)}" data-pristup="${st}">
      <div class="sk2-glava">
        <span class="sek-logo" style="${logoStyle(s)}" role="img" aria-label="Logo sekcije ${escapeHtml(s.naziv)}"></span>
        <div class="sk2-naslov"><b>${escapeHtml(s.naziv)}</b>
          <span class="sitno">Revir ${escapeHtml(revirNaziv)}</span>
          <span class="pristup-status" data-status="${st}">${escapeHtml(pristupText(st))}</span></div>
        ${pendingN && canManage(s, me()) ? `<span class="znacka-broj" title="Zahtjevi na čekanju" aria-label="Zahtjeva na čekanju: ${pendingN}">${pendingN}</span>` : ''}
      </div>
      <div class="sk-statovi sk2-statovi">
        <div><b>${members.length}</b><span>članova</span></div>
        ${canManage(s, me()) ? `<div><b>${pendingN}</b><span>zahtjeva</span></div>` : ''}
      </div>
      <p class="sitno sk2-ljudi">Grupovođa: ${s.grupovodja_id ? escapeHtml(memberName(s.grupovodja_id)) : '—'} · Lovočuvar revira: ${lovocuvari}</p>
      ${memberList ? `<details class="sk2-clanovi"><summary>Članovi (${members.length})</summary>${memberList}</details>` : ''}
      <div class="sk2-dugmad">${buttons}${newBtn}</div>
      ${canManage(s, me()) ? manageHtml(s) : ''}
    </li>`;
  };

  const render = () => {
    const admin = Boolean(me()?.is_admin);
    $('btn-sekcija-nova').hidden = !creatableRevirIds(me(), data.grupovodje, data.reviri).length;
    $('grupovodje-blok').hidden = !admin;
    $('lovocuvari-blok').hidden = !admin;
    if (admin) {
      $('lovocuvari-spisak').innerHTML = data.lovocuvari.map((g) => `<li class="trag-red" data-uid="${escapeHtml(g.korisnik_id)}" data-revir="${escapeHtml(g.revir_id)}">
        <b>${escapeHtml(memberName(g.korisnik_id))}</b> <span class="sitno">${escapeHtml(data.reviri.find((r) => r.id === g.revir_id)?.naziv || '')}</span>
        <button type="button" class="dugme" data-akcija="ukloni-lc">Ukloni</button></li>`).join('') || '<li class="sitno">Još nema lovočuvara.</li>';
      $('lovocuvar-korisnik').innerHTML = users().map((u) => opt(u.id, memberName(u.id))).join('');
      $('lovocuvar-revir').innerHTML = data.reviri.map((r) => opt(r.id, r.naziv)).join('');
      $('grupovodje-spisak').innerHTML = data.grupovodje.map((g) => `<li class="trag-red" data-uid="${escapeHtml(g.korisnik_id)}" data-revir="${escapeHtml(g.revir_id)}">
        <b>${escapeHtml(memberName(g.korisnik_id))}</b> <span class="sitno">${escapeHtml(data.reviri.find((r) => r.id === g.revir_id)?.naziv || '')}</span>
        <button type="button" class="dugme" data-akcija="ukloni-gv">Ukloni</button></li>`).join('') || '<li class="sitno">Još nema grupovođa.</li>';
      $('grupovodja-korisnik').innerHTML = users().map((u) => opt(u.id, memberName(u.id))).join('');
      $('grupovodja-revir').innerHTML = data.reviri.map((r) => opt(r.id, r.naziv)).join('');
    }
    $('uloge-detalji').hidden = !admin;

    // pregled: brojevi, filter, pretraga i zahtjevi koje mogu odmah odobriti
    const user = me();
    const ov = sectionsOverview(data, user);
    $('sks-moje').textContent = String(ov.moje);
    $('sks-odobrenje').textContent = String(ov.zaOdobrenje);
    $('sks-ukupno').textContent = String(ov.ukupno);
    if (filterMode == null && data.sekcije.length) filterMode = ov.moje > 0 ? 'moje' : 'sve'; // izbor tek kad su sekcije stigle (prazan keš ne smije zaključati "Sve")
    const activeFilter = filterMode || 'sve';
    $('sekcije-filter').innerHTML = SEKCIJE_FILTERI.map(([k, n]) => `<button type="button" data-filter="${k}" aria-pressed="${k === activeFilter}">${n}${k === 'zahtjevi' && ov.zaOdobrenje ? ` <span class="znacka-broj">${ov.zaOdobrenje}</span>` : ''}</button>`).join('');
    const textOf = (s) => [data.reviri.find((r) => r.id === s.revir_id)?.naziv, s.grupovodja_id ? memberName(s.grupovodja_id) : '',
      ...data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren').map((c) => memberName(c.korisnik_id))].join(' ');
    const visible = filterSections(data, user, { filter: activeFilter, q: searchText, textOf, match: matchesQuery });
    const visibleIds = new Set(visible.map((s) => s.id));

    const approvals = approvalsForMe(data, user);
    const approvalsHtml = approvals.length ? `<section class="sk-zahtjevi" id="sekcije-zahtjevi"><h3>Čeka tvoje odobrenje (${approvals.length})</h3>
      <ul class="spisak">${approvals.map(({ sekcija, zahtjev }) => `<li class="tr-kartica ev-kartica" data-id="${escapeHtml(sekcija.id)}" data-uid="${escapeHtml(zahtjev.korisnik_id)}">
        <b>${escapeHtml(memberName(zahtjev.korisnik_id))}</b>
        <span class="sitno">traži ulaz u: ${escapeHtml(sekcija.naziv)}${zahtjev.pozvao_id ? ` · predložio: ${escapeHtml(memberName(zahtjev.pozvao_id))} (novi nalog)` : ''}</span>
        <div class="red-dugmadi"><button type="button" class="dugme glavno" data-akcija="odobri">Odobri</button><button type="button" class="dugme" data-akcija="odbij">Odbij</button></div></li>`).join('')}</ul></section>` : '';

    const groups = groupByRevir(data.reviri, data.sekcije).map(({ revir, sekcije }) => ({
      revir,
      // moje sekcije prve u svakom reviru
      sekcije: sekcije.filter((s) => visibleIds.has(s.id)).sort((a, b) => Number(isMine(b, data.clanovi, user?.id, Boolean(user?.is_admin), data.lovocuvari))
        - Number(isMine(a, data.clanovi, user?.id, Boolean(user?.is_admin), data.lovocuvari))),
    })).filter((g) => g.sekcije.length || activeFilter === 'sve');
    $('sekcije-spisak').innerHTML = approvalsHtml + (groups.map(({ revir, sekcije }) => `
      <h3>Revir ${escapeHtml(revir.naziv)}</h3>
      <ul class="spisak">${sekcije.map(cardHtml).join('') || '<li class="sitno">Nema sekcija u ovom reviru.</li>'}</ul>`).join('')
      || '<p class="sitno" id="sekcije-prazno">Nema sekcija za ovaj prikaz. Probaj "Sve".</p>');
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

  $('sekcije-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) { filterMode = b.dataset.filter; render(); }
  });
  $('sekcije-trazi').addEventListener('input', (e) => { searchText = e.target.value; render(); });

  let armedRemove = null;
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
      case 'novi-lovac':
        document.dispatchEvent(new CustomEvent('lovac:novi', { detail: { sekcijaId: sid } }));
        break;
      case 'odobri':
        if (invitedBy(sid, uid)) run(() => qSek(sb().rpc('odobri_pozvanog', { p_sekcija: sid, p_korisnik: uid })), 'Nalog i pristup odobreni');
        else run(() => qSek(sb().from('sekcija_clanovi').update({ status: 'odobren' }).eq('sekcija_id', sid).eq('korisnik_id', uid)), 'Pristup odobren');
        break;
      case 'odbij':
        if (invitedBy(sid, uid)) { run(() => qSek(sb().rpc('odbij_pozvanog', { p_sekcija: sid, p_korisnik: uid })), 'Predlog odbijen, nalog obrisan'); break; }
        run(() => qSek(sb().from('sekcija_clanovi').delete().eq('sekcija_id', sid).eq('korisnik_id', uid)), 'Gotovo');
        break;
      case 'logo-ucitaj':
        logoSid = sid;
        $('sekcija-logo-ulaz').click();
        break;
      case 'ukloni': {
        // Izbacivanje člana je nepovratno (mora se ponovo tražiti pristup): potvrda drugim dodirom.
        const key = `${sid}:${uid}`;
        if (armedRemove !== key) {
          armedRemove = key;
          b.textContent = 'Dodirni ponovo za uklanjanje';
          setTimeout(() => { if (armedRemove === key) { armedRemove = null; b.textContent = 'Ukloni'; } }, 4000);
          break;
        }
        armedRemove = null;
        run(() => qSek(sb().from('sekcija_clanovi').delete().eq('sekcija_id', sid).eq('korisnik_id', uid)), 'Član uklonjen iz sekcije');
        break;
      }
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
        run(() => qSek(sb().from('sekcije').update({ grupovodja_id: card.querySelector('[data-gv]').value || null }).eq('id', sid)), 'Grupovođa sačuvan');
        break;
      case 'logo-reset':
        run(() => qSek(sb().from('sekcije').update({ logo: null }).eq('id', sid)), 'Vraćen je automatski logo');
        break;
      case 'sakrij':
        run(() => qSek(sb().from('sekcije').update({ aktivno: false }).eq('id', sid)), 'Sekcija sakrivena');
        break;
      default:
    }
  });

  // Učitavanje loga sekcije (mala slika, 128 px): grupovođa ili admin. Polje za fajl je JEDNO i van spiska:
  // spisak se zna ponovo nacrtati dok lovac bira sliku (osvježavanje sa servera), pa bi izbor u zamijenjenom polju propao.
  let logoSid = null;
  $('sekcija-logo-ulaz').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const sid = logoSid;
    e.target.value = '';
    if (!file || !sid) return;
    try {
      const logo = await makeThumbnail(file, 128);
      await run(() => qSek(getClient().from('sekcije').update({ logo }).eq('id', sid)), 'Logo sekcije je sačuvan');
    } catch (err) {
      $('sekcije-status').textContent = `Logo nije sačuvan: ${err.message}`;
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

  // ---- lovočuvari po revirima (admin): prate sve sekcije svog revira ----
  $('btn-lovocuvar-dodaj').addEventListener('click', () => run(() => qSek(getClient().from('revir_lovocuvari')
    .insert({ korisnik_id: $('lovocuvar-korisnik').value, revir_id: $('lovocuvar-revir').value })), 'Lovočuvar postavljen'));
  $('lovocuvari-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="ukloni-lc"]');
    if (!b) return;
    const row = b.closest('[data-uid]');
    run(() => qSek(getClient().from('revir_lovocuvari').delete().eq('korisnik_id', row.dataset.uid).eq('revir_id', row.dataset.revir)), 'Lovočuvar uklonjen');
  });

  // ---- nova sekcija ----
  const openForm = () => {
    const allowed = creatableRevirIds(me(), data.grupovodje, data.reviri);
    $('sekcija-revir').innerHTML = data.reviri.filter((r) => allowed.includes(r.id)).map((r) => opt(r.id, r.naziv)).join('');
    const admin = Boolean(me()?.is_admin);
    $('sekcija-admin-polja').hidden = !admin;
    if (admin) {
      $('sekcija-grupovodja').innerHTML = '<option value="">— niko —</option>' + users().map((u) => opt(u.id, memberName(u.id))).join('');
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
