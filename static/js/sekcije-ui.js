// Ekran "Sekcije i pristup": reviri -> sekcije, zahtjev za pristup, odobravanje (lovovođa sekcije/admin),
// pravljenje sekcije sa spiskom lovaca i (admin) određivanje lovovođa sekcije. Server provodi sva prava.

import { getClient, cachedProfile } from './auth.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { idbGet, idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { refreshMembers, memberName } from './dijeljenje-ui.js';
import { matchesQuery } from './pretraga.js';
import { creationMode,
  sectionsOverview, approvalsForMe, filterSections, isMine, SEKCIJE_FILTERI, menuSummary,
  myStatus, pristupText, canManage, creatableRevirIds, editsRevir, keeperRevirIds, groupByRevir, pendingRequests, canApprove, candidatesToAdd, sectionsHint, sectionFilterCounts, requestAgeText, memberFaces, validateSekcija, mySectionsAsLeader,
} from './sekcije.js';
import { makeThumbnail } from './foto.js';
import { logoStyle } from './sekcija-logo.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';
import { initialsOf } from './lokacija.js';
import { historyLine, bulkApprovable, memberRows, MEMBER_CSV_COLUMNS, memberCsvName, IMENA_ZAHTJEVA_KEY, RAZLOG_MAX, ODLUKE_NOVE_KEY, ODLUKE_CEKAM_KEY, decisionText } from './sekcije-odluke.js';
import { toCsv } from './odstrel.js';
import { saveFile } from './dijeljenje.js';
import { expandKeepers } from './hijerarhija.js';

const CACHE_ID = 'sekcije';
export const MOJE_SEKCIJE_KEY = 'lovac.moje_sekcije';
const $ = (id) => document.getElementById(id);

async function qSek(promise) {
  const { data, error } = await promise;
  if (error) { const e = new Error(error.message); e.code = error.code; throw e; }
  return data;
}
// Server bez migracije 040 (funkcija ili kolona ne postoji): radi se starim putem.
const nemaNaServeru = (err) => ['PGRST202', 'PGRST204', 'PGRST205', '42703', '42883', '42P01'].includes(err?.code);

// Tabela koje server još nema (migracija 045) nije greška: prazno.
const optional = async (promise) => {
  const { data, error } = await promise;
  return error ? [] : data || [];
};

