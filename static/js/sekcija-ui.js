// Tab sekcije: ime sekcije u donjoj navigaciji, ekran sa članovima (aktivnost u tekućem lovu),
// porukama i svim podacima o sekciji i lovu. Podaci se keširaju (radi offline), poruke imaju
// izlazni red (klijentski UUID) i šalju se kad ima veze.

import { getClient, cachedProfile } from './auth.js';
import { idbAll, idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { downloadHunts } from './lov-ui.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { mySections, currentHunt, memberActivity, sectionMembers, huntCreatePlan, addableMembers, CLAN_FILTERI, huntersCounts, filterHunters, faceStrip, huntCountsByMember, sortByActivity } from './sekcija-podaci.js';
import { matchesQuery } from './pretraga.js';
import { uuid } from './zapisi.js';
import { trailEnabled } from './lov-tragovi-ui.js';
import { avatarOf } from './profil-ui.js';
import { logoStyle } from './sekcija-logo.js';
import { initialsOf } from './lokacija.js';
import { huntDateText } from './lov.js';
import { myStatus, pendingRequests, pristupText, creationMode, isLeadership, seesSectionList, groupSectionsByRevir } from './sekcije.js';
import {
  validateMessage, newMessage, unreadCount, QUICK_MESSAGES, KANAL_RUKOVODSTVO,
} from './poruke.js';
import { getSpisakAll } from './spiskovi.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';
import { canPing } from './ping.js';
import { organizableSections, lastHuntPreset, huntTargets, canManageHunt } from './lov-traje.js';
import { deleteHunt } from './lov-brisanje.js';
import { sendPing } from './ping-ui.js';
import { createMessageSync } from './sekcija-poruke.js';
import { membersHtml, huntCardHtml, conversationHtml, groupsHtml, U_LOVU } from './sekcija-render.js';
import { canManageGroups, groupsOfSection, ungroupedMembers, groupLeaderCandidates, assignableGroups } from './grupe.js';

const SEL_KEY = 'lovac.sekcija.izabrana';
const NOTIF_KEY = 'lovac.sekcija.obavijest';
const READ_KEY = (id) => `lovac.sekcija.procitano.${id}`;
const POLL_OPEN_MS = 20000;
const POLL_BG_MS = 60000;
const LISTS_OPEN_MS = 60000;
const LISTS_BG_MS = 5 * 60000;
const HUNT_REFRESH_MS = 60000;
const ULOGE_SEKCIJE = { admin: 'Administrator', grupovodja: 'Lovovođa sekcije', lovocuvar: 'Lovočuvar revira', clan: 'Član' };
const STATUS_LOVA = { planiran: 'Planiran', u_toku: 'U toku', zavrsen: 'Završen' };
const $ = (id) => document.getElementById(id);

async function qSk(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

export function initSekcijaEkran(L, map) {
  const screen = $('sekcija-ekran');
  let ctx = { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [], grupe: [], revirVodje: [], drustvoUloge: [] };
  let lovovi = [];
  let poruke = [];
  let vrste = [];
  let extra = { pozicije: [], odstrel: [], sos: [], lovId: null }; // uživo podaci tekućeg lova
  let odazivi = { lovId: null, rows: [] }; // "Dolaziš?" odgovori za lovovođu sekcije (034); čita se samo dok je tab otvoren
  let selectedId = loadJSON(SEL_KEY, null);
  let lastHuntRefresh = 0;
  let lastListsRefresh = 0;
  const lovciOtvoreni = new Set(); // sekcije čiji je spisak lovaca rasklopljen (admin/lovočuvar)
  let timer = null;
  let marker = null;
  const me = () => cachedProfile();
  const online = () => isServerConfigured() && connectionQuality() !== 'nema' && Boolean(getClient());
  const isOpen = () => !screen.hidden;

  const mine = () => mySections(ctx, me());
  const selected = () => {
    const list = mine();
    return list.find((s) => s.id === selectedId) || list[0] || null;
  };

  // ---------- podaci ----------
  // Zadnje pokrenuto čitanje pobjeđuje: sporije čitanje započeto prije novog upisa ne smije prepisati svježe stanje.
  let porukeSeq = 0;
  let memFilter = 'svi';
  let memQuery = '';
  let memOrder = 'redom'; // 'redom' | 'aktivnost'
  const reloadPoruke = async () => {
    const t = ++porukeSeq;
    const rows = await idbAll('poruke');
    // IndexedDB vraća redom po id-u (UUID), a razgovor mora ići hronološki.
    if (t === porukeSeq) {
      poruke = rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
      document.dispatchEvent(new CustomEvent('poruke:promjena'));
    }
  };

  const loadLocal = async () => {
    ctx = await cachedSekcije();
    lovovi = await idbAll('lovovi');
    await reloadPoruke();
    vrste = await getSpisakAll('vrste');
  };

  const leader = () => isLeadership(me(), ctx);
  const rukPoruke = () => poruke.filter((m) => m.kanal === KANAL_RUKOVODSTVO);

  const unreadTotal = () => mine().reduce((n, s) => n + unreadCount(
    poruke.filter((m) => m.sekcija_id === s.id), loadJSON(READ_KEY(s.id), null), me()?.id), 0)
    + (leader() ? unreadCount(rukPoruke(), loadJSON(READ_KEY(KANAL_RUKOVODSTVO), null), me()?.id) : 0);

  const updateNav = () => {
    // Admin vidi sve sekcije: tab je "Sekcije" (spisak + izbor unutra), ne naziv jedne sekcije.
    const wide = seesSectionList(me(), ctx);
    const s = wide ? null : selected();
    $('nav-sekcija-ime').textContent = wide ? 'Sekcije' : s ? s.naziv : 'Sekcija';
    $('nav-sekcija-logo').hidden = !s;
    // SVG element nema svojstvo hidden: atribut se postavlja ručno
    if (s) $('nav-sekcija-ikona').setAttribute('hidden', ''); else $('nav-sekcija-ikona').removeAttribute('hidden');
    if (s) $('nav-sekcija-logo').setAttribute('style', logoStyle(s));
    const n = unreadTotal();
    const badge = $('nav-sekcija-znacka');
    badge.hidden = n === 0;
    badge.textContent = n === 0 ? '' : n > 99 ? '99+' : String(n);
  };

  const markRead = () => {
    const s = selected();
    if (!s || !isOpen()) return;
    const last = poruke.filter((m) => m.sekcija_id === s.id).map((m) => m.created_at).sort().pop();
    if (last) saveSoft(READ_KEY(s.id), last);
    const lastRuk = rukPoruke().map((m) => m.created_at).sort().pop();
    if (lastRuk) saveSoft(READ_KEY(KANAL_RUKOVODSTVO), lastRuk);
    updateNav();
  };

  const { pullMessages, flushOutbox } = createMessageSync({
    client: getClient, me, mine, leader, ctx: () => ctx, poruke: () => poruke, rukPoruke, reload: reloadPoruke, isOpen, q: qSk,
  });

  const pullLive = async (zapis) => {
    if (!zapis || zapis.lov.status !== 'u_toku') { extra = { pozicije: [], odstrel: [], sos: [], lovId: null }; return; }
    const sb = getClient();
    const id = zapis.lov.id;
    const [pozicije, odstrel, sos] = await Promise.all([
      qSk(sb.from('lov_pozicije').select('*').eq('lov_id', id)),
      qSk(sb.from('lov_odstrel').select('*').eq('lov_id', id)),
      qSk(sb.from('sos').select('*').eq('lov_id', id)),
    ]);
    extra = { pozicije, odstrel, sos, lovId: id };
  };

  const pullOdazivi = async (s, zapis) => {
    const st = myStatus(s, ctx.clanovi, me()?.id, Boolean(me()?.is_admin), ctx.lovocuvari);
    if (!zapis || !['grupovodja', 'admin'].includes(st) || zapis.lov.status === 'zavrsen') { odazivi = { lovId: null, rows: [] }; return; }
    const { data, error } = await getClient().from('lov_odazivi').select('korisnik_id,odgovor').eq('lov_id', zapis.lov.id);
    odazivi = { lovId: zapis.lov.id, rows: error ? [] : data || [] }; // bez migracije 034: prazno
  };

  const refresh = async ({ withHunts = false } = {}) => {
    if (!online()) return;
    try {
      // spiskovi sekcija i članova se rijetko mijenjaju: ne pri svakom osvježavanju (štedi besplatni server)
      if (withHunts || Date.now() - lastListsRefresh > (isOpen() ? LISTS_OPEN_MS : LISTS_BG_MS)) {
        await downloadSekcije({ grupe: withHunts || isOpen() });
        await refreshMembers().catch(() => {});
        lastListsRefresh = Date.now();
      }
      if (withHunts || Date.now() - lastHuntRefresh > HUNT_REFRESH_MS) {
        await downloadHunts();
        lastHuntRefresh = Date.now();
      }
      await loadLocal();
      await flushOutbox();
      await pullMessages();
      const s = selected();
      if (s) await pullLive(currentHunt(lovovi, s.id)?.zapis);
      if (s && isOpen()) await pullOdazivi(s, currentHunt(lovovi, s.id)?.zapis);
      $('sk-status').textContent = '';
    } catch (err) {
      $('sk-status').textContent = `Nema veze sa serverom — prikazani su sačuvani podaci (${err.message})`;
    }
    updateNav();
    if (isOpen()) render();
  };

  // ---------- prikaz ----------
  // Crtanje je u sekcija-render.js (čiste funkcije); ovdje se samo skuplja stanje.
  const renderCtx = (s, cur, st) => ({ s, cur, st, myId: me()?.id, clanovi: ctx.clanovi, odazivi, nameOf: memberName, extra, vrste, traceOn: cur ? trailEnabled(cur.zapis.lov.id) : false });
  // Ko vodi baš OVAJ lov (grupovođa svoje grupe, lovovođa sekcije samo uz dopuštenje) određuje `canManageHunt`, ne uloga u sekciji.
  const huntCard = (s, cur, users, st) => {
    const eff = !cur ? (organizableSections(ctx, me()).some((x) => x.id === s.id) ? (me()?.is_admin ? 'admin' : 'grupovodja') : st) : canManageHunt(cur.zapis, ctx, me()) ? (me()?.is_admin ? 'admin' : 'grupovodja') : ['admin', 'grupovodja'].includes(st) ? 'clan' : st;
    return huntCardHtml(renderCtx(s, cur, eff));
  };
  const chatHtml = (list, showHunt) => conversationHtml(list, { showHunt, myId: me()?.id, nameOf: memberName });

  const render = () => {
    const list = mine();
    const s = selected();
    const sel = $('sk-izbor');
    const admin = seesSectionList(me(), ctx);
    sel.hidden = admin || list.length < 2;
    const lista = $('sk-lista');
    lista.hidden = !admin || list.length === 0;
    lista.innerHTML = admin ? groupSectionsByRevir(list, ctx.reviri).map((g) => `<span class="sk-lista-revir">Revir ${escapeHtml(g.revir)}</span>${g.sekcije.map((x) => `<button type="button" class="sk-lista-stavka" data-sid="${escapeHtml(x.id)}" aria-pressed="${Boolean(s && x.id === s.id)}"><span class="sek-logo mali" style="${escapeHtml(logoStyle(x))}"></span><b>${escapeHtml(x.naziv)}</b></button>`).join('')}`).join('') : '';
    sel.innerHTML = list.map((x) => `<option value="${escapeHtml(x.id)}" ${s && x.id === s.id ? 'selected' : ''}>${escapeHtml(x.naziv)}</option>`).join('');
    $('sk-prazno').hidden = Boolean(s);
    $('sk-sadrzaj').hidden = !s;
    $('sk-naslov').textContent = admin ? 'Sekcije' : s ? s.naziv : 'Sekcija';
    if (!s) { $('sk-podnaslov').textContent = ''; return; }
    const users = loadJSON('lovac.clanovi', []);
    const revir = ctx.reviri.find((r) => r.id === s.revir_id);
    const st = myStatus(s, ctx.clanovi, me()?.id, Boolean(me()?.is_admin), ctx.lovocuvari);
    const lovocuvari = ctx.lovocuvari.filter((l) => l.revir_id === s.revir_id).map((l) => memberName(l.korisnik_id));
    const cur = currentHunt(lovovi, s.id);
    $('sk-podnaslov').textContent = `Revir ${revir?.naziv || ''} · ${pristupText(st)}`;
    const mode = creationMode(st);
    $('btn-sk-novi').hidden = !mode;
    $('btn-sk-novi').textContent = mode === 'direct' ? 'Dodaj lovca (novi nalog)' : 'Predloži lovca (odobrava lovovođa sekcije)';
    const checked = new Set([...$('sk-lov').querySelectorAll('[data-spisak] input:checked')].map((i) => i.value));
    $('sk-lov').innerHTML = huntCard(s, cur, users, st);
    $('sk-lov').querySelectorAll('[data-spisak] input').forEach((i) => { i.checked = checked.has(i.value); });

    // članovi i aktivnost
    const rows = sectionMembers(s, ctx.clanovi, ctx.lovocuvari, users);
    const lov = cur?.zapis.lov || null;
    const uc = cur?.zapis.ucesnici || [];
    const poz = extra.lovId && lov && extra.lovId === lov.id ? extra.pozicije : [];
    $('sk-broj').textContent = `(${rows.length})`;
    $('sk-logo').setAttribute('style', logoStyle(s));
    $('sk-uloga').textContent = ULOGE_SEKCIJE[st] || '';
    $('sk-uloga').dataset.uloga = st;
    $('sk-stat-clanova').textContent = String(rows.length);
    $('sk-stat-aktivnih').textContent = String(uc.filter((u) => memberActivity(u.korisnik_id, lov, uc, poz).stanje === 'aktivan').length);
    $('sk-stat-lovova').textContent = String(lovovi.filter((z) => z.lov.sekcija_id === s.id).length);
    const actOf = (id) => memberActivity(id, lov, uc, poz);
    const cnt = huntersCounts(rows, actOf);
    $('sk-brojevi').innerHTML = `<span class="sk-broj" data-b="aktivni"><b>${cnt.aktivni}</b> aktivnih</span>`
      + `<span class="sk-broj" data-b="bez-signala"><b>${cnt.bezSignala}</b> bez signala</span>`
      + `<span class="sk-broj" data-b="vodstvo"><b>${cnt.vodstvo}</b> vodstvo</span>`;
    $('sk-filter').querySelectorAll('[data-mf]').forEach((b) => {
      const f = CLAN_FILTERI.find((x) => x.id === b.dataset.mf);
      b.textContent = `${f.naziv} (${cnt[f.id]})`;
      b.setAttribute('aria-pressed', String(b.dataset.mf === memFilter));
    });
    const strip = faceStrip(rows);
    $('sk-lica').innerHTML = strip.lica.map((r) => `<span class="sk-avatar sk-lice${avatarOf(r.id) ? ' ima-sliku' : ''}" data-stanje="${actOf(r.id).stanje}" title="${escapeHtml(r.ime)}"${avatarOf(r.id) ? ` style="background-image:url('${avatarOf(r.id)}')"` : ''}>${avatarOf(r.id) ? '' : escapeHtml(initialsOf(r.ime))}</span>`).join('')
      + (strip.ostalo ? `<span class="sk-lice-vise">+${strip.ostalo}</span>` : '');
    const sklopivo = seesSectionList(me(), ctx);
    const otvoreno = !sklopivo || lovciOtvoreni.has(s.id);
    $('sk-k-clanovi').classList.toggle('sklopljeno', !otvoreno);
    $('btn-sk-lovci').setAttribute('aria-expanded', String(otvoreno));
    $('btn-sk-lovci').disabled = !sklopivo;
    const lovCounts = huntCountsByMember(lovovi, s.id);
    $('sk-poredak').querySelectorAll('[data-por]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.por === memOrder)));
    const filtered = filterHunters(rows, actOf, memFilter, memQuery, matchesQuery);
    const shown = memOrder === 'aktivnost' ? sortByActivity(filtered, lovCounts) : filtered;
    $('sk-clanovi').innerHTML = membersHtml(shown, {
      actOf, myId: me()?.id, st, lovCounts, avatarOf, canPing, total: rows.length,
    });

    const manageG = canManageGroups(st, { myId: me()?.id, sekcija: s, revirVodje: ctx.revirVodje, drustvoUloge: ctx.drustvoUloge });
    const groups = groupsOfSection(s.id, ctx.grupe, ctx.clanovi, memberName);
    $('sk-grupe').innerHTML = groupsHtml({
      groups, manage: manageG, myId: me()?.id,
      ungrouped: ungroupedMembers(s.id, ctx.grupe, ctx.clanovi, memberName),
      candidates: groupLeaderCandidates(s.id, ctx.grupe, ctx.clanovi, memberName),
      assignable: assignableGroups(groups, { manage: manageG, myId: me()?.id }),
    });
    $('sk-grupe-broj').textContent = groups.length ? `(${groups.length})` : '';

    queueMicrotask(() => document.dispatchEvent(new Event('sekcija:nacrtana')));
    // poruke
    const msgs = poruke.filter((m) => m.sekcija_id === s.id);
    $('sk-poruke').innerHTML = chatHtml(msgs, true) || '<p class="sitno poruke-prazno">Još nema poruka. Pošalji prvu ili dodirni brzu poruku ispod.</p>';
    const box = $('sk-poruke');
    box.scrollTop = box.scrollHeight;
    $('sk-brze').innerHTML = QUICK_MESSAGES.map((t) => `<button type="button" data-brza="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');

    // rukovodstvo (lovovođe sekcije, lovočuvari, admin)
    const isLeader = leader();
    $('sk-k-ruk').hidden = !isLeader;
    $('sk-nav-ruk').hidden = !isLeader;
    if (isLeader) {
      const ruk = rukPoruke();
      $('sk-ruk-poruke').innerHTML = chatHtml(ruk, false) || '<p class="sitno poruke-prazno">Još nema poruka u rukovodstvu.</p>';
      $('sk-ruk-poruke').scrollTop = $('sk-ruk-poruke').scrollHeight;
    }

    // svi podaci
    const huntsOfSection = lovovi.filter((z) => z.lov.sekcija_id === s.id).sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)));
    const pending = pendingRequests(s.id, ctx.clanovi).length;
    $('sk-podaci').innerHTML = `<dl class="tabela-info">
        <dt>Revir</dt><dd>${escapeHtml(revir?.naziv || '—')}</dd>
        <dt>Lovovođa sekcije</dt><dd>${s.grupovodja_id ? escapeHtml(memberName(s.grupovodja_id)) : '—'}</dd>
        <dt>Lovočuvar revira</dt><dd>${lovocuvari.length ? escapeHtml(lovocuvari.join(', ')) : '—'}</dd>
        <dt>Članova</dt><dd>${rows.length}</dd>
        ${['grupovodja', 'admin'].includes(st) ? `<dt>Zahtjeva na čekanju</dt><dd>${pending}</dd>` : ''}
        <dt>Lovova sekcije</dt><dd>${huntsOfSection.length}</dd>
      </dl>
      <h4>Lovovi sekcije</h4>
      <ul class="spisak">${huntsOfSection.map((z) => `<li class="trag-red" data-lov="${escapeHtml(z.lov.id)}">
        <b>${escapeHtml(z.lov.naziv)}</b> <span class="sitno">${escapeHtml(huntDateText(z.lov.datum))} · ${STATUS_LOVA[z.lov.status] || z.lov.status} · učesnika ${z.ucesnici.length} · stanova ${z.stanovi.length}</span>
        <button type="button" class="dugme" data-akcija="raspored" data-lov="${escapeHtml(z.lov.id)}">Raspored na karti</button>
        ${['grupovodja', 'admin'].includes(st) ? `<button type="button" class="dugme" data-akcija="lov-obrisi" data-lov="${escapeHtml(z.lov.id)}">Obriši lov</button>` : ''}</li>`).join('') || '<li class="sitno">Još nema lovova ove sekcije (preuzimaju se uz internet).</li>'}</ul>`;
    markRead();
  };

  // ---------- događaji ----------
  const open = async () => {
    screen.hidden = false;
    await loadLocal();
    render();
    refresh({ withHunts: true });
    clearInterval(timer);
    timer = setInterval(() => refresh(), POLL_OPEN_MS);
  };
  const close = () => {
    screen.hidden = true;
    clearInterval(timer);
    timer = null;
  };

  $('btn-sekcija').addEventListener('click', open);
  $('sk-izbor').addEventListener('change', async (e) => {
    selectedId = e.target.value;
    saveSoft(SEL_KEY, selectedId);
    updateNav();
    render();
    refresh({ withHunts: true });
  });
  // Admin i lovočuvar vide mnogo sekcija: spisak lovaca je zadano sklopljen; dodir na sekciju ga rasklapa (drugi dodir
  // na istu sekciju ili na naslov kartice ga sklapa). Lovovođa sekcije i lovac uvijek vide svoje lovce.
  const toggleLovci = (sid, open) => {
    if (open ?? !lovciOtvoreni.has(sid)) lovciOtvoreni.add(sid); else lovciOtvoreni.delete(sid);
  };
  $('btn-sk-lovci').addEventListener('click', () => { const s = selected(); if (s) { toggleLovci(s.id); render(); } });
  $('sk-lista').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sid]');
    if (!b) return;
    toggleLovci(b.dataset.sid, b.dataset.sid === selectedId ? undefined : true);
    selectedId = b.dataset.sid;
    saveSoft(SEL_KEY, selectedId);
    updateNav();
    render();
    refresh({ withHunts: true });
  });
  $('sk-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mf]');
    if (b) { memFilter = b.dataset.mf; render(); }
  });
  $('sk-poredak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-por]');
    if (b) { memOrder = b.dataset.por; render(); }
  });
  $('sk-pretraga').addEventListener('input', (e) => { memQuery = e.target.value; render(); });
  $('sk-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cilj]');
    if (b) $(b.dataset.cilj).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // Traka dijelova pokazuje gdje se lovac nalazi: aktivan je zadnji dio čiji vrh je prošao ispod trake.
  const markNav = () => {
    const navBottom = $('sk-nav').getBoundingClientRect().bottom;
    // Redoslijed dugmadi u traci nije isti kao redoslijed kartica: bira se kartica sa najnižim vrhom koji je prošao traku.
    let current = null;
    let best = -Infinity;
    for (const b of $('sk-nav').querySelectorAll('[data-cilj]')) {
      const t = $(b.dataset.cilj);
      if (b.hidden || !t || t.hidden) continue;
      const top = t.getBoundingClientRect().top;
      if (top <= navBottom + 24 && top > best) { best = top; current = b; }
    }
    if (!current) current = [...$('sk-nav').querySelectorAll('[data-cilj]')].find((b) => !b.hidden && !$(b.dataset.cilj)?.hidden) || null;
    $('sk-nav').querySelectorAll('[data-cilj]').forEach((b) => b.setAttribute('aria-current', String(b === current)));
  };
  screen.addEventListener('scroll', markNav, { passive: true });
  document.addEventListener('sekcija:nacrtana', markNav);
  $('btn-sk-novi').addEventListener('click', () => document.dispatchEvent(new CustomEvent('lovac:novi', { detail: { sekcijaId: selected()?.id } })));
  $('btn-sk-pristup').addEventListener('click', () => { close(); $('btn-sekcije').click(); });

  // Radnje nad lovom traže internet; poslije svake se raspored ponovo preuzima da svi vide isto.
  const runHunt = async (fn, ok) => {
    if (!online()) { toast('Potreban je internet'); return; }
    try {
      await fn();
      await downloadHunts();
      lastHuntRefresh = Date.now();
      await loadLocal();
      render();
      updateNav();
      if (ok) toast(ok);
    } catch (err) {
      toast(/row-level security|permission/i.test(err.message) ? 'Server nije dozvolio (lovovođa sekcije te je uklonio iz lova ili lov nije otvoren)' : `Nije uspjelo: ${err.message}`);
    }
  };
  let armedRemove = null;

  const huntAction = async (b) => {
    const s = selected();
    const cur = s && currentHunt(lovovi, s.id);
    const sb = getClient();
    const lovId = cur?.zapis.lov.id;
    const uid = b.closest('[data-uid]')?.dataset.uid;
    switch (b.dataset.akcija) {
      case 'lov-novi':
        openNewHunt(s);
        break;
      case 'lov-pokreni':
      case 'lov-zavrsi':
        await runHunt(() => qSk(sb.from('lovovi').update({ status: b.dataset.akcija === 'lov-pokreni' ? 'u_toku' : 'zavrsen' }).eq('id', lovId)),
          b.dataset.akcija === 'lov-pokreni' ? 'Lov je počeo' : 'Lov je završen');
        break;
      case 'lov-obrisi': {
        // brisanje je za sve i nepovratno: drugi dodir; lov je onaj sa dugmeta (spisak lovova sekcije) ili tekući
        const meta = b.dataset.lov || lovId;
        if (armedRemove !== `lov:${meta}`) {
          armedRemove = `lov:${meta}`;
          b.textContent = 'Dodirni ponovo — briše lov za sve';
          setTimeout(() => { if (armedRemove === `lov:${meta}`) { armedRemove = null; if (b.isConnected) b.textContent = 'Obriši lov'; } }, 4000);
          break;
        }
        armedRemove = null;
        await runHunt(() => deleteHunt(meta), 'Lov je obrisan');
        break;
      }
      case 'lov-prijavi':
        await runHunt(() => qSk(sb.from('lov_ucesnici').insert({ lov_id: lovId, korisnik_id: me().id, uloga: 'strijelac', samoprijava: true })), 'Javljeno: prisutan si');
        break;
      case 'lov-odjavi':
        await runHunt(() => qSk(sb.from('lov_ucesnici').delete().eq('lov_id', lovId).eq('korisnik_id', me().id)), 'Odjavljen si iz lova');
        break;
      case 'lov-ukloni': {
        // Uklanjanje traži drugi dodir (WebView nema confirm()).
        if (armedRemove !== uid) {
          armedRemove = uid;
          b.textContent = 'Dodirni ponovo';
          setTimeout(() => { if (armedRemove === uid) { armedRemove = null; b.textContent = 'Ukloni'; } }, 4000);
          break;
        }
        armedRemove = null;
        await runHunt(() => qSk(sb.from('lov_ucesnici').delete().eq('lov_id', lovId).eq('korisnik_id', uid)), 'Uklonjen iz lova');
        break;
      }
      case 'lov-dodaj': {
        const ids = [...$('sk-lov').querySelectorAll('[data-spisak] input:checked')].map((i) => i.value);
        if (!ids.length) { toast('Izaberi bar jednog lovca'); break; }
        await runHunt(() => qSk(sb.from('lov_ucesnici').upsert(ids.map((id) => ({ lov_id: lovId, korisnik_id: id, uloga: 'strijelac' })), { onConflict: 'lov_id,korisnik_id' })), 'Lovci dodani u lov');
        break;
      }
      default:
    }
  };

  screen.addEventListener('change', (e) => {
    const c = e.target.closest('input[data-trag]');
    if (c) document.dispatchEvent(new CustomEvent('lovtrag:trazi', { detail: { lovId: c.dataset.trag, on: c.checked, live: c.dataset.live === 'true' } }));
  });

  // Grupe: sve radnje traže internet (server provodi prava); poslije svake se spiskovi ponovo preuzmu.
  const groupAction = async (b) => {
    const s = selected();
    if (!s) return;
    if (!online()) { toast('Za rad sa grupama potreban je internet'); return; }
    const sb = getClient();
    const akcija = b.dataset.akcija;
    const uid = b.dataset.uid || b.closest('[data-uid]')?.dataset.uid;
    try {
      if (akcija === 'grupa-nova') {
        const gv = $('sk-grupa-gv').value;
        if (!gv) return;
        const [nova] = await qSk(sb.from('grupe').insert({ sekcija_id: s.id, grupovodja_id: gv }).select('id'));
        await qSk(sb.rpc('dodijeli_grupu', { p_sekcija: s.id, p_korisnik: gv, p_grupa: nova.id }));
        toast('Grupa je napravljena');
      } else if (akcija === 'grupa-ukloni') {
        const key = `grupa:${b.dataset.grupa}`;
        if (armedRemove !== key) {
          armedRemove = key;
          b.textContent = 'Dodirni ponovo — lovci ostaju bez grupe';
          setTimeout(() => { if (armedRemove === key) { armedRemove = null; if (b.isConnected) b.textContent = 'Ukloni grupu'; } }, 4000);
          return;
        }
        armedRemove = null;
        await qSk(sb.from('grupe').delete().eq('id', b.dataset.grupa));
        toast('Grupa je uklonjena');
      } else if (akcija === 'grupa-dozvola') {
        await qSk(sb.rpc('dozvoli_visim', { p_grupa: b.dataset.grupa, p_dozvola: b.dataset.nova === 'true' }));
        toast(b.dataset.nova === 'true' ? 'Viši smiju organizovati lov za tvoju grupu' : 'Lov za tvoju grupu organizuješ samo ti');
      } else if (akcija === 'grupa-odobri') {
        await qSk(sb.rpc('dodijeli_grupu', { p_sekcija: s.id, p_korisnik: uid, p_grupa: b.dataset.grupa }));
        toast('Lovac je dodan u grupu');
      } else if (akcija === 'grupa-dodijeli') {
        const g = b.closest('li').querySelector('[data-grupa-izbor]').value;
        await qSk(sb.rpc('dodijeli_grupu', { p_sekcija: s.id, p_korisnik: uid, p_grupa: g }));
        toast('Lovac je dodan u grupu');
      } else if (akcija === 'grupa-izbaci') {
        await qSk(sb.rpc('dodijeli_grupu', { p_sekcija: s.id, p_korisnik: uid, p_grupa: null }));
        toast('Lovac je izvađen iz grupe');
      }
      await downloadSekcije({ grupe: true });
      await loadLocal();
      render();
    } catch (err) {
      toast(/row-level security|permission|42501|Nemaš/i.test(err.message) ? 'Server nije dozvolio ovu radnju' : `Greška: ${err.message}`);
    }
  };

  screen.addEventListener('click', async (e) => {
    const brza = e.target.closest('[data-brza]');
    if (brza) {
      const input = $('forma-poruka').elements.tekst;
      input.value = brza.dataset.brza;
      input.focus();
      return;
    }
    const b = e.target.closest('button[data-akcija]');
    if (!b) return;
    if (b.dataset.akcija.startsWith('lov-')) { await huntAction(b); return; }
    if (b.dataset.akcija.startsWith('grupa-')) { await groupAction(b); return; }
    if (b.dataset.akcija === 'raspored') {
      close();
      document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: b.dataset.lov } }));
    }
    if (b.dataset.akcija === 'ping') {
      const s = selected();
      if (s) await sendPing(s.id, b.closest('[data-uid]').dataset.uid);
      return;
    }
    if (b.dataset.akcija === 'poruka') {
      const row = b.closest('[data-uid]');
      const input = $('forma-poruka').elements.tekst;
      const name = row.querySelector('b').textContent.replace(' (ti)', '');
      input.value = `${name}: `;
      input.focus();
    }
    if (b.dataset.akcija === 'na-karti') {
      const uid = b.closest('[data-uid]').dataset.uid;
      const p = extra.pozicije.find((x) => x.korisnik_id === uid);
      if (!p) return;
      close();
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16));
      if (marker) map.removeLayer(marker);
      marker = L.circleMarker([p.lat, p.lon], { radius: 12, color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 0.9 })
        .bindTooltip(memberName(uid), { permanent: true }).addTo(map);
      setTimeout(() => { if (marker) { map.removeLayer(marker); marker = null; } }, 30000);
    }
  });

  $('forma-ruk').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.target.elements.tekst;
    const err = validateMessage(input.value);
    if (err) { toast(err); return; }
    const m = newMessage({ kanal: KANAL_RUKOVODSTVO, autor_id: me().id, tekst: input.value });
    try {
      await idbPut('poruke', m);
    } catch (er) {
      toast(`Poruka nije sačuvana: ${er.message}`);
      return;
    }
    input.value = '';
    await reloadPoruke();
    render();
    if (online()) { await flushOutbox(); render(); }
  });

  $('forma-poruka').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = selected();
    const input = e.target.elements.tekst;
    const err = validateMessage(input.value);
    if (err) { toast(err); return; }
    const live = currentHunt(lovovi, s.id)?.tip === 'u_toku' ? currentHunt(lovovi, s.id).zapis.lov.id : null;
    const m = newMessage({ sekcija_id: s.id, autor_id: me().id, tekst: input.value, lov_id: live });
    try {
      await idbPut('poruke', m);
    } catch (er) {
      toast(`Poruka nije sačuvana: ${er.message}`);
      return;
    }
    input.value = '';
    await reloadPoruke();
    render();
    if (online()) { await flushOutbox(); render(); }
  });

  // ---- Modal "Novi lov": naziv, datum, okupljanje/napomena, učesnici, pokreni odmah ----
  const lnSheet = $('sk-lov-forma');
  const lnForm = $('forma-sk-lov');
  let lnSection = null;
  let lnRoles = {};
  let lnHuntId = null; // id lova koji se pravi (isti kroz ponovne pokušaje)
  let lnHuntSection = null;
  let lnPreset = null;
  let lnGrupa = null; // grupa za koju se pravi lov (null = cijela sekcija)
  const lnSync = () => {
    for (const row of lnForm.querySelectorAll('#slf-clanovi .slf-red')) {
      const on = row.querySelector('input').checked;
      const b = row.querySelector('.slf-uloga');
      const u = lnRoles[row.dataset.uid] || 'strijelac';
      b.hidden = !on;
      b.dataset.uloga = u;
      b.textContent = u === 'pogonic' ? 'Pogonič' : 'Strijelac';
    }
  };
  const lnCount = () => {
    lnSync();
    const n = lnForm.querySelectorAll('#slf-clanovi input:checked').length;
    const pog = [...lnForm.querySelectorAll('#slf-clanovi input:checked')].filter((i) => lnRoles[i.value] === 'pogonic').length;
    $('slf-broj').textContent = `(${n + 1} sa tobom${pog ? ` · ${pog} pogonič${pog === 1 ? '' : 'a'}` : ''})`;
  };
  const fillSectionPicker = (choices, s) => {
    $('slf-sekcija-blok').hidden = choices.length < 2;
    $('slf-sekcija-izbor').innerHTML = choices.map((x) => `<option value="${escapeHtml(x.id)}" ${x.id === s.id ? 'selected' : ''}>${escapeHtml(x.naziv)}</option>`).join('');
  };
  const openNewHunt = (s, { izbor = [], odmah = false, grupa, siri = false } = {}) => {
    const mete = huntTargets(s, ctx, me(), memberName);
    if (!mete.length) { toast('Nemaš pravo praviti lov u ovoj sekciji'); return; }
    if (lnSection?.id !== s.id) lnGrupa = null;
    lnGrupa = grupa !== undefined ? grupa : lnGrupa;
    if (!mete.some((m) => m.grupaId === lnGrupa)) lnGrupa = mete[0].grupaId;
    lnSection = s;
    const plan = huntCreatePlan(s, 'x', me()?.id, {});
    lnForm.reset();
    lnForm.naziv.value = plan.lov.naziv;
    lnForm.datum.value = plan.lov.datum;
    $('slf-sekcija').textContent = s.naziv;
    $('slf-status').textContent = online() ? '' : 'Za pravljenje lova potreban je internet.';
    $('slf-grupa-blok').hidden = mete.length < 2;
    $('slf-grupa-izbor').innerHTML = mete.map((m) => `<option value="${escapeHtml(m.grupaId || '')}"${m.grupaId === lnGrupa ? ' selected' : ''}>${escapeHtml(m.tekst)}</option>`).join('');
    // Lov grupe: lovci grupe (grupovođa može proširiti izbor na cijelu sekciju)
    $('slf-sirenje-blok').hidden = !lnGrupa;
    $('slf-sirenje').checked = Boolean(lnGrupa) && siri;
    const uGrupi = new Set(ctx.clanovi.filter((c) => c.sekcija_id === s.id && c.grupa_id === lnGrupa).map((c) => c.korisnik_id));
    const ids = addableMembers(s, ctx.clanovi, []).filter((id) => id !== me()?.id && (!lnGrupa || siri || uGrupi.has(id)))
      .sort((a, b) => memberName(a).localeCompare(memberName(b), 'bs'));
    lnRoles = {};
    $('slf-clanovi').innerHTML = ids.map((id) => `<div class="slf-red" data-uid="${escapeHtml(id)}" data-ime="${escapeHtml(memberName(id))}">
        <label class="red-check"><input type="checkbox" value="${escapeHtml(id)}"> ${escapeHtml(memberName(id))}</label>
        <button type="button" class="dugme slf-uloga" data-uloga="strijelac" hidden>Strijelac</button></div>`).join('')
      || '<p class="sitno">U sekciji još nema drugih odobrenih članova.</p>';
    $('btn-slf-svi').hidden = !ids.length;
    $('slf-trazi').value = '';
    $('slf-trazi').hidden = ids.length < 8;
    lnPreset = lastHuntPreset(lovovi, s.id, me()?.id);
    $('btn-slf-zadnji').hidden = !lnPreset?.ids.some((id) => ids.includes(id));
    fillSectionPicker(izbor.length ? izbor : [s], s);
    lnForm.pokreni.checked = odmah;
    lnCount();
    lnSheet.hidden = false;
  };
  $('slf-grupa-izbor').addEventListener('change', (e) => {
    if (lnSection) openNewHunt(lnSection, { izbor: organizableSections(ctx, me()), odmah: lnForm.pokreni.checked, grupa: e.target.value || null });
  });
  $('slf-sirenje').addEventListener('change', () => {
    if (lnSection) openNewHunt(lnSection, { izbor: organizableSections(ctx, me()), odmah: lnForm.pokreni.checked, siri: $('slf-sirenje').checked });
  });
  $('slf-sekcija-izbor').addEventListener('change', (e) => {
    const s = ctx.sekcije.find((x) => x.id === e.target.value);
    const izbor = organizableSections(ctx, me());
    if (s) openNewHunt(s, { izbor, odmah: lnForm.pokreni.checked });
  });
  // "+" → Dodaj lov: sekcija koja je otvorena u tabu ako je smijem organizovati, inače prva; lov se odmah pokreće.
  document.addEventListener('lov:dodaj', async () => {
    await loadLocal();
    const izbor = organizableSections(ctx, me());
    if (!izbor.length) { toast('Lov pravi lovovođa sekcije ili administrator'); return; }
    const cur = selected();
    openNewHunt(izbor.find((x) => x.id === cur?.id) || izbor[0], { izbor, odmah: true });
  });
  // Upravljanje iz ekrana "Lov traje" / "Lov danas": isto kao dugmad u tabu sekcije (server provjerava pravo).
  document.addEventListener('lov:upravljanje', async (e) => {
    const { akcija, lovId, ids = [], uloge = {} } = e.detail;
    const sb = getClient();
    if (akcija === 'pokreni' || akcija === 'zavrsi') {
      await runHunt(() => qSk(sb.from('lovovi').update({ status: akcija === 'pokreni' ? 'u_toku' : 'zavrsen' }).eq('id', lovId)),
        akcija === 'pokreni' ? 'Lov je počeo' : 'Lov je završen');
    } else if (akcija === 'dodaj') {
      if (!ids.length) { toast('Izaberi bar jednog lovca'); return; }
      await runHunt(() => qSk(sb.from('lov_ucesnici').upsert(ids.map((id) => ({ lov_id: lovId, korisnik_id: id, uloga: uloge[id] === 'pogonic' ? 'pogonic' : 'strijelac' })),
        { onConflict: 'lov_id,korisnik_id' })), ids.length === 1 ? 'Lovac je dodan u lov' : 'Lovci su dodani u lov');
    }
    document.dispatchEvent(new CustomEvent('lovovi:promjena'));
  });
  // Poruka iz ekrana "Lov traje": ista izlazna kutija kao poruke sekcije, označena lovom.
  document.addEventListener('lov:poruka', async (e) => {
    const { sekcijaId, lovId, tekst } = e.detail;
    const err = validateMessage(tekst);
    if (err) { toast(err); return; }
    try {
      await idbPut('poruke', newMessage({ sekcija_id: sekcijaId, autor_id: me().id, tekst, lov_id: lovId }));
    } catch (er) {
      toast(`Poruka nije sačuvana: ${er.message}`);
      return;
    }
    await reloadPoruke();
    if (isOpen()) render();
    if (online()) { await flushOutbox(); await reloadPoruke(); }
  });
  // Ekran "Lov traje" traži svježe poruke (otvoren je, pa ne čeka pozadinsko osvježavanje od 60 s).
  document.addEventListener('lov:poruke-osvjezi', async () => {
    if (!online()) return;
    try { await flushOutbox(); await pullMessages(); } catch (err) { console.warn('poruke lova', err.message); }
  });
  const closeNewHunt = () => { lnSheet.hidden = true; lnSection = null; };
  $('slf-clanovi').addEventListener('change', lnCount);
  $('slf-clanovi').addEventListener('click', (e) => {
    const b = e.target.closest('.slf-uloga');
    if (!b) return;
    const uid = b.closest('[data-uid]').dataset.uid;
    lnRoles[uid] = lnRoles[uid] === 'pogonic' ? 'strijelac' : 'pogonic';
    lnCount();
  });
  $('slf-trazi').addEventListener('input', (e) => {
    for (const row of lnForm.querySelectorAll('#slf-clanovi .slf-red')) row.hidden = !matchesQuery(row.dataset.ime, e.target.value);
  });
  $('btn-slf-zadnji').addEventListener('click', () => {
    if (!lnPreset) return;
    for (const i of lnForm.querySelectorAll('#slf-clanovi input')) i.checked = lnPreset.ids.includes(i.value);
    lnRoles = { ...lnPreset.uloge };
    lnCount();
    toast('Izabrani su lovci iz zadnjeg lova');
  });
  $('btn-slf-svi').addEventListener('click', () => {
    const boxes = [...lnForm.querySelectorAll('#slf-clanovi input')];
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => { b.checked = !all; });
    $('btn-slf-svi').textContent = all ? 'Označi sve' : 'Poništi sve';
    lnCount();
  });
  $('btn-slf-odustani').addEventListener('click', closeNewHunt);
  lnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = lnSection;
    if (!s || !me()) return;
    if (!online()) { $('slf-status').textContent = 'Za pravljenje lova potreban je internet.'; return; }
    // Isti id lova dok pravljenje ne uspije: na slabom signalu ponovni pokušaj ne pravi drugi lov,
    // a upisi su idempotentni (lov bez učesnika se dopuni, ne duplira).
    if (!lnHuntId || lnHuntSection !== s.id) { lnHuntId = uuid(); lnHuntSection = s.id; }
    const plan = huntCreatePlan(s, lnHuntId, me().id, {
      naziv: lnForm.naziv.value, datum: lnForm.datum.value, napomena: lnForm.napomena.value, okupljanje: lnForm.okupljanje.value,
      pokreni: lnForm.pokreni.checked, ucesnici: [...lnForm.querySelectorAll('#slf-clanovi input:checked')].map((b) => b.value), uloge: lnRoles,
    });
    if (lnGrupa) plan.lov.grupa_id = lnGrupa;
    const sb = getClient();
    const btn = lnForm.querySelector('button[type=submit]');
    btn.disabled = true;
    $('slf-status').textContent = 'Šaljem…';
    try {
      await qSk(sb.from('lovovi').upsert(plan.lov, { onConflict: 'id', ignoreDuplicates: true }));
      await qSk(sb.from('lov_ucesnici').upsert(plan.ucesnici, { onConflict: 'lov_id,korisnik_id', ignoreDuplicates: true }));
      if (plan.pokreni) await qSk(sb.from('lovovi').update({ status: 'u_toku' }).eq('id', plan.lov.id));
    } catch (err) {
      // forma ostaje otvorena sa istim izborom; "Napravi lov" ponovo dovršava ISTI lov
      $('slf-status').textContent = /row-level security|permission/i.test(err.message)
        ? `Server nije dozvolio: ${err.message}` : 'Veza je pukla — dodirni "Napravi lov" ponovo kad bude signala (lov se neće duplirati).';
      btn.disabled = false;
      return;
    }
    lnHuntId = null;
    btn.disabled = false;
    closeNewHunt();
    await runHunt(async () => {}, plan.pokreni ? 'Lov je napravljen i pokrenut' : 'Lov je napravljen — članovi se mogu prijaviti');
    document.dispatchEvent(new CustomEvent('lovovi:promjena'));
  });
  registerBackHandler(() => {
    if (lnSheet.hidden) return false;
    closeNewHunt();
    return true;
  });

  registerBackHandler(() => {
    if (screen.hidden) return false;
    close();
    return true;
  });

  // pozadinska provjera (nova poruka -> značka i obavijest dok je app otvorena)
  if (!loadJSON(NOTIF_KEY, 0)) saveSoft(NOTIF_KEY, Date.now());
  loadLocal().then(updateNav).catch((err) => console.warn('sekcija', err));
  setInterval(() => { if (!isOpen() && me()?.odobren) refresh(); }, POLL_BG_MS);
  setTimeout(() => { if (me()?.odobren) refresh(); }, 5000);
  document.addEventListener('sekcije:promjena', () => loadLocal().then(updateNav));
}
