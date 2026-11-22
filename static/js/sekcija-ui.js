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
import { mySections, currentHunt, memberActivity, activityText, sectionMembers, newTodayHunt, huntPresence, addableMembers } from './sekcija-podaci.js';
import { uuid } from './zapisi.js';
import { trailEnabled } from './lov-tragovi-ui.js';
import { avatarOf } from './profil-ui.js';
import { initialsOf } from './lokacija.js';
import { myStatus, pendingRequests, pristupText, creationMode, isLeadership } from './sekcije.js';
import {
  validateMessage, newMessage, mergeMessages, unreadCount, formatMessageTime, QUICK_MESSAGES, KANAL_RUKOVODSTVO,
} from './poruke.js';
import { summarizeHarvest, formatDecimalBs } from './odstrel.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';

const SEL_KEY = 'lovac.sekcija.izabrana';
const NOTIF_KEY = 'lovac.sekcija.obavijest';
const READ_KEY = (id) => `lovac.sekcija.procitano.${id}`;
const POLL_OPEN_MS = 20000;
const POLL_BG_MS = 60000;
const HUNT_REFRESH_MS = 60000;
const ULOGE_SEKCIJE = { admin: 'Administrator', grupovodja: 'Grupovođa', lovocuvar: 'Lovočuvar revira', clan: 'Član' };
const ULOGE = { grupovodja: 'Grupovođa', lovocuvar: 'Lovočuvar revira', clan: 'Član' };
const U_LOVU = { strijelac: 'Strijelac', pogonic: 'Pogonič', vodja: 'Vođa lova' };
const STATUS_LOVA = { planiran: 'Planiran', u_toku: 'U toku', zavrsen: 'Završen' };
const $ = (id) => document.getElementById(id);

