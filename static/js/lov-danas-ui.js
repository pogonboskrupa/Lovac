// Ploča "+": "Dodaj lov" (lovovođa sekcije/admin, kad nema lova u toku) i "Lov traje" (dok traje lov u kojem sam).
// Ekran "Lov traje": pregled, lovci (pozicija uživo, poruke i slike svakog), poruke lova i slike lova.
// Sve se crta iz keša na telefonu; dok je ekran otvoren i ima veze, osvježava se u pozadini.
import { todayHuntSummary } from './lov-danas.js';
import { organizableSections, huntButtons, participantRows, huntMessages, huntPhotos, SVJEZINA_TEKST, todayPlannedHunt, canManageHunt } from './lov-traje.js';
import { conversationItems, formatMessageTime, QUICK_MESSAGES, unreadCount } from './poruke.js';
import { addableMembers } from './sekcija-podaci.js';
import { todayIso } from './objekti.js';
import { driveState } from './tok.js';
import { summarizeHarvest, formatDecimalBs } from './odstrel.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { currentFix } from './gps.js';
import { rangeLabel } from './istrazivac.js';
import { loadJSON, saveSoft } from './storage.js';
import { cachedProfile } from './auth.js';
import { cachedSekcije } from './sekcije-ui.js';
import { idbAll, idbGet } from './db.js';
import { connectionQuality } from './net.js';
import { memberName } from './dijeljenje-ui.js';
import { initialsOf } from './lokacija.js';
import { escapeHtml, registerBackHandler, toast } from './ui.js';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 20000;

