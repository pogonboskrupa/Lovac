// "Pregled": ono što uloga smije vidjeti o prijavljenim ulovima. Šta stiže provodi server (RLS na ulov_prijave),
// a ovdje se podaci sabiraju za administratora (društvo), lovočuvara (revir), grupovođu (sekcija) i lovca (moje prijave).

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { memberName } from './dijeljenje-ui.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { formatDecimalBs } from './odstrel.js';
import { formatWhen } from './opazanja-ui.js';
import { MJESECI } from './divljac.js';
import {
  ULOGE_OPIS, collectPages, viewerRole, activeReports, reportYears, byYear, totals, groupBy, byMonth, latestReports, societyFigures,
} from './pregled.js';
import { withdrawReport } from './prijave-ui.js';
import { registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const CACHE_ID = 'pregled-prijave';
const $ = (id) => document.getElementById(id);
const kg = (v) => formatDecimalBs(Math.round(v * 10) / 10);

export function initPregled() {
  const panel = $('pregled');
  let rows = [];
  let fetchedAt = null;
  let year = 'sve';
  let seq = 0;

  const load = async () => {
    const cached = await idbGet('arhiva', CACHE_ID).catch(() => null);
    if (cached) { rows = cached.rows || []; fetchedAt = cached.at; }
    if (connectionQuality() === 'nema' || !getClient()) return { fresh: false };
    try {
      rows = await collectPages(async (from, to) => {
        const { data, error } = await getClient().from('ulov_prijave').select('*').order('id').range(from, to);
        if (error) throw new Error(error.message);
        return data || [];
      });
      fetchedAt = Date.now();
      await idbPut('arhiva', { id: CACHE_ID, rows, at: fetchedAt });
      return { fresh: true };
    } catch (err) {
      console.warn('pregled', err.message);
      return { fresh: false };
    }
  };

  const renderGroups = (act, ctx, vrste, role) => {
    const revirName = (id) => ctx.reviri.find((r) => r.id === id)?.naziv || 'Revir';
    const sekName = (id) => ctx.sekcije.find((s) => s.id === id)?.naziv || (id ? 'Sekcija' : 'Bez sekcije');
    const line = (naslov, g, sub = '') => `<li class="tr-kartica ev-kartica" data-kljuc="${escapeHtml(String(g.kljuc))}">
      <b>${escapeHtml(naslov)}</b><span class="sitno">${g.komada} kom. · ${escapeHtml(kg(g.kg))} kg${sub ? ` · ${escapeHtml(sub)}` : ''}</span></li>`;
    $('pr-reviri-blok').hidden = !['admin', 'lovocuvar'].includes(role);
    $('pr-sekcije-blok').hidden = role === 'lovac';
    $('pr-lovci-blok').hidden = role === 'lovac';
    $('pr-reviri').innerHTML = groupBy(act, 'revir_id').map((g) => line(revirName(g.kljuc), g)).join('') || '<li class="sitno">Nema prijava.</li>';
    $('pr-sekcije').innerHTML = groupBy(act, 'sekcija_id').map((g) => line(sekName(g.kljuc), g)).join('') || '<li class="sitno">Nema prijava.</li>';
    $('pr-lovci').innerHTML = groupBy(act, 'lovac_id').map((g) => line(memberName(g.kljuc), g)).join('') || '<li class="sitno">Nema prijava.</li>';
    $('pr-vrste').innerHTML = groupBy(act, 'vrsta').map((g) => `<li>${escapeHtml(lookupNaziv(vrste, g.kljuc))}: <b>${g.komada}</b> kom., ${escapeHtml(kg(g.kg))} kg</li>`).join('')
      || '<li>Nema prijava u ovom periodu.</li>';
  };

  const renderMonths = (act) => {
    const m = byMonth(act, year);
    const max = Math.max(1, ...m);
    $('pr-mjeseci').innerHTML = m.map((n, i) => `<div class="pr-mj" data-mjesec="${i + 1}" data-n="${n}"><span class="pr-mj-bar"><i style="height:${Math.round((n / max) * 100)}%"></i></span><b>${n || ''}</b><span class="sitno">${MJESECI[i]}</span></div>`).join('');
  };

  const render = async () => {
    const me = cachedProfile();
    const ctx = await cachedSekcije();
    const vrste = await getSpisakAll('vrste');
    const role = viewerRole(me, ctx);
    const opis = ULOGE_OPIS[role];
    $('pr-uloga').textContent = opis.naziv;
    $('pr-uloga').dataset.uloga = role;
    $('pr-opis').textContent = opis.opis;
    $('pr-opseg').textContent = {
      admin: `Društvo: ${ctx.reviri.length} revira`,
      lovocuvar: 'Moj revir',
      grupovodja: 'Moja sekcija',
      lovac: 'Moje prijave',
    }[role];
    $('pregled-naslov').textContent = role === 'lovac' ? 'Moje prijave' : 'Pregled';

    const all = activeReports(rows);
    const years = reportYears(all);
    if (year !== 'sve' && !years.includes(Number(year))) year = 'sve';
    $('pr-godine').innerHTML = ['sve', ...years].map((y) => `<button type="button" data-godina="${y}" aria-pressed="${String(y) === String(year)}">${y === 'sve' ? 'Sve' : y}</button>`).join('');
    const act = byYear(all, year);
    const t = totals(act);
    $('pr-stat-komada').textContent = String(t.komada);
    $('pr-stat-kg').textContent = kg(t.kg);
    $('pr-stat-vrsta').textContent = String(t.vrsta);
    $('pr-stat-lovaca').textContent = String(t.lovaca);

    const fig = societyFigures(ctx);
    $('pr-drustvo-blok').hidden = role !== 'admin';
    $('pr-drustvo').innerHTML = [['Revira', fig.reviri], ['Sekcija', fig.sekcija], ['Članova u sekcijama', fig.clanova], ['Lovočuvara', fig.lovocuvara], ['Grupovođa', fig.grupovodja]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    renderGroups(act, ctx, vrste, role);
    renderMonths(all);
    $('pr-zadnje-naslov').textContent = role === 'lovac' ? 'Moje prijave' : 'Zadnje prijave';
    const list = role === 'lovac' ? latestReports(act, 50) : latestReports(act, 12);
    $('pr-zadnje').innerHTML = list.map((r) => `<li class="tr-kartica ev-kartica" data-id="${escapeHtml(r.id)}">
        <b>${escapeHtml(lookupNaziv(vrste, r.vrsta))}${r.kategorija ? ` · ${escapeHtml(r.kategorija)}` : ''}</b>
        <span class="sitno">${escapeHtml(formatWhen(new Date(r.vrijeme).getTime()))}${r.tezina != null ? ` · ${escapeHtml(formatDecimalBs(Number(r.tezina)))} kg` : ''} · ${escapeHtml(memberName(r.lovac_id))}</span>
        ${r.lovac_id === me?.id ? '<button type="button" class="dugme" data-akcija="povuci">Povuci prijavu</button>' : ''}</li>`).join('')
      || '<li class="sitno">Još nema prijavljenih ulova.</li>';
    $('pr-zadnje').querySelectorAll('[data-akcija="povuci"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        if (await withdrawReport(b.closest('[data-id]').dataset.id)) {
          rows = rows.map((r) => (r.id === b.closest('[data-id]').dataset.id ? { ...r, povucena: true } : r));
          await idbPut('arhiva', { id: CACHE_ID, rows, at: fetchedAt });
          render();
        }
      });
    });
  };

  const stateText = (fresh) => {
    if (fresh) return 'Podaci sa servera, upravo osvježeni.';
    if (fetchedAt) return `Nema veze: prikazano stanje od ${formatWhen(fetchedAt)}.`;
    return connectionQuality() === 'nema' ? 'Nema veze i nema sačuvanih podataka. Pregled traži internet bar jednom.' : 'Pregled nije mogao biti učitan.';
  };

  const open = async () => {
    $('meni-spiskovi').hidden = true;
    const my = ++seq;
    panel.hidden = false;
    $('pr-stanje').textContent = 'Učitavam…';
    // Prvo zadnje sačuvano (radi i bez veze), pa osvježavanje sekcija u pozadini (uloga zavisi od njih).
    await render().catch(() => {});
    if (connectionQuality() !== 'nema' && getClient()) {
      downloadSekcije().then(() => { if (my === seq && !panel.hidden) render(); }).catch(() => {});
    }
    const { fresh } = await load();
    if (my !== seq) return;
    $('pr-stanje').textContent = stateText(fresh);
    await render();
  };

  $('btn-pregled').addEventListener('click', open);
  $('btn-pregled-zatvori').addEventListener('click', () => { panel.hidden = true; seq++; });
  $('pr-godine').addEventListener('click', (e) => {
    const b = e.target.closest('[data-godina]');
    if (b) { year = b.dataset.godina; render(); }
  });
  document.addEventListener('prijave:promjena', () => { if (!panel.hidden) open(); });
  registerBackHandler(() => { if (panel.hidden) return false; panel.hidden = true; seq++; return true; });
}
