// "Statistika i rejting": zbirke po sekciji, revir ili cijelom društvu i rejting lovaca po kriterijima.
// Opseg po ulozi provodi server (funkcije sa provjerom opsega); klijent samo bira među dozvoljenim opsezima.

import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { memberName } from './dijeljenje-ui.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { formatDecimalBs } from './odstrel.js';
import { formatWhen } from './opazanja-ui.js';
import { MJESECI } from './divljac.js';

const MJESECI_PUNI = ['januar', 'februar', 'mart', 'april', 'maj', 'juni', 'juli', 'august', 'septembar', 'oktobar', 'novembar', 'decembar'];
import { scopeOptions, periodDates, buildStats, shareOfMax, bestMonth } from './statistika-opsega.js';
import { speciesBadge } from './evidencija.js';
import { rankMembers, mergeCriteria, validateWeights, ZADANI_KRITERIJI } from './rejting.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const kg = (v) => formatDecimalBs(Math.round(v * 10) / 10);
const KRIT_CACHE = 'rejting-kriteriji';

const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

async function rpc(name, args) {
  const { data, error } = await getClient().rpc(name, args);
  if (error) throw new Error(error.message);
  return data || [];
}

export function initStatistika() {
  const panel = $('statistika');
  let ctx = { reviri: [], sekcije: [], clanovi: [], lovocuvari: [] };
  let options = [];
  let scope = null;
  let year = String(new Date().getFullYear());
  let tab = 'statistika';
  let data = { ulov: [], lovovi: [], rejting: [] };
  let criteria = ZADANI_KRITERIJI;
  let criteriaServer = false;
  let fetchedAt = null;
  let seq = 0;

  const cacheKey = () => `stat:${scope?.kljuc}:${year}`;

  const loadCriteria = async () => {
    const cached = await idbGet('arhiva', KRIT_CACHE).catch(() => null);
    if (cached?.rows?.length) { criteria = mergeCriteria(cached.rows); criteriaServer = true; }
    if (!online()) return;
    try {
      const { data: rows, error } = await getClient().from('rejting_kriteriji').select('*');
      if (error) throw new Error(error.message);
      if (rows?.length) { criteria = mergeCriteria(rows); criteriaServer = true; await idbPut('arhiva', { id: KRIT_CACHE, rows }); }
    } catch (err) {
      console.warn('kriteriji', err.message);
    }
  };

  const load = async () => {
    const cached = await idbGet('arhiva', cacheKey()).catch(() => null);
    data = cached?.data || { ulov: [], lovovi: [], rejting: [] };
    fetchedAt = cached?.at || null;
    if (!online() || !scope) return false;
    const { od, do: doo } = periodDates(year);
    const args = { p_sek: scope.sek, p_revir: scope.revir, p_od: od, p_do: doo };
    try {
      const [ulov, lovovi, rejting] = await Promise.all([rpc('statistika_ulov', args), rpc('statistika_lovovi', args), rpc('rejting_podaci', args)]);
      data = { ulov, lovovi, rejting };
      fetchedAt = Date.now();
      await idbPut('arhiva', { id: cacheKey(), data, at: fetchedAt });
      return true;
    } catch (err) {
      console.warn('statistika', err.message);
      return false;
    }
  };

  const revirName = (id) => ctx.reviri.find((r) => r.id === id)?.naziv || 'Revir';
  const sekName = (id) => ctx.sekcije.find((s) => s.id === id)?.naziv || 'Sekcija';
  // Kartica grupe: naziv, tri broja i traka odaziva (koliko je lovaca dolazilo na lovove).
  const line = (naslov, g, extra = '') => {
    const od = g.odaziv != null ? Math.round(g.odaziv) : null;
    return `<li class="tr-kartica ev-kartica st-grupa" data-kljuc="${escapeHtml(String(g.sekcija_id || g.revir_id))}">
      <div class="st-grupa-glava"><b>${escapeHtml(naslov)}</b>${extra ? `<span class="sitno">${escapeHtml(extra)}</span>` : ''}</div>
      <div class="st-brojke"><span><b>${g.lovova}</b> lovova</span><span><b>${g.komada}</b> kom.</span><span><b>${escapeHtml(kg(g.kg))}</b> kg</span></div>
      <div class="st-traka" data-pct="${od ?? ''}"><span>Odaziv</span><span class="st-traka-bar"><i style="width:${od ?? 0}%"></i></span><b>${od != null ? `${od} %` : '—'}</b></div></li>`;
  };

  const renderStats = async () => {
    const vrste = await getSpisakAll('vrste');
    const s = buildStats(data);
    $('st-lovova').textContent = String(s.ukupno.lovova);
    $('st-ucesca').textContent = String(s.ukupno.ucesca);
    $('st-odaziv').textContent = s.ukupno.odaziv != null ? `${String(s.ukupno.odaziv).replace('.', ',')} %` : '—';
    $('st-komada').textContent = String(s.ukupno.komada);
    $('st-kg').textContent = kg(s.ukupno.kg);
    $('st-vrsta').textContent = String(s.ukupno.vrsta);
    const society = scope?.kljuc === 'drustvo';
    const isRevir = scope?.kljuc?.startsWith('revir:');
    $('st-reviri-blok').hidden = !society;
    $('st-sekcije-blok').hidden = !(society || isRevir);
    $('st-reviri').innerHTML = s.reviri.map((r) => line(revirName(r.revir_id), r, `${r.sekcija} ${r.sekcija === 1 ? 'sekcija' : 'sekcija'}`)).join('') || '<li class="sitno">Nema podataka.</li>';
    $('st-sekcije').innerHTML = s.sekcije.map((g) => line(`${society ? `${revirName(g.revir_id)} · ` : ''}${sekName(g.sekcija_id)}`, g)).join('') || '<li class="sitno">Nema podataka.</li>';
    const maxVrsta = Math.max(0, ...s.vrste.map((g) => g.komada));
    $('st-vrste').innerHTML = s.vrste.map((g) => {
      const naziv = lookupNaziv(vrste, g.vrsta);
      const b = speciesBadge(g.vrsta, naziv);
      const pct = shareOfMax(g.komada, maxVrsta);
      return `<li class="st-vrsta" data-vrsta="${escapeHtml(g.vrsta)}"><span class="div-emblem" style="background:${escapeHtml(b.boja)}" aria-hidden="true">${escapeHtml(b.znak)}</span>
        <div class="st-vrsta-tekst"><b>${escapeHtml(naziv)}</b><span class="st-traka-bar"><i style="width:${pct}%"></i></span></div>
        <span class="st-vrsta-broj"><b>${g.komada}</b> kom.<br><span class="sitno">${escapeHtml(kg(g.kg))} kg</span></span></li>`;
    }).join('') || '<li class="sitno">Nema prijavljenog ulova u ovom periodu.</li>';
    const max = Math.max(1, ...s.mjeseci);
    const nowMonth = String(year) === String(new Date().getFullYear()) ? new Date().getMonth() + 1 : null;
    $('st-mjeseci').innerHTML = s.mjeseci.map((n, i) => `<div class="pr-mj" data-mjesec="${i + 1}" data-n="${n}"${nowMonth === i + 1 ? ' data-sada' : ''}><span class="pr-mj-bar"><i style="height:${Math.round((n / max) * 100)}%"></i></span><b>${n || ''}</b><span class="sitno">${MJESECI[i]}</span></div>`).join('');
    const best = bestMonth(s.mjeseci);
    $('st-mjesec-najbolji').textContent = best ? `Najviše ulova: ${MJESECI_PUNI[best.mjesec - 1]} (${best.komada} kom.)` : '';
  };

  const renderRating = () => {
    const me = cachedProfile();
    const multi = !scope?.sek;
    const ranked = rankMembers(data.rejting, criteria, memberName);
    $('st-rejting-opis').textContent = scope?.sek
      ? 'Ljestvica sekcije prema kriterijima ispod. Računa se samo za lovce u sekciji sa bar jednim održanim lovom u periodu.'
      : 'Ljestvica svih lovaca u opsegu (po sekcijama). Računa se samo za lovce sa bar jednim održanim lovom u periodu.';
    $('st-rejting').innerHTML = ranked.map((r) => {
      const mine = r.korisnik_id === me?.id;
      const score = r.ocjena.rangiran ? String(r.ocjena.ukupno).replace('.', ',') : '—';
      return `<li class="tr-kartica ev-kartica st-red${mine ? ' moj' : ''}" data-id="${escapeHtml(r.korisnik_id)}" data-sekcija="${escapeHtml(r.sekcija_id)}" data-mjesto="${r.mjesto ?? ''}">
        <div class="st-glava"><span class="st-mjesto">${r.mjesto ?? '–'}</span><b>${escapeHtml(r.ime)}${mine ? ' (ti)' : ''}</b><span class="st-ocjena">${score}</span></div>
        <span class="st-bar"><i style="width:${r.ocjena.rangiran ? r.ocjena.ukupno : 0}%"></i></span>
        <span class="sitno">${multi ? `${escapeHtml(revirName(r.revir_id))} · ${escapeHtml(sekName(r.sekcija_id))} · ` : ''}${r.lovova_ucesce}/${r.lovova_odrzano} lovova · ${r.komada} prijavljenih kom.${r.ocjena.rangiran ? '' : ' · nema održanih lovova'}</span>
        ${r.ocjena.rangiran ? `<details><summary class="sitno">Kako je izračunato</summary><ul class="st-dijelovi">${r.ocjena.dijelovi.map((d) => `<li><span>${escapeHtml(d.naziv)} <span class="sitno">(težina ${d.tezina})</span></span><b>${d.ocjena != null ? String(Math.round(d.ocjena)).replace('.', ',') : 'nema podataka'}</b></li>`).join('')}</ul></details>` : ''}
      </li>`;
    }).join('') || '<li class="sitno">Još nema podataka za rejting.</li>';

    $('st-kriteriji').innerHTML = criteria.filter((k) => k.aktivno !== false).map((k) => `<li class="tr-kartica ev-kartica" data-kod="${escapeHtml(k.kod)}">
        <b>${escapeHtml(k.naziv)} <span class="tr-chip">težina ${k.tezina}</span></b><span class="sitno">${escapeHtml(k.opis || '')}${k.granica ? ` Gornja granica: ${k.granica}.` : ''}</span></li>`).join('');
    const izm = criteria.find((k) => k.izmijenio);
    $('st-kriteriji-izvor').textContent = criteriaServer
      ? (izm ? `Težine unosi administrator. Zadnja izmjena: ${memberName(izm.izmijenio)}, ${formatWhen(Date.parse(izm.izmijenjeno))}.` : 'Težine unosi administrator.')
      : 'Prikazane su zadane težine (administrator još nije podesio ili nema veze sa serverom).';

    const admin = Boolean(me?.is_admin);
    $('st-kriteriji-admin').hidden = !admin;
    if (admin) {
      $('st-kriteriji-forma').innerHTML = `${criteria.map((k) => `<label>${escapeHtml(k.naziv)} (0–100)<input type="number" inputmode="numeric" min="0" max="100" step="1" name="t-${escapeHtml(k.kod)}" value="${k.tezina}"></label>
        ${k.granica != null ? `<label>${escapeHtml(k.naziv)}: gornja granica<input type="number" inputmode="decimal" min="1" step="1" name="g-${escapeHtml(k.kod)}" value="${k.granica}"></label>` : ''}`).join('')}
        <button type="submit" class="dugme glavno">Sačuvaj težine</button>`;
    }
  };

  const render = async () => {
    $('st-prazno').hidden = options.length > 0;
    $('st-tab-statistika').hidden = tab !== 'statistika' || !options.length;
    $('st-tab-rejting').hidden = tab !== 'rejting' || !options.length;
    $('st-tabovi').querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    if (!options.length) return;
    await renderStats();
    renderRating();
  };

  const stateText = (fresh) => {
    if (fresh) return 'Podaci sa servera, upravo osvježeni.';
    if (fetchedAt) return `Nema veze: prikazano stanje od ${formatWhen(fetchedAt)}.`;
    return online() ? 'Podaci nisu mogli biti učitani.' : 'Nema veze i nema sačuvanih podataka. Statistika traži internet bar jednom.';
  };

  const refresh = async () => {
    const my = ++seq;
    $('st-stanje').textContent = 'Učitavam…';
    const fresh = await load();
    if (my !== seq) return;
    $('st-stanje').textContent = stateText(fresh);
    await render();
  };

  const renderControls = () => {
    $('st-opseg').innerHTML = options.map((o) => `<option value="${escapeHtml(o.kljuc)}"${o.kljuc === scope?.kljuc ? ' selected' : ''}>${escapeHtml(o.naziv)}</option>`).join('');
    $('st-opseg').closest('label').hidden = options.length < 2;
    const y = new Date().getFullYear();
    const years = ['sve', ...Array.from({ length: 10 }, (_, i) => String(y - i))];
    $('st-godine').innerHTML = years.map((v) => `<button type="button" data-godina="${v}" aria-pressed="${v === year}">${v === 'sve' ? 'Sve' : v}</button>`).join('');
  };

  const open = async () => {
    $('meni-spiskovi').hidden = true;
    // Prvo keš (ekran se otvara odmah i bez veze), pa osvježavanje sekcija u pozadini: na mrtvoj vezi zahtjev visi do roka.
    const applyCtx = async () => {
      ctx = await cachedSekcije();
      options = scopeOptions(cachedProfile(), ctx);
      if (!options.some((o) => o.kljuc === scope?.kljuc)) scope = options[0] || null;
      renderControls();
    };
    await applyCtx();
    panel.hidden = false;
    // Bez ijedne sačuvane sekcije nema opsega za prikaz: tada se (samo prvi put) čeka server, ali ekran je već otvoren.
    if (!scope && online()) { $('st-stanje').textContent = 'Preuzimam sekcije sa servera…'; await downloadSekcije().catch(() => {}); await applyCtx(); }
    else if (online()) downloadSekcije().then(() => { if (!panel.hidden) applyCtx(); }).catch(() => {});
    await loadCriteria();
    if (!scope) { $('st-stanje').textContent = ''; await render(); return; }
    await refresh();
  };

  $('btn-statistika').addEventListener('click', open);
  $('btn-statistika-zatvori').addEventListener('click', () => { panel.hidden = true; seq++; });
  $('st-opseg').addEventListener('change', (e) => { scope = options.find((o) => o.kljuc === e.target.value) || scope; refresh(); });
  $('st-godine').addEventListener('click', (e) => {
    const b = e.target.closest('[data-godina]');
    if (b) { year = b.dataset.godina; renderControls(); refresh(); }
  });
  $('st-tabovi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; render(); }
  });
  $('st-kriteriji-forma').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const rows = criteria.map((k) => ({
      kod: k.kod, naziv: k.naziv, opis: k.opis || '', redoslijed: k.redoslijed ?? 0, aktivno: k.aktivno !== false,
      tezina: Number(f[`t-${k.kod}`]?.value), granica: f[`g-${k.kod}`] ? Number(f[`g-${k.kod}`].value) : (k.granica ?? null),
    }));
    const msg = validateWeights(rows);
    const status = $('st-kriteriji-status');
    if (msg) { status.textContent = msg; return; }
    if (!online()) { status.textContent = 'Čuvanje težina traži vezu sa serverom'; return; }
    status.textContent = 'Šaljem…';
    const { error } = await getClient().from('rejting_kriteriji').upsert(rows, { onConflict: 'kod' });
    if (error) { status.textContent = 'Težine nisu sačuvane'; return; }
    status.textContent = 'Težine su sačuvane';
    await loadCriteria();
    renderRating();
  });
  registerBackHandler(() => { if (panel.hidden) return false; panel.hidden = true; seq++; return true; });
}
