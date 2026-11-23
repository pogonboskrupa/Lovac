// Ploča "+": "Dodaj lov" (grupovođa/admin, kad nema lova u toku) i "Lov traje" (dok traje lov u kojem sam).
// Ekran "Lov traje": pregled, lovci (pozicija uživo, poruke i slike svakog), poruke lova i slike lova.
// Sve se crta iz keša na telefonu; dok je ekran otvoren i ima veze, osvježava se u pozadini.
import { todayHuntSummary } from './lov-danas.js';
import { organizableSections, huntButtons, participantRows, huntMessages, huntPhotos, SVJEZINA_TEKST } from './lov-traje.js';
import { conversationItems, formatMessageTime } from './poruke.js';
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
  let rec = null;
  let pozicije = [];
  let tab = 'pregled';
  let otvoren = null; // učesnik čiji su detalji rastvoreni
  let timer = null;
  let renderSeq = 0;
  const me = () => cachedProfile();

  const updateButtons = async () => {
    const aktivan = rec?.lov?.status === 'u_toku' ? rec : null;
    const org = aktivan ? false : organizableSections(await cachedSekcije().catch(() => ({})), me()).length > 0;
    const st = huntButtons({ aktivan, organizator: org });
    btn.hidden = !st.traje;
    if (btnDodaj) btnDodaj.hidden = !st.dodaj;
    if (st.traje) $('lov-danas-opis').textContent = rec.lov.naziv;
    if (!st.traje && !screen.hidden) close();
  };

  const data = async () => {
    const lovId = rec.id;
    const poruke = huntMessages(await idbAll('poruke').catch(() => []), lovId);
    const detalj = await idbGet('arhiva', `detalj:${lovId}`).catch(() => null);
    const cekaju = (await idbAll('arhiva_red').catch(() => [])).filter((x) => x.lov_id === lovId);
    return { poruke, slike: huntPhotos(detalj?.slike || [], cekaju) };
  };

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
    const s = todayHuntSummary(rec, me()?.id, memberName);
    if (!s) { $('ld-sadrzaj').innerHTML = '<p>Nema lova u toku.</p>'; return; }
    const { poruke, slike } = await data();
    if (t !== renderSeq) return; // sporije crtanje ne prepisuje novije
    const rows = participantRows(s.ucesnici, { pozicije, poruke, slike });
    $('ld-broj-ucesnika').textContent = `(${rows.length})`;
    $('ld-broj-poruka').textContent = poruke.length ? `(${poruke.length})` : '';
    $('ld-broj-slika').textContent = slike.length ? `(${slike.length})` : '';
    const uzivo = rows.filter((r) => r.svjezina === 'uzivo').length;

    $('ld-sadrzaj').innerHTML = `
      <div class="p-kartica ld-hero">
        <span class="lk-chip" data-chip="u_toku">U TOKU</span>
        <h3>${escapeHtml(s.naziv)}</h3>
        ${s.mjesto ? `<p class="sitno">${escapeHtml(s.mjesto)}</p>` : ''}
        <div class="ld-brojke">
          <span><b>${escapeHtml(s.pocetak || '—')}</b> početak</span>
          <span><b>${escapeHtml(s.trajanje || '—')}</b> traje</span>
          <span><b>${s.brojevi.ucesnika}</b> lovaca</span>
          <span><b>${uzivo}</b> uživo</span>
        </div>
      </div>
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
            <span class="sitno">${escapeHtml(r.ulogaTekst)}${r.stan != null ? ` · stan ${r.stan}` : ''} · ${escapeHtml(r.ja ? 'ti' : SVJEZINA_TEKST[r.svjezina])}</span></span>
          <span class="ld-brojaci"><span title="Poruke">${r.poruka} por.</span><span title="Slike">${r.slika} sl.</span></span>
        </button>
        ${open ? `<div class="ld-lovac-detalj">
          ${njegovePoruke.length ? njegovePoruke.map((m) => `<p class="ld-lovac-poruka"><small>${escapeHtml(formatMessageTime(m.created_at))}</small> ${escapeHtml(m.tekst)}</p>`).join('') : '<p class="sitno">Nema poruka u ovom lovu.</p>'}
          ${njegoveSlike.length ? `<div class="ld-slike ld-slike-mali">${thumbs(njegoveSlike)}</div>` : '<p class="sitno">Nema slika.</p>'}
          ${!r.ja && r.svjezina !== 'nema' ? '<button type="button" class="dugme" data-akcija="na-karti">Na karti</button>' : ''}
        </div>` : ''}
      </li>`;
    }).join('') || '<li class="sitno">Nema upisanih lovaca.</li>';

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
    if (name === 'poruke') { const box = $('ld-poruke'); box.scrollTop = box.scrollHeight; }
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
    const a = e.target.closest('[data-akcija]')?.dataset.akcija;
    if (!a || !rec) return;
    const uid = e.target.closest('[data-uid]')?.dataset.uid;
    if (a === 'lovac') { otvoren = otvoren === uid ? null : uid; render(); return; }
    close();
    if (a === 'raspored') document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: rec.id } }));
    if (a === 'tok') $('btn-tok')?.click();
    if (a === 'lokacija') $('btn-lokacija')?.click();
    if (a === 'na-karti') document.dispatchEvent(new CustomEvent('lov:prikazi-lovca', { detail: { korisnikId: uid } }));
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
  document.addEventListener('lov:aktivan', (e) => { rec = e.detail.lov; updateButtons(); rerender(); });
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