async function qSk(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

export function initSekcijaEkran(L, map) {
  const screen = $('sekcija-ekran');
  let ctx = { reviri: [], sekcije: [], clanovi: [], grupovodje: [], lovocuvari: [] };
  let lovovi = [];
  let poruke = [];
  let vrste = [];
  let extra = { pozicije: [], odstrel: [], sos: [], lovId: null }; // uživo podaci tekućeg lova
  let selectedId = loadJSON(SEL_KEY, null);
  let lastHuntRefresh = 0;
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
  const reloadPoruke = async () => {
    const t = ++porukeSeq;
    const rows = await idbAll('poruke');
    // IndexedDB vraća redom po id-u (UUID), a razgovor mora ići hronološki.
    if (t === porukeSeq) poruke = rows.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
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
    const s = selected();
    $('nav-sekcija-ime').textContent = s ? s.naziv : 'Sekcija';
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

  const notifyNew = (fresh) => {
    const since = loadJSON(NOTIF_KEY, 0);
    const news = fresh.filter((m) => m.autor_id !== me()?.id && Date.parse(m.created_at) > since);
    if (!news.length) return;
    saveSoft(NOTIF_KEY, Math.max(...news.map((m) => Date.parse(m.created_at))));
    if (isOpen() && document.visibilityState === 'visible') return;
    const m = news[news.length - 1];
    const s = ctx.sekcije.find((x) => x.id === m.sekcija_id);
    globalThis.AndroidNotif?.prikazi?.(`${m.kanal === KANAL_RUKOVODSTVO ? 'Rukovodstvo' : (s?.naziv || 'Sekcija')} — ${memberName(m.autor_id)}`, m.tekst);
  };

  const pullMessages = async () => {
    const fresh = [];
    for (const s of mine()) {
      const remote = await qSk(getClient().from('poruke').select('*').eq('sekcija_id', s.id).order('created_at', { ascending: true }).limit(300));
      const known = new Set(poruke.map((m) => m.id));
      const merged = mergeMessages(poruke.filter((m) => m.sekcija_id === s.id), remote);
      for (const m of merged) {
        await idbPut('poruke', m);
        if (!known.has(m.id)) fresh.push(m);
      }
    }
    if (leader()) {
      const remote = await qSk(getClient().from('poruke').select('*').eq('kanal', KANAL_RUKOVODSTVO).order('created_at', { ascending: true }).limit(300));
      const known = new Set(poruke.map((m) => m.id));
      for (const m of mergeMessages(rukPoruke(), remote)) {
        await idbPut('poruke', m);
        if (!known.has(m.id)) fresh.push(m);
      }
    }
    await reloadPoruke();
    notifyNew(fresh);
  };

  const flushOutbox = async () => {
    for (const m of poruke.filter((x) => x.sinhronizovano === false && x.autor_id === me()?.id)) {
      try {
        await qSk(getClient().from('poruke').upsert({
          id: m.id, kanal: m.kanal || 'sekcija', sekcija_id: m.sekcija_id ?? null, lov_id: m.lov_id ?? null, autor_id: m.autor_id, tekst: m.tekst, created_at: m.created_at,
        }, { onConflict: 'id', ignoreDuplicates: true }));
        await idbPut('poruke', { ...m, sinhronizovano: true });
      } catch (err) {
        console.warn('poruka čeka slanje', err.message);
        break;
      }
    }
    await reloadPoruke();
  };

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

  const refresh = async ({ withHunts = false } = {}) => {
    if (!online()) return;
    try {
      await downloadSekcije();
      await refreshMembers().catch(() => {});
      if (withHunts || Date.now() - lastHuntRefresh > HUNT_REFRESH_MS) {
        await downloadHunts();
        lastHuntRefresh = Date.now();
      }
      await loadLocal();
      await flushOutbox();
      await pullMessages();
      const s = selected();
      if (s) await pullLive(currentHunt(lovovi, s.id)?.zapis);
      $('sk-status').textContent = '';
    } catch (err) {
      $('sk-status').textContent = `Nema veze sa serverom — prikazani su sačuvani podaci (${err.message})`;
    }
    updateNav();
    if (isOpen()) render();
  };

  // ---------- prikaz ----------
  // Grupovođa/admin: pokreće i završava lov, dodaje i uklanja prisutne. Član: javlja da je prisutan.
  const huntControls = (s, cur, st) => {
    const manager = st === 'grupovodja' || st === 'admin';
    if (!cur) {
      return manager ? '<button type="button" class="dugme glavno" data-akcija="lov-novi">Novi lov za danas</button>'
        : '<p class="sitno">Grupovođa još nije napravio lov. Kad ga napravi, ovdje javljaš da si prisutan.</p>';
    }
    const { lov, ucesnici } = cur.zapis;
    const pres = huntPresence(cur.zapis, me()?.id, st);
    let html = '';
    if (pres.canJoin) html += '<button type="button" class="dugme glavno" data-akcija="lov-prijavi">Prisutan sam — pridruži se lovu</button>';
    if (pres.canLeave) html += '<button type="button" class="dugme" data-akcija="lov-odjavi">Nisam prisutan</button>';
    if (!manager) return html;
    if (lov.status === 'planiran') html += `<button type="button" class="dugme glavno" data-akcija="lov-pokreni" data-lov="${escapeHtml(lov.id)}">Pokreni lov</button>`;
    if (lov.status === 'u_toku') html += `<button type="button" class="dugme" data-akcija="lov-zavrsi" data-lov="${escapeHtml(lov.id)}">Završi lov</button>`;
    const addable = addableMembers(s, ctx.clanovi, ucesnici);
    html += `<h4>Prisutni (${ucesnici.length})</h4><ul class="spisak" data-prisutni>${ucesnici.map((u) => `<li class="clan-red" data-uid="${escapeHtml(u.korisnik_id)}">
        <span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(memberName(u.korisnik_id)))}</span>
        <span class="clan-tekst"><b>${escapeHtml(memberName(u.korisnik_id))}</b>${u.samoprijava ? ' <span class="sitno">· prijavio se sam</span>' : ''}</span>
        ${u.korisnik_id === me()?.id ? '' : '<button type="button" class="dugme" data-akcija="lov-ukloni">Ukloni</button>'}</li>`).join('')
      || '<li class="sitno">Još niko nije prisutan.</li>'}</ul>
      <h4>Dodaj iz sekcije</h4>
      <div class="clanovi" data-spisak>${addable.map((id) => `<label class="red-check"><input type="checkbox" value="${escapeHtml(id)}"> ${escapeHtml(memberName(id))}</label>`).join('')
    || '<p class="sitno">Svi članovi sekcije su već u lovu.</p>'}</div>
      ${addable.length ? '<button type="button" class="dugme" data-akcija="lov-dodaj">Dodaj izabrane</button>' : ''}`;
    return html;
  };

  const huntCard = (s, cur, users, st) => {
    if (!cur) return `<p>Nema lova u toku ni planiranog lova za ovu sekciju.</p>${huntControls(s, cur, st)}`;
    const { lov, ucesnici, stanovi } = cur.zapis;
    const live = lov.status === 'u_toku';
    const acts = ucesnici.map((u) => memberActivity(u.korisnik_id, lov, ucesnici, extra.lovId === lov.id ? extra.pozicije : []));
    const aktivnih = acts.filter((a) => a.stanje === 'aktivan').length;
    const mineAssign = ucesnici.find((u) => u.korisnik_id === me()?.id);
    const stan = stanovi.find((x) => x.korisnik_id === me()?.id);
    const odstrel = live && extra.lovId === lov.id ? summarizeHarvest(extra.odstrel.map((o) => ({ vrsta: o.vrsta, tezina: o.tezina }))) : [];
    const traceOn = trailEnabled(lov.id);
    return `<div class="sk-lov-glava"><b>${escapeHtml(lov.naziv)}</b><span class="lov-status" data-status="${lov.status}">${live ? 'U TOKU' : lov.status === 'zavrsen' ? 'Završen' : 'Planiran'}</span></div>
      <p class="sitno">${escapeHtml(String(lov.datum))}</p>
      <div class="sk-statovi">
        <div data-stat="prisutnih"><b>${ucesnici.length}</b><span>prisutnih</span></div>
        ${live ? `<div data-stat="aktivnih"><b>${aktivnih}</b><span>aktivnih sada</span></div>` : ''}
        <div data-stat="stanova"><b>${stanovi.length}</b><span>stanova</span></div>
      </div>
      ${mineAssign ? `<p>Moja uloga: ${escapeHtml(U_LOVU[mineAssign.uloga] || mineAssign.uloga)}${stan ? `, stan ${stan.broj}` : ''}</p>` : ''}
      ${live ? `<p class="sitno">Odstrel u lovu: ${odstrel.length ? odstrel.map((o) => `${escapeHtml(lookupNaziv(vrste, o.vrsta))}: ${o.komada} kom., ${escapeHtml(formatDecimalBs(Math.round(o.tezina * 10) / 10))} kg`).join('; ') : 'još nema'} · SOS poruka: ${extra.sos.length}</p>` : ''}
      <label class="red-check"><input type="checkbox" data-trag="${escapeHtml(lov.id)}" data-live="${live}"${traceOn ? ' checked' : ''}> Prikaži trag kretanja lovaca sekcije</label>
      <button type="button" class="dugme glavno" data-akcija="raspored" data-lov="${escapeHtml(lov.id)}">Raspored na karti</button>
      ${huntControls(s, cur, st)}`;
  };

  const render = () => {
    const list = mine();
    const s = selected();
    const sel = $('sk-izbor');
    sel.hidden = list.length < 2;
    sel.innerHTML = list.map((x) => `<option value="${escapeHtml(x.id)}" ${s && x.id === s.id ? 'selected' : ''}>${escapeHtml(x.naziv)}</option>`).join('');
    $('sk-prazno').hidden = Boolean(s);
    $('sk-sadrzaj').hidden = !s;
    $('sk-naslov').textContent = s ? s.naziv : 'Sekcija';
    if (!s) { $('sk-podnaslov').textContent = ''; return; }
    const users = loadJSON('lovac.clanovi', []);
    const revir = ctx.reviri.find((r) => r.id === s.revir_id);
    const st = myStatus(s, ctx.clanovi, me()?.id, Boolean(me()?.is_admin), ctx.lovocuvari);
    const lovocuvari = ctx.lovocuvari.filter((l) => l.revir_id === s.revir_id).map((l) => memberName(l.korisnik_id));
    const cur = currentHunt(lovovi, s.id);
    $('sk-podnaslov').textContent = `Revir ${revir?.naziv || ''} · ${pristupText(st)}`;
    const mode = creationMode(st);
    $('btn-sk-novi').hidden = !mode;
    $('btn-sk-novi').textContent = mode === 'direct' ? 'Dodaj lovca (novi nalog)' : 'Predloži lovca (odobrava grupovođa)';
    const checked = new Set([...$('sk-lov').querySelectorAll('[data-spisak] input:checked')].map((i) => i.value));
    $('sk-lov').innerHTML = huntCard(s, cur, users, st);
    $('sk-lov').querySelectorAll('[data-spisak] input').forEach((i) => { i.checked = checked.has(i.value); });

    // članovi i aktivnost
    const rows = sectionMembers(s, ctx.clanovi, ctx.lovocuvari, users);
    const lov = cur?.zapis.lov || null;
    const uc = cur?.zapis.ucesnici || [];
    const poz = extra.lovId && lov && extra.lovId === lov.id ? extra.pozicije : [];
    $('sk-broj').textContent = `(${rows.length})`;
    $('sk-uloga').textContent = ULOGE_SEKCIJE[st] || '';
    $('sk-uloga').dataset.uloga = st;
    $('sk-stat-clanova').textContent = String(rows.length);
    $('sk-stat-aktivnih').textContent = String(uc.filter((u) => memberActivity(u.korisnik_id, lov, uc, poz).stanje === 'aktivan').length);
    $('sk-stat-lovova').textContent = String(lovovi.filter((z) => z.lov.sekcija_id === s.id).length);
    $('sk-clanovi').innerHTML = rows.map((r) => {
      const a = memberActivity(r.id, lov, uc, poz);
      const ja = r.id === me()?.id;
      return `<li class="clan-red" data-uid="${escapeHtml(r.id)}" data-stanje="${a.stanje}">
        <span class="sk-avatar${avatarOf(r.id) ? ' ima-sliku' : ''}" aria-hidden="true"${avatarOf(r.id) ? ` style="background-image:url('${avatarOf(r.id)}')"` : ''}>${avatarOf(r.id) ? '' : escapeHtml(initialsOf(r.ime))}</span>
        <div class="clan-tekst"><b>${escapeHtml(r.ime)}${ja ? ' (ti)' : ''}</b>
          <span class="sitno">${escapeHtml(ULOGE[r.uloga])}${a.uloga ? ` · u lovu: ${escapeHtml(U_LOVU[a.uloga] || a.uloga)}` : ''}</span>
          <span class="sitno aktivnost">${escapeHtml(activityText(a))}</span></div>
        <div class="clan-akcije">
          ${a.zadnje && Number.isFinite(a.lat) ? '<button type="button" class="dugme" data-akcija="na-karti">Na karti</button>' : ''}
          ${ja ? '' : '<button type="button" class="dugme" data-akcija="poruka">Poruka</button>'}
        </div>
      </li>`;
    }).join('') || '<li class="sitno">Nema članova.</li>';

    // poruke
    const msgs = poruke.filter((m) => m.sekcija_id === s.id);
    $('sk-poruke').innerHTML = msgs.map((m) => `<div class="poruka-red${m.autor_id === me()?.id ? ' moja' : ''}" data-id="${escapeHtml(m.id)}">
      <small>${m.autor_id === me()?.id ? 'Ti' : escapeHtml(memberName(m.autor_id))} · ${escapeHtml(formatMessageTime(m.created_at))}${m.sinhronizovano === false ? ' · čeka slanje' : ''}${m.lov_id ? ' · u lovu' : ''}</small>
      ${escapeHtml(m.tekst)}</div>`).join('') || '<p class="sitno">Još nema poruka.</p>';
    const box = $('sk-poruke');
    box.scrollTop = box.scrollHeight;
    $('sk-brze').innerHTML = QUICK_MESSAGES.map((t) => `<button type="button" data-brza="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');

    // rukovodstvo (grupovođe, lovočuvari, admin)
    const isLeader = leader();
    $('sk-k-ruk').hidden = !isLeader;
    $('sk-nav-ruk').hidden = !isLeader;
    if (isLeader) {
      const ruk = rukPoruke();
      $('sk-ruk-poruke').innerHTML = ruk.map((m) => `<div class="poruka-red${m.autor_id === me()?.id ? ' moja' : ''}" data-id="${escapeHtml(m.id)}">
        <small>${m.autor_id === me()?.id ? 'Ti' : escapeHtml(memberName(m.autor_id))} · ${escapeHtml(formatMessageTime(m.created_at))}${m.sinhronizovano === false ? ' · čeka slanje' : ''}</small>
        ${escapeHtml(m.tekst)}</div>`).join('') || '<p class="sitno">Još nema poruka.</p>';
      $('sk-ruk-poruke').scrollTop = $('sk-ruk-poruke').scrollHeight;
    }

    // svi podaci
    const huntsOfSection = lovovi.filter((z) => z.lov.sekcija_id === s.id).sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)));
    const pending = pendingRequests(s.id, ctx.clanovi).length;
    $('sk-podaci').innerHTML = `<dl class="tabela-info">
        <dt>Revir</dt><dd>${escapeHtml(revir?.naziv || '—')}</dd>
        <dt>Grupovođa</dt><dd>${s.grupovodja_id ? escapeHtml(memberName(s.grupovodja_id)) : '—'}</dd>
        <dt>Lovočuvar revira</dt><dd>${lovocuvari.length ? escapeHtml(lovocuvari.join(', ')) : '—'}</dd>
        <dt>Članova</dt><dd>${rows.length}</dd>
        ${['grupovodja', 'admin'].includes(st) ? `<dt>Zahtjeva na čekanju</dt><dd>${pending}</dd>` : ''}
        <dt>Lovova sekcije</dt><dd>${huntsOfSection.length}</dd>
      </dl>
      <h4>Lovovi sekcije</h4>
      <ul class="spisak">${huntsOfSection.map((z) => `<li class="trag-red" data-lov="${escapeHtml(z.lov.id)}">
        <b>${escapeHtml(z.lov.naziv)}</b> <span class="sitno">${escapeHtml(String(z.lov.datum))} · ${STATUS_LOVA[z.lov.status] || z.lov.status} · učesnika ${z.ucesnici.length} · stanova ${z.stanovi.length}</span>
        <button type="button" class="dugme" data-akcija="raspored" data-lov="${escapeHtml(z.lov.id)}">Raspored na karti</button></li>`).join('') || '<li class="sitno">Još nema lovova ove sekcije (preuzimaju se uz internet).</li>'}</ul>`;
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
  $('sk-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cilj]');
    if (b) $(b.dataset.cilj).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
      toast(/row-level security|permission/i.test(err.message) ? 'Server nije dozvolio (grupovođa te je uklonio iz lova ili lov nije otvoren)' : `Nije uspjelo: ${err.message}`);
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
      case 'lov-novi': {
        const h = newTodayHunt(s, uuid());
        await runHunt(async () => {
          await qSk(sb.from('lovovi').insert(h));
          await qSk(sb.from('lov_ucesnici').insert({ lov_id: h.id, korisnik_id: me().id, uloga: 'vodja' }));
        }, 'Lov za danas je napravljen — članovi se mogu prijaviti');
        break;
      }
      case 'lov-pokreni':
      case 'lov-zavrsi':
        await runHunt(() => qSk(sb.from('lovovi').update({ status: b.dataset.akcija === 'lov-pokreni' ? 'u_toku' : 'zavrsen' }).eq('id', lovId)),
          b.dataset.akcija === 'lov-pokreni' ? 'Lov je počeo' : 'Lov je završen');
        break;
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
    if (b.dataset.akcija === 'raspored') {
      close();
      document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: b.dataset.lov } }));
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