// `grupe` se preuzimaju samo kad ih traži tab sekcije (štedi zahtjeve besplatnom serveru); inače ostaje keširano stanje.
export async function downloadSekcije({ grupe = false } = {}) {
  const sb = getClient();
  const reviri = await qSek(sb.from('reviri').select('*'));
  const drustvoUloge = await optional(sb.from('drustvo_uloge').select('*'));
  const data = {
    reviri,
    sekcije: await qSek(sb.from('sekcije').select('*')),
    clanovi: await qSek(sb.from('sekcija_clanovi').select('*')),
    grupovodje: await qSek(sb.from('grupovodje').select('*')),
    // Lovočuvari društva rade na cijelom području: svaki važi za svaki revir (ostali kod ne mora znati za novu ulogu)
    lovocuvari: expandKeepers(await qSek(sb.from('revir_lovocuvari').select('*')), drustvoUloge, reviri),
    drustvoUloge,
    revirVodje: await optional(sb.from('revir_vodje').select('*')),
    grupe: grupe ? await optional(sb.from('grupe').select('*')) : (await cachedSekcije()).grupe,
    // korisnici koje admin skriva iz pregleda (migracija 049); tabele koje nema = prazno
    izvanPregleda: grupe ? await optional(sb.from('izvan_pregleda').select('korisnik_id')) : (await cachedSekcije()).izvanPregleda,
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
  return { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [], drustvoUloge: [], revirVodje: [], grupe: [], izvanPregleda: [], ...(c?.rows || {}) };
}

// Ponovno crtanje (podaci sa servera stignu dok lovac bira) ne smije vratiti izbor na prvu stavku.
const fillSelect = (el, html) => {
  const keep = el.value;
  el.innerHTML = html;
  if (keep && [...el.options].some((o) => o.value === keep)) el.value = keep;
};

// 1 sekcija, 2–4 sekcije, 5+ sekcija (11–14 sekcija)
const sekcijaWord = (n) => (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? 'sekcije' : 'sekcija');
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

  const canManageSek = (sid) => { const sk = data.sekcije.find((x) => x.id === sid); return Boolean(sk) && canManage(sk, me()); };
  const invitedBy = (sid, uid) => data.clanovi.find((c) => c.sekcija_id === sid && c.korisnik_id === uid && c.status === 'ceka')?.pozvao_id || null;

  // Lovovođa sekcije: admin ili lovočuvar revira (migracija 030). Revir sekcije: samo admin.
  const gvPicker = (s) => `<label>Lovovođa sekcije<select data-gv><option value="">— niko —</option>${users().map((u) => opt(u.id, memberName(u.id), u.id === s.grupovodja_id)).join('')}</select></label>
        <button type="button" class="dugme" data-akcija="uloge">Sačuvaj lovovođu sekcije</button>`;
  const revirPicker = (s) => `<label>Revir sekcije<select data-revir>${data.reviri.map((r) => opt(r.id, r.naziv, r.id === s.revir_id)).join('')}</select></label>
        <button type="button" class="dugme" data-akcija="revir">Premjesti u revir</button>`;
  // Lovočuvar revira koji nije lovovođa sekcije: samo lovovođa sekcije (ne članovi — njih vodi lovovođa sekcije).
  // Prebacivanje zahtjeva u drugu sekciju (lovac se greškom prijavio u pogrešnu): izbor + dugme.
  const moveHtml = (sid) => {
    const others = data.sekcije.filter((x) => x.aktivno !== false && x.id !== sid);
    if (!others.length) return '';
    return `<details class="sk-prebaci-vise"><summary>Prebaci u drugu sekciju</summary><div class="red-dugmadi sk-prebaci"><select data-prebaci aria-label="Prebaci zahtjev u sekciju"><option value="">Izaberi sekciju…</option>${others.map((x) => opt(x.id, `${data.reviri.find((r) => r.id === x.revir_id)?.naziv || ''} · ${x.naziv}`, false)).join('')}</select>
      <button type="button" class="dugme" data-akcija="prebaci">Prebaci</button></div></details>`;
  };
  // Otvorene forme "Odbij sa razlogom" i upisani razlozi (lista se ponovo crta kad stignu podaci sa servera).
  const odbijanje = new Map(); // `${sid}|${uid}` -> razlog
  let historija = []; // sekcija_odluke za sekcije kojima upravljam (migracija 040)
  const avatar = (id, cls = '') => `<span class="sk-avatar ${cls}" aria-hidden="true">${escapeHtml(initialsOf(memberName(id)))}</span>`;
  // Kompaktan red zahtjeva: lice, ime, kuda i od kada; Odobri/Odbij u jednom redu, prebacivanje sklopljeno.
  const requestRow = (sekcija, z, withSection) => `<li class="sk-zahtjev" data-id="${escapeHtml(sekcija.id)}" data-uid="${escapeHtml(z.korisnik_id)}">
      <div class="sk-zahtjev-glava">${avatar(z.korisnik_id)}<div class="sk-zahtjev-tekst"><b>${escapeHtml(memberName(z.korisnik_id))}</b>
        <span class="sitno">${withSection ? `→ ${escapeHtml(sekcija.naziv)}` : 'traži pristup'}${requestAgeText(z.created_at) ? ` · ${requestAgeText(z.created_at)}` : ''}${z.pozvao_id ? ` · predložio ${escapeHtml(memberName(z.pozvao_id))} (novi nalog)` : ''}</span></div></div>
      <div class="sk-zahtjev-dugmad"><button type="button" class="dugme glavno" data-akcija="odobri">Odobri</button><button type="button" class="dugme" data-akcija="odbij" aria-expanded="${odbijanje.has(`${sekcija.id}|${z.korisnik_id}`)}">Odbij</button></div>
      ${odbijanje.has(`${sekcija.id}|${z.korisnik_id}`) && !z.pozvao_id ? `<div class="sk-odbij-forma"><label>Razlog (neobavezno, vidi ga podnosilac)<input data-razlog maxlength="${RAZLOG_MAX}" value="${escapeHtml(odbijanje.get(`${sekcija.id}|${z.korisnik_id}`) || '')}"></label>
        <div class="red-dugmadi"><button type="button" class="dugme" data-akcija="odbij-potvrdi">Potvrdi odbijanje</button><button type="button" class="dugme" data-akcija="odbij-odustani">Odustani</button></div></div>` : ''}
      ${z.pozvao_id ? '' : moveHtml(sekcija.id)}</li>`;
  const historyHtml = (s) => {
    const rows = historija.filter((o) => o.sekcija_id === s.id).slice(0, 10);
    return rows.length ? `<h4>Zadnje odluke</h4><ul class="sk-historija">${rows.map((o) => `<li><span class="sitno">${escapeHtml(new Date(o.created_at).toLocaleDateString('bs-BA'))}</span> ${escapeHtml(historyLine(o, memberName, data.sekcije))}</li>`).join('')}</ul>` : '';
  };
  const bulkHtml = (s) => {
    const n = bulkApprovable(s.id, data.clanovi).length;
    return n > 1 ? `<button type="button" class="dugme" data-akcija="odobri-sve" data-broj="${n}">Odobri sve (${n})</button>` : '';
  };
  const pendingHtml = (s) => {
    const pending = pendingRequests(s.id, data.clanovi).filter((c) => !c.pozvao_id);
    return `${pending.length ? `<h4>Zahtjevi za pristup</h4><ul class="spisak sk-zahtjevi-lista">${pending.map((c) => requestRow(s, c, false)).join('')}</ul>${bulkHtml(s)}` : ''}${historyHtml(s)}`;
  };
  const revirHtml = (s) => `<details class="uprava sk-revir-uprava" ${otvoreno.has(s.id) ? 'open' : ''}><summary>Lovovođa sekcije (lovočuvar revira)</summary>
      ${pendingHtml(s)}
      ${gvPicker(s)}
      <button type="button" class="dugme" data-akcija="sakrij">Sakrij sekciju</button></details>`;

  const manageHtml = (s) => {
    const members = data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren');
    const pending = pendingRequests(s.id, data.clanovi);
    const candidates = candidatesToAdd(s, data.clanovi, users());
    const isAdmin = Boolean(me()?.is_admin);
    return `<details class="uprava" ${otvoreno.has(s.id) ? 'open' : ''}><summary>Upravljanje sekcijom${pending.length ? ` · zahtjeva: ${pending.length}` : ''}</summary>
      ${pending.length ? `<h4>Zahtjevi za pristup</h4><ul class="spisak sk-zahtjevi-lista">${pending.map((c) => requestRow(s, c, false)).join('')}</ul>${bulkHtml(s)}` : '<p class="sitno">Nema zahtjeva na čekanju.</p>'}
      ${historyHtml(s)}
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
      <h4>Opis i okupljanje</h4>
      <label>Opis sekcije<textarea data-opis maxlength="500" rows="3">${escapeHtml(s.opis || '')}</textarea></label>
      <label>Mjesto okupljanja<input data-okupljanje maxlength="200" value="${escapeHtml(s.okupljanje || '')}" placeholder="npr. Lovačka kuća Bara"></label>
      <button type="button" class="dugme" data-akcija="opis">Sačuvaj opis</button>
      <h4>Spisak članova</h4>
      <button type="button" class="dugme" data-akcija="csv">Izvezi spisak članova (CSV)</button>
      ${isAdmin ? `${gvPicker(s)}${revirPicker(s)}` : ''}
      <button type="button" class="dugme" data-akcija="sakrij">Sakrij sekciju</button>
    </details>`;
  };

  const cardHtml = (s) => {
    const st = myStatus(s, data.clanovi, me()?.id, Boolean(me()?.is_admin), data.lovocuvari);
    const members = data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren');
    const buttons = st === 'nema' ? '<button type="button" class="dugme glavno" data-akcija="zatrazi">Zatraži pristup</button>'
      : st === 'ceka' ? '<button type="button" class="dugme" data-akcija="povuci">Povuci zahtjev</button>'
        : st === 'clan' ? '<button type="button" class="dugme" data-akcija="napusti">Napusti sekciju</button>' : '';
    const moj = data.clanovi.find((c) => c.sekcija_id === s.id && c.korisnik_id === me()?.id);
    const imeGrupe = (id) => { const g = (data.grupe || []).find((x) => x.id === id); return g ? memberName(g.grupovodja_id) : loadJSON(`lovac.grupa.izbor.${s.id}`, ''); };
    const grupaTekst = !moj || !['ceka', 'clan'].includes(st) ? ''
      : moj.grupa_id ? `Tvoja grupa: grupovođa ${imeGrupe(moj.grupa_id) || '—'}`
        : moj.zeljena_grupa_id ? `Izabrana grupa: grupovođa ${imeGrupe(moj.zeljena_grupa_id) || '—'} (${st === 'ceka' ? 'ulaziš u nju kad ti odobre članstvo' : 'čeka odobrenje'})` : '';
    const grupaBtn = moj && ['ceka', 'clan'].includes(st) && !moj.grupa_id
      ? `<button type="button" class="dugme" data-akcija="moja-grupa">${moj.zeljena_grupa_id ? 'Promijeni grupu' : 'Izaberi grupu'}</button>` : '';
    const mode = creationMode(st);
    const newBtn = mode ? `<button type="button" class="dugme" data-akcija="novi-lovac">${mode === 'direct' ? 'Dodaj novog lovca' : 'Predloži lovca'}</button>` : '';
    const pendingN = pendingRequests(s.id, data.clanovi).length;
    const revirNaziv = data.reviri.find((r) => r.id === s.revir_id)?.naziv || '';
    const faces = memberFaces(s, data.clanovi, memberName, 6);
    const showMembers = ['clan', 'grupovodja', 'lovocuvar', 'admin'].includes(st) && faces.ukupno > 0;
    const lcIds = data.lovocuvari.filter((l) => l.revir_id === s.revir_id).map((l) => l.korisnik_id);
    const approver = canApprove(s, me(), data.lovocuvari, data);
    const person = (id, uloga) => `<span class="sk2-osoba">${avatar(id, 'mali')}<span><span class="sitno">${uloga}</span><b>${escapeHtml(memberName(id))}</b></span></span>`;
    return `<li class="trag-red sekcija-kartica sk2" data-id="${escapeHtml(s.id)}" data-pristup="${st}">
      <div class="sk2-glava">
        <span class="sek-logo" style="${logoStyle(s)}" role="img" aria-label="Logo sekcije ${escapeHtml(s.naziv)}"></span>
        <div class="sk2-naslov"><b>${escapeHtml(s.naziv)}</b>
          <span class="sitno">Revir ${escapeHtml(revirNaziv)}</span>
          <span class="pristup-status" data-status="${st}">${escapeHtml(pristupText(st))}</span></div>
        ${pendingN && approver ? `<span class="znacka-broj sk2-znacka" title="Zahtjevi na čekanju" aria-label="Zahtjeva na čekanju: ${pendingN}">${pendingN}</span>` : ''}
      </div>
      ${s.opis ? `<p class="sk2-opis">${escapeHtml(s.opis)}</p>` : ''}
      ${s.okupljanje ? `<p class="sitno sk2-okupljanje">Okupljanje: ${escapeHtml(s.okupljanje)}</p>` : ''}
      <div class="sk2-brojke">
        <span><b>${members.length}</b> ${members.length === 1 ? 'član' : 'članova'}</span>
        ${approver ? `<span data-ima="${pendingN > 0}"><b>${pendingN}</b> ${pendingN === 1 ? 'zahtjev' : 'zahtjeva'}</span>` : ''}
      </div>
      <div class="sk2-ljudi">
        ${s.grupovodja_id ? person(s.grupovodja_id, 'Lovovođa sekcije') : '<span class="sitno">Lovovođa sekcije: —</span>'}
        ${lcIds.length ? lcIds.map((id) => person(id, 'Lovočuvar revira')).join('') : '<span class="sitno">Lovočuvar revira: —</span>'}
      </div>
      ${showMembers ? `<details class="sk2-clanovi"><summary><span class="sk2-lica">${faces.lica.map((f) => avatar(f.id, 'mali')).join('')}${faces.ostalo ? `<span class="sk2-vise">+${faces.ostalo}</span>` : ''}</span><span>Članovi (${faces.ukupno})</span></summary>
        <ul class="sk2-spisak">${data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren').map((c) => `<li>${avatar(c.korisnik_id, 'mali')}${escapeHtml(memberName(c.korisnik_id))}${c.korisnik_id === s.grupovodja_id ? ' <span class="sitno">· lovovođa sekcije</span>' : ''}</li>`).join('')}</ul></details>` : ''}
      ${grupaTekst ? `<p class="sitno sk-moja-grupa-tekst">${escapeHtml(grupaTekst)}</p>` : ''}
      <div class="sk-moja-grupa" hidden></div>
      <div class="sk2-dugmad" data-glavno="${st === 'nema'}">${buttons}${grupaBtn}${newBtn}</div>
      ${canManage(s, me()) ? manageHtml(s) : editsRevir(me(), s.revir_id, data.lovocuvari) ? revirHtml(s) : ''}
    </li>`;
  };

  const render = () => {
    const admin = Boolean(me()?.is_admin);
    $('btn-sekcija-nova').hidden = !creatableRevirIds(me(), data.grupovodje, data.reviri, data.lovocuvari).length;
    // grupovođe revira (ko smije praviti sekcije): admin sve, lovočuvar u svom reviru
    const lcRevirs = admin ? data.reviri.map((r) => r.id) : keeperRevirIds(me(), data.lovocuvari);
    $('grupovodje-blok').hidden = !lcRevirs.length;
    $('lovocuvari-blok').hidden = !admin;
    if (lcRevirs.length) {
      $('grupovodje-spisak').innerHTML = data.grupovodje.filter((g) => lcRevirs.includes(g.revir_id)).map((g) => `<li class="trag-red" data-uid="${escapeHtml(g.korisnik_id)}" data-revir="${escapeHtml(g.revir_id)}">
        <b>${escapeHtml(memberName(g.korisnik_id))}</b> <span class="sitno">${escapeHtml(data.reviri.find((r) => r.id === g.revir_id)?.naziv || '')}</span>
        <button type="button" class="dugme" data-akcija="ukloni-gv">Ukloni</button></li>`).join('') || '<li class="sitno">Još nema lovovođa sekcije.</li>';
      fillSelect($('grupovodja-korisnik'), users().map((u) => opt(u.id, memberName(u.id))).join(''));
      fillSelect($('grupovodja-revir'), data.reviri.filter((r) => lcRevirs.includes(r.id)).map((r) => opt(r.id, r.naziv)).join(''));
    }
    if (admin) {
      $('lovocuvari-spisak').innerHTML = data.lovocuvari.map((g) => `<li class="trag-red" data-uid="${escapeHtml(g.korisnik_id)}" data-revir="${escapeHtml(g.revir_id)}">
        <b>${escapeHtml(memberName(g.korisnik_id))}</b> <span class="sitno">${escapeHtml(data.reviri.find((r) => r.id === g.revir_id)?.naziv || '')}</span>
        <button type="button" class="dugme" data-akcija="ukloni-lc">Ukloni</button></li>`).join('') || '<li class="sitno">Još nema lovočuvara.</li>';
      fillSelect($('lovocuvar-korisnik'), users().map((u) => opt(u.id, memberName(u.id))).join(''));
      fillSelect($('lovocuvar-revir'), data.reviri.map((r) => opt(r.id, r.naziv)).join(''));
    }
    $('uloge-detalji').hidden = !lcRevirs.length;

    // odluke o MOJIM zahtjevima (odobren / odbijen sa razlogom / prebačen) dok ih ne potvrdim
    const nove = loadJSON(ODLUKE_NOVE_KEY, []);
    $('sekcije-odluke').hidden = !nove.length;
    $('sekcije-odluke').innerHTML = nove.map((o) => `<div class="sk-odluka" data-odluka="${escapeHtml(o.odluka)}" data-oid="${escapeHtml(o.id)}">
      <span>${escapeHtml(decisionText(o, data.sekcije))}</span><button type="button" class="dugme" data-akcija="odluka-ok">U redu</button></div>`).join('');

    // pregled: brojevi, filter, pretraga i zahtjevi koje mogu odmah odobriti
    const user = me();
    const ov = sectionsOverview(data, user);
    $('sks-moje').textContent = String(ov.moje);
    $('sks-odobrenje').textContent = String(ov.zaOdobrenje);
    $('sks-ukupno').textContent = String(ov.ukupno);
    if (filterMode == null && data.sekcije.length) filterMode = ov.moje > 0 ? 'moje' : 'sve'; // izbor tek kad su sekcije stigle (prazan keš ne smije zaključati "Sve")
    const activeFilter = filterMode || 'sve';
    const counts = sectionFilterCounts(data, user);
    $('sekcije-filter').innerHTML = SEKCIJE_FILTERI.map(([k, n]) => `<button type="button" data-filter="${k}" aria-pressed="${k === activeFilter}"><span class="sks-ime">${n}</span>${k === 'zahtjevi' && ov.zaOdobrenje ? ` <span class="znacka-broj">${ov.zaOdobrenje}</span>` : ` <span class="sks-broj">${counts[k]}</span>`}</button>`).join('');
    $('sekcije-uputa').textContent = sectionsHint(user, data);
    const textOf = (s) => [data.reviri.find((r) => r.id === s.revir_id)?.naziv, s.grupovodja_id ? memberName(s.grupovodja_id) : '',
      ...data.clanovi.filter((c) => c.sekcija_id === s.id && c.status === 'odobren').map((c) => memberName(c.korisnik_id))].join(' ');
    const visible = filterSections(data, user, { filter: activeFilter, q: searchText, textOf, match: matchesQuery });
    const visibleIds = new Set(visible.map((s) => s.id));

    const approvals = approvalsForMe(data, user);
    const approvalsHtml = approvals.length ? `<section class="sk-zahtjevi" id="sekcije-zahtjevi"><h3>Čeka tvoje odobrenje (${approvals.length})</h3>
      <ul class="spisak sk-zahtjevi-lista">${approvals.map(({ sekcija, zahtjev }) => requestRow(sekcija, zahtjev, true)).join('')}</ul></section>` : '';

    const groups = groupByRevir(data.reviri, data.sekcije).map(({ revir, sekcije }) => ({
      revir,
      // moje sekcije prve u svakom reviru
      sekcije: sekcije.filter((s) => visibleIds.has(s.id)).sort((a, b) => Number(isMine(b, data.clanovi, user?.id, Boolean(user?.is_admin), data.lovocuvari))
        - Number(isMine(a, data.clanovi, user?.id, Boolean(user?.is_admin), data.lovocuvari))),
    })).filter((g) => g.sekcije.length || activeFilter === 'sve');
    // izbori u karticama (lovovođa sekcije, revir, naziv) preživljavaju ponovno crtanje dok lovac bira
    const kept = [...$('sekcije-spisak').querySelectorAll('[data-id] [data-gv], [data-id] [data-revir], [data-id] [data-naziv], [data-id] [data-opis], [data-id] [data-okupljanje]')]
      .filter((el) => el === document.activeElement || el.dataset.dirnuto)
      .map((el) => [el.closest('[data-id]').dataset.id, Object.keys(el.dataset).find((k) => ['gv', 'revir', 'naziv', 'opis', 'okupljanje'].includes(k)), el.value]);
    const keptMove = [...$('sekcije-spisak').querySelectorAll('[data-prebaci]')].filter((el) => el.value)
      .map((el) => [el.closest('[data-id]')?.dataset.id, el.closest('[data-uid]')?.dataset.uid, el.value]);
    $('sekcije-spisak').innerHTML = approvalsHtml + (groups.map(({ revir, sekcije }) => `
      <h3 class="sks-revir" data-broj="· ${sekcije.length} ${sekcijaWord(sekcije.length)}">Revir ${escapeHtml(revir.naziv)}</h3>
      <ul class="spisak">${sekcije.map(cardHtml).join('') || '<li class="sitno">Nema sekcija u ovom reviru.</li>'}</ul>`).join('')
      || '<p class="sitno" id="sekcije-prazno">Nema sekcija za ovaj prikaz. Probaj "Sve".</p>');
    for (const [id, uid, value] of keptMove) {
      const el = $('sekcije-spisak').querySelector(`[data-id="${CSS.escape(id)}"][data-uid="${CSS.escape(uid)}"] [data-prebaci], [data-id="${CSS.escape(id)}"] [data-uid="${CSS.escape(uid)}"] [data-prebaci]`);
      if (el) el.value = value;
    }
    for (const [id, key, value] of kept) {
      const el = $('sekcije-spisak').querySelector(`[data-id="${CSS.escape(id)}"] [data-${key}]`);
      if (el) { el.value = value; el.dataset.dirnuto = '1'; }
    }
  };

  // Pri otvaranju ekrana odmah se crta keš; poslije radnje samo jednom, sa svježim podacima servera.
  // Imena podnosilaca i historija odluka (migracija 040): samo kad imam šta odobravati, i samo pri otvaranju ekrana
  // (ne u pozadini — budžet zahtjeva besplatnog servera).
  const loadDecisionData = async () => {
    const user = me();
    const mine = data.sekcije.filter((x) => canApprove(x, user, data.lovocuvari, data));
    if (!mine.length) return;
    const sb = getClient();
    try {
      if (approvalsForMe(data, user).length) saveSoft(IMENA_ZAHTJEVA_KEY, (await qSek(sb.rpc('imena_podnosilaca'))) || []);
      historija = (await qSek(sb.from('sekcija_odluke').select('*').in('sekcija_id', mine.map((x) => x.id)).order('created_at', { ascending: false }).limit(100))) || [];
    } catch (err) {
      if (!nemaNaServeru(err)) console.warn('odluke sekcija', err.message);
    }
  };
  const load = async (showCache = true) => {
    if (showCache) {
      data = await cachedSekcije();
      render();
    }
    try {
      await refreshMembers().catch(() => {});
      data = await downloadSekcije();
      $('sekcije-status').textContent = '';
      await loadDecisionData();
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

  $('sekcije-spisak').addEventListener('change', (e) => {
    if (e.target.matches('[data-gv], [data-revir]')) e.target.dataset.dirnuto = '1';
  });
  $('sekcije-spisak').addEventListener('input', (e) => {
    if (e.target.matches('[data-naziv], [data-opis], [data-okupljanje]')) e.target.dataset.dirnuto = '1';
    if (e.target.matches('[data-razlog]')) {
      const li = e.target.closest('[data-uid]');
      odbijanje.set(`${li.closest('[data-id]').dataset.id}|${li.dataset.uid}`, e.target.value);
    }
  });
  $('sekcije-odluke').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="odluka-ok"]');
    if (!b) return;
    const id = b.closest('[data-oid]').dataset.oid;
    saveSoft(ODLUKE_NOVE_KEY, loadJSON(ODLUKE_NOVE_KEY, []).filter((o) => o.id !== id));
    document.dispatchEvent(new CustomEvent('sekcije:odluke'));
    render();
  });
  document.addEventListener('sekcije:odluke', () => { if (!screen.hidden) render(); });
  document.querySelector('#sekcije .sks-hero')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter-skok]');
    if (b) { filterMode = b.dataset.filterSkok; render(); }
  });
  $('sekcije-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) { filterMode = b.dataset.filter; render(); }
  });
  $('sekcije-trazi').addEventListener('input', (e) => { searchText = e.target.value; render(); });

  let armedRemove = null;
  // Lovac sam bira grupu (želja): grupe i grupovođe daje `javne_grupe`, izbor ide kroz `zeljena_grupa`; odobrava upravljač.
  const chooseGroup = async (card, sid) => {
    if (!isServerConfigured() || connectionQuality() === 'nema' || !getClient()) { toast('Za izbor grupe potreban je internet'); return; }
    const box = card.querySelector('.sk-moja-grupa');
    const { data: lista, error } = await getClient().rpc('javne_grupe', { p_sekcija: sid });
    if (error) { toast(error.code === 'PGRST202' ? 'Server još ne podržava izbor grupe' : error.message); return; }
    if (!lista?.length) { toast('Ova sekcija još nema grupa'); return; }
    box.hidden = false;
    box.innerHTML = `<select aria-label="Grupa (grupovođa)">${lista.map((g) => `<option value="${escapeHtml(g.id)}">Grupovođa ${escapeHtml(g.grupovodja)}</option>`).join('')}</select>
      <button type="button" class="dugme glavno" data-grupa-potvrdi>Potvrdi grupu</button>`;
    box.querySelector('[data-grupa-potvrdi]').addEventListener('click', async () => {
      const id = box.querySelector('select').value;
      const { error: e2 } = await getClient().rpc('zeljena_grupa', { p_sekcija: sid, p_grupa: id });
      if (e2) { toast(e2.message); return; }
      saveSoft(`lovac.grupa.izbor.${sid}`, lista.find((g) => g.id === id)?.grupovodja || '');
      toast('Grupa je izabrana — čeka odobrenje');
      box.hidden = true;
      data = { ...data, ...(await downloadSekcije({ grupe: true }).catch(() => ({}))) };
      render();
    });
  };

  // ---- akcije nad karticama ----
  $('sekcije-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-akcija]');
    if (!b) return;
    const card = b.closest('[data-id]');
    const sid = card.dataset.id;
    const uid = b.closest('[data-uid]')?.dataset.uid;
    const sb = () => getClient();
    switch (b.dataset.akcija) {
      case 'moja-grupa':
        chooseGroup(card, sid).catch((err) => toast(err.message));
        break;
      case 'zatrazi':
        saveSoft(ODLUKE_CEKAM_KEY, true); // provjeravaj odluku u pozadini dok ne stigne
        run(() => qSek(sb().from('sekcija_clanovi').insert({ sekcija_id: sid, korisnik_id: me().id })), 'Zahtjev poslan — javićemo ti odluku');
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
        else if (!canManageSek(sid)) run(() => qSek(sb().rpc('odobri_zahtjev', { p_sekcija: sid, p_korisnik: uid })), 'Pristup odobren');
        else run(() => qSek(sb().from('sekcija_clanovi').update({ status: 'odobren' }).eq('sekcija_id', sid).eq('korisnik_id', uid)), 'Pristup odobren');
        break;
      case 'prebaci': {
        const target = b.closest('li')?.querySelector('[data-prebaci]')?.value;
        if (!target) { toast('Izaberi sekciju u koju se prebacuje'); break; }
        run(() => qSek(sb().rpc('premjesti_zahtjev', { p_iz: sid, p_u: target, p_korisnik: uid })), 'Zahtjev prebačen u drugu sekciju');
        break;
      }
      case 'odbij':
        if (invitedBy(sid, uid)) { run(() => qSek(sb().rpc('odbij_pozvanog', { p_sekcija: sid, p_korisnik: uid })), 'Predlog odbijen, nalog obrisan'); break; }
        // Prvi dodir otvara razlog (neobavezan), drugi potvrđuje — odbijanje se ne dešava slučajno.
        if (odbijanje.has(`${sid}|${uid}`)) odbijanje.delete(`${sid}|${uid}`); else odbijanje.set(`${sid}|${uid}`, '');
        render();
        $('sekcije-spisak').querySelector(`[data-id="${CSS.escape(sid)}"][data-uid="${CSS.escape(uid)}"] [data-razlog], [data-id="${CSS.escape(sid)}"] [data-uid="${CSS.escape(uid)}"] [data-razlog]`)?.focus();
        break;
      case 'odbij-odustani':
        odbijanje.delete(`${sid}|${uid}`);
        render();
        break;
      case 'odbij-potvrdi': {
        const razlog = (b.closest('[data-uid]').querySelector('[data-razlog]')?.value || '').trim().slice(0, RAZLOG_MAX);
        odbijanje.delete(`${sid}|${uid}`);
        run(async () => {
          try {
            await qSek(sb().rpc('odbij_zahtjev_razlog', { p_sekcija: sid, p_korisnik: uid, p_razlog: razlog }));
          } catch (err) {
            if (!nemaNaServeru(err)) throw err;
            // server bez 040: stari put (bez razloga)
            if (!canManageSek(sid)) await qSek(sb().rpc('odbij_zahtjev', { p_sekcija: sid, p_korisnik: uid }));
            else await qSek(sb().from('sekcija_clanovi').delete().eq('sekcija_id', sid).eq('korisnik_id', uid));
          }
        }, 'Zahtjev odbijen');
        break;
      }
      case 'odobri-sve': {
        if (!b.dataset.naoruzano) {
          b.dataset.naoruzano = '1';
          b.textContent = `Dodirni ponovo: odobri ${b.dataset.broj}`;
          setTimeout(() => { delete b.dataset.naoruzano; b.textContent = `Odobri sve (${b.dataset.broj})`; }, 4000);
          break;
        }
        const list = bulkApprovable(sid, data.clanovi);
        run(async () => {
          for (const c of list) {
            if (canManageSek(sid)) await qSek(sb().from('sekcija_clanovi').update({ status: 'odobren' }).eq('sekcija_id', sid).eq('korisnik_id', c.korisnik_id));
            else await qSek(sb().rpc('odobri_zahtjev', { p_sekcija: sid, p_korisnik: c.korisnik_id }));
          }
        }, `Odobreno: ${list.length}`);
        break;
      }
      case 'opis': {
        const opis = card.querySelector('[data-opis]').value.trim().slice(0, 500);
        const okupljanje = card.querySelector('[data-okupljanje]').value.trim().slice(0, 200);
        run(async () => {
          try {
            await qSek(sb().from('sekcije').update({ opis: opis || null, okupljanje: okupljanje || null }).eq('id', sid));
          } catch (err) {
            if (nemaNaServeru(err)) throw new Error('server još nema opis sekcije (administrator treba nadograditi server)');
            throw err;
          }
        }, 'Opis sačuvan');
        break;
      }
      case 'csv': {
        const sek = data.sekcije.find((x) => x.id === sid);
        const users = loadJSON('lovac.clanovi', []);
        const rows = memberRows(sek, data.clanovi, users);
        if (!rows.length) { toast('Sekcija nema članova za izvoz'); break; }
        const kako = saveFile(memberCsvName(sek), 'text/csv;charset=utf-8', toCsv(rows, MEMBER_CSV_COLUMNS));
        toast(kako === 'preuzimanja' ? 'Spisak je sačuvan u Preuzimanja/Lovac' : 'Spisak članova je spreman');
        break;
      }
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
        run(() => qSek(sb().from('sekcije').update({ grupovodja_id: card.querySelector('[data-gv]').value || null }).eq('id', sid)), 'Lovovođa sekcije sačuvan');
        break;
      case 'revir':
        run(() => qSek(sb().from('sekcije').update({ revir_id: card.querySelector('[data-revir]').value }).eq('id', sid)), 'Sekcija je premještena u revir');
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

  // Učitavanje loga sekcije (mala slika, 128 px): lovovođa sekcije ili admin. Polje za fajl je JEDNO i van spiska:
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

  // ---- lovovođe sekcije (admin) ----
  $('btn-grupovodja-dodaj').addEventListener('click', () => run(() => qSek(getClient().from('grupovodje')
    .insert({ korisnik_id: $('grupovodja-korisnik').value, revir_id: $('grupovodja-revir').value })), 'Lovovođa sekcije postavljen'));
  $('grupovodje-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="ukloni-gv"]');
    if (!b) return;
    const row = b.closest('[data-uid]');
    run(() => qSek(getClient().from('grupovodje').delete().eq('korisnik_id', row.dataset.uid).eq('revir_id', row.dataset.revir)), 'Lovovođa sekcije uklonjen');
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
    const allowed = creatableRevirIds(me(), data.grupovodje, data.reviri, data.lovocuvari);
    $('sekcija-revir').innerHTML = data.reviri.filter((r) => allowed.includes(r.id)).map((r) => opt(r.id, r.naziv)).join('');
    // admin i lovočuvar revira biraju lovovođu sekcije nove sekcije; grupovođa revira pravi sekciju za sebe
    const picks = allowed.some((id) => editsRevir(me(), id, data.lovocuvari));
    $('sekcija-admin-polja').hidden = !picks;
    if (picks) {
      $('sekcija-grupovodja').innerHTML = '<option value="">— niko —</option>' + users().map((u) => opt(u.id, memberName(u.id))).join('');
    }
    $('sekcija-lovci').innerHTML = users().filter((u) => u.id !== me()?.id).map((u) => `<label class="red-check"><input type="checkbox" value="${escapeHtml(u.id)}"> ${escapeHtml(memberName(u.id))}</label>`).join('')
      || '<p class="sitno">Spisak lovaca se preuzima uz internet.</p>';
    // lovočuvar (koji nije admin) ne dodaje članove — to radi lovovođa sekcije (RLS sekcija_clanovi)
    const keeperOnly = !me()?.is_admin && !data.grupovodje.some((g) => g.korisnik_id === me()?.id);
    $('sekcija-lovci-naslov').hidden = keeperOnly;
    $('sekcija-lovci').hidden = keeperOnly;
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
    const picks = editsRevir(me(), f.revir.value, data.lovocuvari);
    const ids = $('sekcija-lovci').hidden ? [] : [...$('sekcija-lovci').querySelectorAll('input:checked')].map((i) => i.value);
    try {
      const row = (await qSek(getClient().from('sekcije').insert({
        revir_id: f.revir.value, naziv,
        grupovodja_id: picks ? (f.grupovodja.value || null) : me().id,
        created_by: me().id,
      }).select('*')))[0];
      if (ids.length) await qSek(getClient().from('sekcija_clanovi').insert(ids.map((id) => ({ sekcija_id: row.id, korisnik_id: id, status: 'odobren' }))));
      form.hidden = true;
      screen.hidden = false;
      toast(ids.length || picks === false ? 'Sekcija napravljena' : 'Sekcija napravljena — članove dodaje lovovođa sekcije');
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
