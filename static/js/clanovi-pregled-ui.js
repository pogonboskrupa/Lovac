// Meni → Članovi i grupe: pregled svih članova po revirima, sekcijama i grupama za vodstvo društva (opseg po ulozi,
// `clanovi-pregled.js`). Prikazuje se odmah iz keša; sa servera se osvježava u pozadini (sekcije, grupe, imena).
import { cachedProfile } from './auth.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { getClient } from './auth.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { matchesQuery } from './pretraga.js';
import { initialsOf } from './lokacija.js';
import { toCsv } from './odstrel.js';
import { saveFile } from './dijeljenje.js';
import { overviewScope, buildOverview, filterOverview, FILTERI, CSV_COLUMNS, csvRows, csvName, menuText } from './clanovi-pregled.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);

const memberLi = (m, oznaka = '') => `<li class="cp-clan" data-uid="${escapeHtml(m.id)}"><span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(m.ime))}</span>
  <span class="cp-ime">${escapeHtml(m.ime)}</span>${oznaka ? `<span class="sk-znacka" data-uloga="grupovodja">${oznaka}</span>` : ''}</li>`;

// Čista funkcija crtanja stabla; `otvoreno` je skup ključeva sklopivih dijelova koji su rasklopljeni.
export function treeHtml(ov, otvoreno, { aktivno }) {
  if (!ov.reviri.length) return '<p class="sitno">Nema članova koji odgovaraju prikazu.</p>';
  return ov.reviri.map((r) => `<details class="cp-revir" data-kljuc="r:${escapeHtml(r.id)}"${otvoreno.has(`r:${r.id}`) || aktivno || ov.reviri.length === 1 ? ' open' : ''}>
    <summary><b>Revir ${escapeHtml(r.naziv)}</b><span class="sitno"> · ${r.clanova} članova · ${r.sekcije.length} sekcija</span></summary>
    ${r.sekcije.map((s) => `<details class="cp-sekcija" data-kljuc="s:${escapeHtml(s.id)}"${otvoreno.has(`s:${s.id}`) || aktivno ? ' open' : ''}>
      <summary><b>${escapeHtml(s.naziv)}</b><span class="sitno"> · ${s.clanova} članova · ${s.grupe.length} grupa${s.bezGrupe.length ? ` · ${s.bezGrupe.length} bez grupe` : ''}</span>${s.cekaju ? `<span class="cp-ceka">${s.cekaju} čeka</span>` : ''}</summary>
      <p class="sitno cp-vodja">Lovovođa sekcije: ${s.vodja ? escapeHtml(s.vodja.ime) : 'nije postavljen'}</p>
      ${s.grupe.map((g) => `<section class="cp-grupa" data-grupa="${escapeHtml(g.id)}"><h4>Grupa — grupovođa ${escapeHtml(g.grupovodja)} <span class="sitno">(${g.clanovi.length})</span></h4>
        <ul class="cp-clanovi">${g.clanovi.map((m) => memberLi(m, m.vodja ? 'Grupovođa' : '')).join('') || '<li class="sitno">Nema lovaca.</li>'}</ul></section>`).join('')}
      ${s.bezGrupe.length ? `<section class="cp-grupa cp-bez" data-bez="1"><h4>Bez grupe <span class="sitno">(${s.bezGrupe.length})</span></h4>
        <ul class="cp-clanovi">${s.bezGrupe.map((m) => memberLi(m)).join('')}</ul></section>` : ''}
      ${s.cekaju ? `<p class="sitno">Čeka odobrenje: ${s.cekaju} (imena vidi lovovođa sekcije).</p>` : ''}
    </details>`).join('')}
  </details>`).join('');
}