export function initLovDanas() {
  const btn = $('btn-lov-danas');
  const btnDodaj = $('btn-lov-dodaj');
  const screen = $('lov-danas');
  if (!btn || !screen) return;
  let aktivan = null; // lov u toku (iz uzivo-ui)
  let plan = null; // današnji planirani lov (iz keša)
  let rec = null; // ono što ekran prikazuje: aktivan, inače plan
  let pozicije = [];
  let dodajOtvoreno = false;
  let dodajUloge = {};
  let dodajIzbor = new Set(); // izbor se čuva van DOM-a: lista se ponovo crta (pozicije kolega, uloga)
  let armedZavrsi = false;
  const READ = (id) => `lovac.lovtraje.procitano.${id}`;
  let tab = 'pregled';
  let otvoren = null; // učesnik čiji su detalji rastvoreni
  let timer = null;
  let renderSeq = 0;
  const me = () => cachedProfile();

  const updateButtons = async () => {
    const ctx = await cachedSekcije().catch(() => ({}));
    plan = aktivan ? null : todayPlannedHunt(await idbAll('lovovi').catch(() => []), me()?.id, todayIso());
    rec = aktivan || plan;
    const org = organizableSections(ctx, me()).length > 0;
    const st = huntButtons({ aktivan, planiran: plan, organizator: org });
    btn.hidden = !(st.traje || st.planiran);
    if (btnDodaj) btnDodaj.hidden = !st.dodaj;
    if (rec) {
      $('lov-danas-naslov').textContent = st.traje ? 'Lov traje' : 'Lov danas';
      $('lov-danas-opis').textContent = st.traje ? rec.lov.naziv : `${rec.lov.naziv} · planiran`;
      $('ld-naslov').textContent = st.traje ? 'Lov traje' : 'Lov danas';
      updateBadge();
    }
    if (!rec && !screen.hidden) close();
  };

  const updateBadge = async () => {
    if (!rec) return;
    const poruke = huntMessages(await idbAll('poruke').catch(() => []), rec.id);
    const n = unreadCount(poruke, loadJSON(READ(rec.id), null), me()?.id);
    const z = $('lov-danas-znacka');
    z.hidden = !n;
    z.textContent = n > 99 ? '99+' : String(n);
    z.setAttribute('aria-label', `${n} nepročitanih poruka`);
  };

  const data = async () => {
    const lovId = rec.id;
    const poruke = huntMessages(await idbAll('poruke').catch(() => []), lovId);
    const detalj = await idbGet('arhiva', `detalj:${lovId}`).catch(() => null);
    const cekaju = (await idbAll('arhiva_red').catch(() => [])).filter((x) => x.lov_id === lovId);
    const ctx = await cachedSekcije().catch(() => ({}));
    const vrste = await getSpisakAll('vrste').catch(() => []);
    return { poruke, slike: huntPhotos(detalj?.slike || [], cekaju), odstrel: detalj?.odstrel || [], ctx, vrste };
  };

  const TOK_TEKST = { pogon: ['POGON', 'Pogon traje'], prekid: ['PREKID', 'Lov je prekinut — čekaj vođu lova'], kraj: ['ČEKANJE', 'Pogon nije u toku'] };

  const thumbs = (list) => list.map((s) => `<button type="button" class="ld-slika" data-slika="${escapeHtml(s.id)}" aria-label="Otvori sliku">
      <img src="${escapeHtml(s.mala || '')}" alt="${escapeHtml(s.opis || 'Slika lova')}">${s.ceka ? '<span class="ld-ceka">čeka slanje</span>' : ''}</button>`).join('');

  const chat = (list) => conversationItems(list).map((it) => {
    if (it.dan) return `<div class="poruka-dan"><span>${escapeHtml(it.dan)}</span></div>`;
    const m = it.poruka;
    const mine = m.autor_id === me()?.id;
    const name = mine ? 'Ti' : memberName(m.autor_id);
    const wait = m.sinhronizovano === false ? ' · čeka slanje' : '';
    const head = it.prva ? `<small>${escapeHtml(name)} · ${escapeHtml(formatMessageTime(m.created_at))}${wait}</small>`
      : `<small class="poruka-vrijeme">${escapeHtml(formatMessageTime(m.created_at))}${wait}</small>`;
    const av = !mine && it.prva ? `<span class="poruka-av" aria-hidden="true">${escapeHtml(initialsOf(name))}</span>` : '';
    return `<div class="poruka-red${mine ? ' moja' : ''}${it.prva ? '' : ' nastavak'}" data-id="${escapeHtml(m.id)}">${av}${head}${escapeHtml(m.tekst)}</div>`;
  }).join('');

  const render = async () => {
    const t = ++renderSeq;
    const s = rec && todayHuntSummary(rec, me()?.id, memberName);
    if (!s) { $('ld-sadrzaj').innerHTML = '<p>Nema lova u toku.</p>'; return; }
    const { poruke, slike, odstrel, ctx, vrste } = await data();
    if (t !== renderSeq) return; // sporije crtanje ne prepisuje novije
    const traje = rec.lov.status === 'u_toku';
    const upravljac = canManageHunt(rec, ctx, me());
    const rows = participantRows(s.ucesnici, { pozicije, poruke, slike });
    const ja = currentFix();
    const tok = traje ? driveState(loadJSON(`lovac.tok.keš.${rec.id}`, [])) : null;
    const ulov = summarizeHarvest(odstrel.map((o) => ({ vrsta: o.vrsta, tezina: o.tezina })));
    const procitano = loadJSON(READ(rec.id), null);
    const novih = unreadCount(poruke, procitano, me()?.id);
    $('ld-broj-ucesnika').textContent = `(${rows.length})`;
    $('ld-broj-poruka').textContent = novih ? `(${novih} novih)` : poruke.length ? `(${poruke.length})` : '';
    $('ld-broj-slika').textContent = slike.length ? `(${slike.length})` : '';
    const uzivo = rows.filter((r) => r.svjezina === 'uzivo').length;

    $('ld-sadrzaj').innerHTML = `
      <div class="p-kartica ld-hero">
        <span class="lk-chip" data-chip="${traje ? 'u_toku' : 'planiran'}">${traje ? 'U TOKU' : 'PLANIRAN ZA DANAS'}</span>
        ${tok ? `<span class="lk-chip ld-tok" data-tok="${tok.stanje}" title="${escapeHtml(TOK_TEKST[tok.stanje]?.[1] || '')}">${escapeHtml(TOK_TEKST[tok.stanje]?.[0] || '')}</span>` : ''}
        <h3>${escapeHtml(s.naziv)}</h3>
        ${s.mjesto ? `<p class="sitno">${escapeHtml(s.mjesto)}</p>` : ''}
        <div class="ld-brojke">
          <span><b>${escapeHtml(traje ? s.pocetak || '—' : 'nije počeo')}</b> početak</span>
          <span><b>${escapeHtml(traje ? s.trajanje || '—' : '—')}</b> traje</span>
          <span><b>${s.brojevi.ucesnika}</b> lovaca${s.brojevi.pogonica ? ` · ${s.brojevi.pogonica} pog.` : ''}</span>
          <span><b>${traje ? uzivo : odstrel.length}</b> ${traje ? 'uživo' : 'ulova'}</span>
        </div>
      </div>
      ${upravljac ? `<div class="p-kartica ld-upravljanje">
        <h3>Vođenje lova</h3>
        <div class="ld-akcije">
          ${traje ? `<button type="button" class="dugme" data-akcija="dodaj-lovce">Dodaj lovce</button>
            <button type="button" class="dugme ld-zavrsi" data-akcija="zavrsi">${armedZavrsi ? 'Dodirni ponovo — završi' : 'Završi lov'}</button>`
    : '<button type="button" class="dugme glavno" data-akcija="pokreni">Pokreni lov</button><button type="button" class="dugme" data-akcija="dodaj-lovce">Dodaj lovce</button>'}
        </div>
      </div>` : ''}
      <div class="p-kartica">
        <h3>Ja u lovu</h3>
        <p>${s.moj ? `${escapeHtml(s.moj.ulogaTekst)}${s.moj.stan != null ? ` · stan ${s.moj.stan}` : ' · stan nije dodijeljen'}` : 'Nisi upisan kao učesnik.'}</p>
        ${s.vodje.length ? `<p class="sitno">Vođa lova: ${escapeHtml(s.vodje.join(', '))}</p>` : ''}
        ${s.napomena ? `<p class="ld-napomena">${escapeHtml(s.napomena)}</p>` : ''}
      </div>
      <div class="ld-akcije">
        <button type="button" class="dugme glavno" data-akcija="raspored">Raspored na karti</button>
        <button type="button" class="dugme" data-akcija="tok">Tok lova</button>
        <button type="button" class="dugme" data-akcija="lokacija">Lokacija</button>
      </div>
      <div class="p-kartica ld-ulov">
        <h3>Ulov u lovu (${odstrel.length})</h3>
        ${ulov.length ? `<ul class="spisak">${ulov.map((u) => `<li><b>${escapeHtml(lookupNaziv(vrste, u.vrsta))}</b>: ${u.komada} kom.${u.tezina ? `, ${escapeHtml(formatDecimalBs(Math.round(u.tezina * 10) / 10))} kg` : ''}</li>`).join('')}</ul>` : '<p class="sitno">Još nema upisanog ulova.</p>'}
        ${traje ? '<button type="button" class="dugme" data-akcija="odstrel">Upiši odstrel</button>' : ''}
      </div>
      ${poruke.length ? `<div class="p-kartica"><h3>Zadnja poruka</h3><p>${escapeHtml(memberName(poruke[poruke.length - 1].autor_id))}: ${escapeHtml(poruke[poruke.length - 1].tekst)}</p></div>` : ''}
      ${slike.length ? `<div class="p-kartica"><h3>Slike (${slike.length})</h3><div class="ld-slike ld-slike-mali">${thumbs(slike.slice(0, 4))}</div></div>` : ''}`;

    $('ld-ucesnici').innerHTML = rows.map((r) => {
      const open = otvoren === r.id;
      const njegovePoruke = poruke.filter((m) => m.autor_id === r.id).slice(-5);
      const njegoveSlike = slike.filter((x) => x.autor_id === r.id);
      return `<li class="clan-red ld-lovac${open ? ' otvoren' : ''}" data-uid="${escapeHtml(r.id)}" data-svjezina="${r.svjezina}">
        <button type="button" class="ld-lovac-glava" data-akcija="lovac" aria-expanded="${open}">
          <span class="clan-av" data-svjezina="${r.svjezina}">${escapeHtml(initialsOf(r.ime))}</span>
          <span class="clan-tekst"><b>${escapeHtml(r.ime)}${r.ja ? ' (ti)' : ''}</b>
            <span class="sitno">${escapeHtml(r.ulogaTekst)}${r.stan != null ? ` · stan ${r.stan}` : ''} · ${escapeHtml(r.ja ? 'ti' : SVJEZINA_TEKST[r.svjezina])}</span>
            ${!r.ja && r.pozicija && ja ? `<span class="sitno ld-daljina">${escapeHtml(rangeLabel(ja, r.pozicija))} od tebe</span>` : ''}</span>
          <span class="ld-brojaci"><span title="Poruke">${r.poruka} por.</span><span title="Slike">${r.slika} sl.</span></span>
        </button>
        ${open ? `<div class="ld-lovac-detalj">
          ${njegovePoruke.length ? njegovePoruke.map((m) => `<p class="ld-lovac-poruka"><small>${escapeHtml(formatMessageTime(m.created_at))}</small> ${escapeHtml(m.tekst)}</p>`).join('') : '<p class="sitno">Nema poruka u ovom lovu.</p>'}
          ${njegoveSlike.length ? `<div class="ld-slike ld-slike-mali">${thumbs(njegoveSlike)}</div>` : '<p class="sitno">Nema slika.</p>'}
          ${!r.ja && r.svjezina !== 'nema' ? '<button type="button" class="dugme" data-akcija="na-karti">Na karti</button>' : ''}
        </div>` : ''}
      </li>`;
    }).join('') || '<li class="sitno">Nema upisanih lovaca.</li>';

    const dodaj = $('ld-dodaj-lovce');
    const sek = (ctx.sekcije || []).find((x) => x.id === rec.lov.sekcija_id);
    const moguci = upravljac && sek ? addableMembers(sek, ctx.clanovi || [], rec.ucesnici || []).sort((a, b) => memberName(a).localeCompare(memberName(b), 'bs')) : [];
    dodaj.hidden = !(upravljac && dodajOtvoreno);
    if (!dodaj.hidden) {
      dodaj.innerHTML = `<div class="p-kartica"><h3>Dodaj lovce u lov</h3>
        ${moguci.length ? moguci.map((id) => `<div class="slf-red" data-uid="${escapeHtml(id)}"><label class="red-check"><input type="checkbox" value="${escapeHtml(id)}" ${dodajIzbor.has(id) ? 'checked' : ''}> ${escapeHtml(memberName(id))}</label>
          <button type="button" class="dugme slf-uloga" data-akcija="uloga" data-uloga="${dodajUloge[id] === 'pogonic' ? 'pogonic' : 'strijelac'}">${dodajUloge[id] === 'pogonic' ? 'Pogonič' : 'Strijelac'}</button></div>`).join('')
    : '<p class="sitno">Svi odobreni članovi sekcije su već u lovu.</p>'}
        <div class="red-dugmadi">${moguci.length ? '<button type="button" class="dugme glavno" data-akcija="dodaj-potvrdi">Dodaj izabrane</button>' : ''}
          <button type="button" class="dugme" data-akcija="dodaj-zatvori">Zatvori</button></div>
        <p class="sitno">Dodavanje traži internet.</p></div>`;
    }
    $('ld-brze').innerHTML = QUICK_MESSAGES.map((q) => `<button type="button" data-brza="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
    if (tab === 'poruke' && poruke.length) saveSoft(READ(rec.id), poruke[poruke.length - 1].created_at);
    updateBadge();

    const box = $('ld-poruke');
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = chat(poruke) || '<p class="sitno poruke-prazno">Još nema poruka u ovom lovu. Poruka ide svim članovima sekcije.</p>';
    if (atBottom) box.scrollTop = box.scrollHeight;
    $('forma-ld-poruka').hidden = !rec.lov.sekcija_id;
    $('ld-poruke-status').textContent = rec.lov.sekcija_id ? '' : 'Ovaj lov nema sekciju, pa poruke idu kroz tab sekcije.';
    $('ld-slike').innerHTML = thumbs(slike) || '<p class="sitno">Još nema slika iz ovog lova.</p>';
  };

  const setTab = (name) => {
    tab = name;
    for (const b of document.querySelectorAll('#ld-tabovi [data-ldtab]')) { b.setAttribute('aria-selected', String(b.dataset.ldtab === name)); b.setAttribute('aria-pressed', String(b.dataset.ldtab === name)); }
    for (const p of screen.querySelectorAll('[data-ldpanel]')) p.hidden = p.dataset.ldpanel !== name;
    if (name === 'poruke') { const box = $('ld-poruke'); box.scrollTop = box.scrollHeight; render(); }
  };

  const online = () => connectionQuality() !== 'nema';
  const refreshRemote = () => {
    if (!rec || !online()) return;
    document.dispatchEvent(new CustomEvent('lov:poruke-osvjezi'));
    document.dispatchEvent(new CustomEvent('lov:slike-osvjezi', { detail: { lovId: rec.id } }));
  };

  const open = async () => {
    $('meni-dodaj').hidden = true;
    setTab(tab);
    screen.hidden = false;
    await render();
    refreshRemote();
    clearInterval(timer);
    timer = setInterval(() => { render(); refreshRemote(); }, REFRESH_MS);
  };
  function close() {
    screen.hidden = true;
    clearInterval(timer);
    timer = null;
  }

  btn.addEventListener('click', open);
  btnDodaj?.addEventListener('click', () => {
    $('meni-dodaj').hidden = true;
    document.dispatchEvent(new CustomEvent('lov:dodaj'));
  });
  $('btn-ld-zatvori').addEventListener('click', close);
  $('ld-tabovi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ldtab]');
    if (b) setTab(b.dataset.ldtab);
  });
  screen.addEventListener('click', (e) => {
    const slika = e.target.closest('[data-slika]');
    if (slika && rec) { document.dispatchEvent(new CustomEvent('lov:slika-otvori', { detail: { lovId: rec.id, id: slika.dataset.slika } })); return; }
    const brza = e.target.closest('[data-brza]');
    if (brza) { const input = $('forma-ld-poruka').elements.tekst; input.value = brza.dataset.brza; input.focus(); return; }
    const a = e.target.closest('[data-akcija]')?.dataset.akcija;
    if (!a || !rec) return;
    const uid = e.target.closest('[data-uid]')?.dataset.uid;
    if (a === 'lovac') { otvoren = otvoren === uid ? null : uid; render(); return; }
    if (a === 'dodaj-lovce') { dodajOtvoreno = true; dodajUloge = {}; dodajIzbor = new Set(); setTab('ucesnici'); render(); return; }
    if (a === 'dodaj-zatvori') { dodajOtvoreno = false; render(); return; }
    if (a === 'uloga') { dodajUloge[uid] = dodajUloge[uid] === 'pogonic' ? 'strijelac' : 'pogonic'; render(); return; }
    if (a === 'dodaj-potvrdi') {
      const ids = [...dodajIzbor];
      if (!ids.length) { toast('Izaberi bar jednog lovca'); return; }
      dodajOtvoreno = false;
      document.dispatchEvent(new CustomEvent('lov:upravljanje', { detail: { akcija: 'dodaj', lovId: rec.id, ids, uloge: dodajUloge } }));
      return;
    }
    if (a === 'pokreni') { document.dispatchEvent(new CustomEvent('lov:upravljanje', { detail: { akcija: 'pokreni', lovId: rec.id } })); return; }
    if (a === 'zavrsi') {
      // završetak traži drugi dodir (WebView nema confirm())
      if (!armedZavrsi) { armedZavrsi = true; render(); setTimeout(() => { armedZavrsi = false; if (!screen.hidden) render(); }, 4000); return; }
      armedZavrsi = false;
      document.dispatchEvent(new CustomEvent('lov:upravljanje', { detail: { akcija: 'zavrsi', lovId: rec.id } }));
      close();
      return;
    }
    close();
    if (a === 'raspored') document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: rec.id } }));
    if (a === 'tok') $('btn-tok')?.click();
    if (a === 'lokacija') $('btn-lokacija')?.click();
    if (a === 'odstrel') { $('btn-dodaj')?.click(); $('btn-dodaj-odstrel')?.click(); }
    if (a === 'na-karti') document.dispatchEvent(new CustomEvent('lov:prikazi-lovca', { detail: { korisnikId: uid } }));
  });
  $('ld-dodaj-lovce').addEventListener('change', (e) => {
    const c = e.target.closest('input[type=checkbox]');
    if (!c) return;
    if (c.checked) dodajIzbor.add(c.value); else dodajIzbor.delete(c.value);
  });
  $('forma-ld-poruka').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = e.target.elements.tekst;
    if (!rec?.lov.sekcija_id || !input.value.trim()) return;
    document.dispatchEvent(new CustomEvent('lov:poruka', { detail: { sekcijaId: rec.lov.sekcija_id, lovId: rec.id, tekst: input.value } }));
    input.value = '';
    setTimeout(() => { const box = $('ld-poruke'); box.scrollTop = box.scrollHeight; }, 50);
  });
  // polje za izbor slike je van dijela koji se ponovo crta (inače bi izbor propao)
  $('ld-slika-ulaz').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !rec) return;
    document.dispatchEvent(new CustomEvent('lov:slika-dodaj', { detail: { lovId: rec.id, file, opis: $('ld-slika-opis').value } }));
    $('ld-slika-opis').value = '';
    toast('Slika se dodaje…');
  });

  const rerender = () => { if (!screen.hidden) render(); };
  document.addEventListener('lov:aktivan', async (e) => { aktivan = e.detail.lov; await updateButtons(); rerender(); });
  // dodani lovci, pokrenut ili završen lov: svjež zapis iz keša (uzivo-ui za isti lov ne šalje ponovo lov:aktivan)
  document.addEventListener('lovovi:promjena', async () => {
    if (aktivan) aktivan = (await idbGet('lovovi', aktivan.id).catch(() => null)) || aktivan;
    await updateButtons();
    rerender();
  });
  document.addEventListener('poruke:promjena', updateBadge);
  document.addEventListener('uzivo:pozicije', (e) => { pozicije = e.detail.rows || []; rerender(); });
  document.addEventListener('poruke:promjena', rerender);
  document.addEventListener('lov:slike-promjena', (e) => { if (e.detail?.lovId === rec?.id) rerender(); });
  document.addEventListener('sekcije:promjena', updateButtons);
  $('btn-dodaj')?.addEventListener('click', updateButtons);
  registerBackHandler(() => {
    if (screen.hidden) return false;
    close();
    return true;
  });
  updateButtons();
}
