// Ekran "Statistika odstrela": godina, vrsta, revir, sekcija; zbir po vrsti/mjesecu/reviru/sekciji/lovcu; CSV i PDF.

import { listRecords } from './zapisi.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { cachedSekcije } from './sekcije-ui.js';
import { memberName } from './dijeljenje-ui.js';
import { harvestStats, statRows, yearsOf, UNKNOWN } from './odstrel-stat.js';
import { toCsv, reportHtml, formatDecimalBs, NAPOMENA_DNEVNIK } from './odstrel.js';
import { shareFile } from './dijeljenje.js';
import { printHtml } from './odstrel-ui.js';
import { registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const MJESECI = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
const kg = (n) => `${formatDecimalBs(Math.round(n * 10) / 10)} kg`;

export function initOdstrelStat() {
  const screen = $('odstrel-stat');
  const filter = { godina: null, vrsta: '', revir: '', sekcija: '' };
  let ctx = { reviri: [], sekcije: [] };
  let vrste = [];
  let records = [];

  const nameOf = () => ({
    vrsta: (k) => lookupNaziv(vrste, k),
    revir: (k) => ctx.reviri.find((r) => r.id === k)?.naziv || 'Nepoznat revir',
    sekcija: (k) => ctx.sekcije.find((s) => s.id === k)?.naziv || 'Nepoznata sekcija',
  });
  const lovacOf = (o) => (o.tudji ? memberName(o.vlasnik_id) : o.lovac || '');
  const compute = () => harvestStats(records, filter, lovacOf);

  const options = (items, selected, first) => `<option value="">${first}</option>${items.map(([v, label]) =>
    `<option value="${escapeHtml(v)}"${v === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}`;

  const render = async () => {
    [records, vrste, ctx] = [await listRecords('odstrel'), await getSpisakAll('vrste'), await cachedSekcije()];
    const years = yearsOf(records);
    if (filter.godina == null || !years.includes(filter.godina)) filter.godina = years[0] ?? new Date().getFullYear();
    $('ods-stat-godina').innerHTML = (years.length ? years : [filter.godina]).map((y) => `<option value="${y}"${y === filter.godina ? ' selected' : ''}>${y}</option>`).join('');
    $('ods-stat-vrsta').innerHTML = options(vrste.map((v) => [v.kod, v.naziv]), filter.vrsta, 'Sve vrste');
    $('ods-stat-revir').innerHTML = options([...ctx.reviri.map((r) => [r.id, r.naziv]), [UNKNOWN, 'Izvan lova']], filter.revir, 'Svi reviri');
    $('ods-stat-sekcija').innerHTML = options([...ctx.sekcije.map((s) => [s.id, s.naziv]), [UNKNOWN, 'Izvan lova']], filter.sekcija, 'Sve sekcije');
    const s = compute();
    const n = nameOf();
    $('ods-stat-ukupno').textContent = s.ukupno.komada
      ? `Ukupno ${s.ukupno.komada} kom., ${kg(s.ukupno.tezina)} (${filter.godina})`
      : `Nema odstrela za ${filter.godina}.`;
    const max = Math.max(1, ...s.poMjesecu);
    $('ods-stat-mjeseci').innerHTML = s.poMjesecu.map((c, i) => `<li><span class="stat-mj">${MJESECI[i]}</span>
      <span class="stat-traka" style="width:${Math.round((c / max) * 100)}%"></span><b>${c}</b></li>`).join('');
    const group = (id, list, name) => {
      $(id).innerHTML = list.map((x) => `<li>${escapeHtml(x.kljuc === UNKNOWN ? 'Izvan lova / nije navedeno' : name(x.kljuc))}: <b>${x.komada}</b> kom.,
        ${kg(x.tezina)}${x.prosjek != null ? `, prosjek ${kg(x.prosjek)}` : ''}</li>`).join('') || '<li class="sitno">Nema podataka.</li>';
    };
    group('ods-stat-vrste', s.poVrsti, n.vrsta);
    group('ods-stat-reviri', s.poReviru, n.revir);
    group('ods-stat-sekcije', s.poSekciji, n.sekcija);
    group('ods-stat-lovci', s.poLovcu, (k) => k);
  };

  const KOLONE = [
    { key: 'grupa', label: 'Grupa' }, { key: 'naziv', label: 'Naziv' }, { key: 'komada', label: 'Komada' },
    { key: 'tezina', label: 'Težina (kg)', type: 'decimal' }, { key: 'prosjek', label: 'Prosjek (kg)', type: 'decimal' },
  ];

  $('btn-ods-stat').addEventListener('click', async () => { await render(); screen.hidden = false; });
  $('btn-ods-stat-zatvori').addEventListener('click', () => { screen.hidden = true; });
  registerBackHandler(() => { if (screen.hidden) return false; screen.hidden = true; return true; });
  for (const [id, key] of [['ods-stat-godina', 'godina'], ['ods-stat-vrsta', 'vrsta'], ['ods-stat-revir', 'revir'], ['ods-stat-sekcija', 'sekcija']]) {
    $(id).addEventListener('change', (e) => { filter[key] = key === 'godina' ? Number(e.target.value) : e.target.value; render(); });
  }
  $('btn-ods-stat-csv').addEventListener('click', () => {
    shareFile(`statistika-odstrela-${filter.godina}.csv`, 'text/csv', toCsv(statRows(compute(), nameOf()), KOLONE));
  });
  $('btn-ods-stat-pdf').addEventListener('click', () => {
    const s = compute();
    printHtml(reportHtml({
      naslov: `Statistika odstrela ${filter.godina} — Lovačko društvo "Grmeč"`,
      podnaslov: `Ukupno ${s.ukupno.komada} kom., ${kg(s.ukupno.tezina)}`,
      redovi: statRows(s, nameOf()).map((r) => ({ ...r, tezina: kg(r.tezina), prosjek: r.prosjek != null ? kg(r.prosjek) : '' })),
      kolone: KOLONE,
      napomena: NAPOMENA_DNEVNIK,
    }), `Statistika odstrela ${filter.godina}`);
  });
}