export function initClanoviPregled() {
  const screen = $('clanovi-pregled');
  const tile = $('btn-clanovi');
  let ctx = null;
  let scope = null;
  let query = '';
  let filter = 'svi';
  const otvoreno = new Set();

  const full = () => buildOverview(ctx, scope, memberName);

  const readOpen = () => {
    otvoreno.clear();
    screen.querySelectorAll('details[open][data-kljuc]').forEach((d) => otvoreno.add(d.dataset.kljuc));
  };

  const render = () => {
    if (!ctx || !scope) return;
    readOpen();
    const ov = full();
    const t = ov.totals;
    $('cp-uloga').textContent = scope.uloga;
    $('cp-opseg').textContent = scope.sve ? 'Cijelo društvo' : `Revir: ${ov.reviri.map((r) => r.naziv).join(', ') || '—'}`;
    $('cp-opis').textContent = scope.opis;
    $('cp-stat-clanova').textContent = String(t.clanova);
    $('cp-stat-grupa').textContent = String(t.grupa);
    $('cp-stat-bez').textContent = String(t.bezGrupe);
    $('cp-stat-cekaju').textContent = String(t.cekaju);
    const counts = { svi: t.clanova, 'bez-grupe': t.bezGrupe, cekaju: t.cekaju, vodstvo: t.grupa + ov.reviri.reduce((n, r) => n + r.sekcije.filter((s) => s.vodja).length, 0) };
    $('cp-filter').innerHTML = FILTERI.map((f) => `<button type="button" data-f="${f.id}" aria-pressed="${f.id === filter}">${escapeHtml(f.naziv)} (${counts[f.id]})</button>`).join('');
    const shown = filterOverview(ov, { query, filter }, matchesQuery);
    $('cp-stablo').innerHTML = treeHtml(shown, otvoreno, { aktivno: Boolean(query.trim()) || filter !== 'svi' });
  };

  const load = async () => {
    ctx = await cachedSekcije();
    scope = overviewScope(cachedProfile(), ctx);
    tile.hidden = !scope;
    return scope;
  };

  const online = () => isServerConfigured() && connectionQuality() !== 'nema' && Boolean(getClient());

  const open = async () => {
    await load();
    if (!scope) { toast('Pregled članova je za vodstvo društva'); return; }
    screen.hidden = false;
    $('cp-status').textContent = '';
    render();
    if (!online()) { $('cp-status').textContent = 'Bez veze — prikazano je zadnje stanje sa telefona.'; return; }
    try {
      await downloadSekcije({ grupe: true });
      await refreshMembers().catch(() => {});
      await load();
      render();
    } catch (err) {
      $('cp-status').textContent = `Nema veze sa serverom — prikazano je zadnje stanje (${err.message})`;
    }
  };
  const close = () => { screen.hidden = true; };

  tile.addEventListener('click', open);
  $('btn-cp-zatvori').addEventListener('click', close);
  $('cp-trazi').addEventListener('input', (e) => { query = e.target.value; render(); });
  $('cp-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (b) { filter = b.dataset.f; render(); }
  });
  $('btn-cp-sve').addEventListener('click', (e) => {
    const all = [...screen.querySelectorAll('details[data-kljuc]')];
    const open_ = all.every((d) => d.open);
    all.forEach((d) => { d.open = !open_; });
    e.target.textContent = open_ ? 'Rasklopi sve' : 'Sklopi sve';
  });
  $('btn-cp-csv').addEventListener('click', () => {
    if (!ctx || !scope) return;
    const rows = csvRows(full());
    if (!rows.length) { toast('Nema članova za izvoz'); return; }
    const kako = saveFile(csvName(), 'text/csv;charset=utf-8', toCsv(rows, CSV_COLUMNS));
    toast(kako === 'preuzimanja' ? 'Spisak je sačuvan u Preuzimanja/Lovac' : 'Spisak članova je spreman');
  });
  registerBackHandler(() => { if (screen.hidden) return false; close(); return true; });

  // pločica u Meniju: vidi se samo ko ima pravo; opis iz keša
  const refreshTile = async () => {
    await load();
    if (scope) $('btn-clanovi-opis').textContent = menuText(full());
  };
  document.addEventListener('sekcije:promjena', refreshTile);
  refreshTile().catch(() => {});
}
