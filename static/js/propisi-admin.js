// Admin uređivanje spiskova i propisa: lovostaj, lovno vrijeme, vrste divljači, vrste objekata.
// Server provjerava je_admin() i sam upisuje ko je i kad promijenio; brisanja nema (sklanjanje).

import { getClient } from './auth.js';
import { refreshSpisak, getSpisakAll, lookupNaziv } from './spiskovi.js';
import { parseDayMonth, formatDayMonth } from './propisi.js';
import { registerBackHandler, escapeHtml, toast } from './ui.js';
import { describeProfile } from './postavke.js';

const $ = (id) => document.getElementById(id);

const IKONE = ['ceka-visoka', 'ceka-niska', 'zaklon', 'hraniliste', 'soliste', 'kaljuziste', 'pojiliste', 'kuca', 'kamera', 'auto', 'pin'];

export const EDITORI = {
  lovostaj: {
    naslov: 'Lovostaj (kad je lov otvoren)',
    key: 'id',
    fields: [
      { name: 'vrsta_kod', label: 'Vrsta', type: 'vrsta', required: true },
      { name: 'kategorija_kod', label: 'Spol/dob (prazno = sve)', type: 'kategorija' },
      { name: 'otvoreno_od', label: 'Otvoreno od (dd.mm.)', type: 'mmdd', required: true },
      { name: 'otvoreno_do', label: 'Otvoreno do (dd.mm.)', type: 'mmdd', required: true },
      { name: 'napomena', label: 'Napomena', type: 'text' },
      { name: 'izvor', label: 'Izvor propisa (npr. naziv odluke)', type: 'text' },
      { name: 'aktivno', label: 'Važi', type: 'bool' },
    ],
  },
  lovno_vrijeme: {
    naslov: 'Lovno vrijeme',
    key: 'id',
    fields: [
      { name: 'vrsta_kod', label: 'Vrsta (prazno = opšte pravilo)', type: 'vrsta' },
      { name: 'prije_izlaska_min', label: 'Minuta prije izlaska sunca', type: 'number', required: true, min: 0, max: 240 },
      { name: 'poslije_zalaska_min', label: 'Minuta poslije zalaska sunca', type: 'number', required: true, min: 0, max: 240 },
      { name: 'napomena', label: 'Napomena', type: 'text' },
      { name: 'izvor', label: 'Izvor propisa', type: 'text' },
      { name: 'aktivno', label: 'Važi', type: 'bool' },
    ],
  },
  vrste: {
    naslov: 'Vrste divljači',
    key: 'kod',
    fields: [
      { name: 'kod', label: 'Kod (mala slova, bez razmaka)', type: 'kod', required: true },
      { name: 'naziv', label: 'Naziv', type: 'text', required: true },
      { name: 'velicina', label: 'Divljač', type: 'select', options: [['krupna', 'Krupna'], ['sitna', 'Sitna']] },
      { name: 'tip', label: 'Tip', type: 'select', options: [['dlakava', 'Dlakava'], ['pernata', 'Pernata']] },
      { name: 'kategorije', label: 'Spol/dob, jedna po redu: kod:Naziv', type: 'kategorije' },
      { name: 'redoslijed', label: 'Redoslijed', type: 'number', min: 0, max: 9999 },
      { name: 'aktivno', label: 'Aktivna', type: 'bool' },
    ],
  },
  objekat_vrste: {
    naslov: 'Vrste lovačkih objekata',
    key: 'kod',
    fields: [
      { name: 'kod', label: 'Kod (mala slova, bez razmaka)', type: 'kod', required: true },
      { name: 'naziv', label: 'Naziv', type: 'text', required: true },
      { name: 'ikona', label: 'Ikona', type: 'select', options: IKONE.map((i) => [i, i]) },
      { name: 'redoslijed', label: 'Redoslijed', type: 'number', min: 0, max: 9999 },
      { name: 'aktivno', label: 'Aktivna', type: 'bool' },
    ],
  },
};

export function parseKategorije(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\n|,/)) {
    const t = line.trim();
    if (!t) continue;
    const [kod, ...rest] = t.split(':');
    const naziv = rest.join(':').trim();
    const k = kod.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!k || !naziv) return null;
    out.push({ kod: k, naziv });
  }
  return out;
}

export function formatKategorije(arr) {
  return (arr || []).map((k) => `${k.kod}:${k.naziv}`).join('\n');
}

// Pretvara vrijednosti iz forme u red za server; vraća { payload } ili { error }.
export function buildPayload(fields, values, isNew) {
  const payload = {};
  for (const f of fields) {
    if (f.type === 'kod' && !isNew) continue;
    const raw = values[f.name];
    const empty = raw == null || String(raw).trim() === '';
    if (f.type === 'bool') { payload[f.name] = Boolean(raw); continue; }
    if (empty) {
      if (f.required) return { error: `Polje "${f.label}" je obavezno` };
      payload[f.name] = f.type === 'kategorije' ? [] : null;
      continue;
    }
    const s = String(raw).trim();
    switch (f.type) {
      case 'mmdd': {
        const md = parseDayMonth(s);
        if (!md) return { error: `"${f.label}": upiši datum kao dd.mm. (npr. 1.5.)` };
        payload[f.name] = md;
        break;
      }
      case 'number': {
        const n = Number(s);
        if (!Number.isInteger(n) || (f.min != null && n < f.min) || (f.max != null && n > f.max)) {
          return { error: `"${f.label}": cijeli broj ${f.min ?? ''}–${f.max ?? ''}` };
        }
        payload[f.name] = n;
        break;
      }
      case 'kod':
        if (!/^[a-z0-9_]{2,40}$/.test(s)) return { error: 'Kod: mala slova, brojevi i _ (2–40 znakova)' };
        payload[f.name] = s;
        break;
      case 'kategorije': {
        const k = parseKategorije(s);
        if (!k) return { error: 'Spol/dob: svaki red kao kod:Naziv (npr. srndac:Srndać)' };
        payload[f.name] = k;
        break;
      }
      default:
        payload[f.name] = s;
    }
  }
  return { payload };
}

function displayValue(f, v, vrste) {
  if (f.type === 'bool') return v === false ? 'ne' : 'da';
  if (f.type === 'mmdd') return formatDayMonth(v);
  if (f.type === 'vrsta') return v ? lookupNaziv(vrste, v) : 'opšte';
  if (f.type === 'kategorije') return (v || []).map((k) => k.naziv).join(', ') || '—';
  return v ?? '—';
}

export function initPropisiAdmin() {
  const panel = $('propisi');
  const status = $('propisi-status');
  let tab = 'lovostaj';
  let rows = [];
  let users = new Map();
  let editingKey = null; // null = nov red

  const fetchUsers = async () => {
    try {
      const { data } = await getClient().from('korisnici').select('*');
      users = new Map((data || []).map((u) => [u.id, describeProfile(u).split(' · ')[0]]));
    } catch { /* imena su samo dodatak */ }
  };

  const fieldHtml = (f, value, vrste, isNew) => {
    const v = value ?? (f.type === 'bool' ? true : '');
    const id = `pf-${f.name}`;
    if (f.type === 'bool') return `<label class="red-check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''}> ${escapeHtml(f.label)}</label>`;
    if (f.type === 'vrsta') {
      const opts = vrste.map((x) => `<option value="${escapeHtml(x.kod)}" ${x.kod === v ? 'selected' : ''}>${escapeHtml(x.naziv)}</option>`).join('');
      return `<label>${escapeHtml(f.label)}<select id="${id}" name="${f.name}"><option value="">${f.required ? 'Izaberi…' : 'Opšte / sve'}</option>${opts}</select></label>`;
    }
    if (f.type === 'kategorija') return `<label>${escapeHtml(f.label)}<select id="${id}" name="${f.name}" data-value="${escapeHtml(v)}"></select></label>`;
    if (f.type === 'select') {
      const opts = f.options.map(([k, n]) => `<option value="${escapeHtml(k)}" ${k === v ? 'selected' : ''}>${escapeHtml(n)}</option>`).join('');
      return `<label>${escapeHtml(f.label)}<select id="${id}" name="${f.name}">${opts}</select></label>`;
    }
    if (f.type === 'kategorije') return `<label>${escapeHtml(f.label)}<textarea id="${id}" name="${f.name}" rows="3">${escapeHtml(formatKategorije(v))}</textarea></label>`;
    const shown = f.type === 'mmdd' && v ? formatDayMonth(v) : v;
    const extra = f.type === 'number' ? ' inputmode="numeric"' : '';
    const ro = f.type === 'kod' && !isNew ? ' readonly' : '';
    return `<label>${escapeHtml(f.label)}<input id="${id}" name="${f.name}" value="${escapeHtml(shown)}"${extra}${ro}></label>`;
  };

  const fillCategories = async () => {
    const sel = $('propisi-forma').querySelector('select[name="kategorija_kod"]');
    if (!sel) return;
    const vrsta = $('propisi-forma').querySelector('select[name="vrsta_kod"]').value;
    const v = (await getSpisakAll('vrste')).find((x) => x.kod === vrsta);
    const cur = sel.dataset.value;
    sel.innerHTML = `<option value="">Sve</option>${(v?.kategorije || [])
      .map((k) => `<option value="${escapeHtml(k.kod)}" ${k.kod === cur ? 'selected' : ''}>${escapeHtml(k.naziv)}</option>`).join('')}`;
  };

  const openForm = async (row) => {
    const cfg = EDITORI[tab];
    editingKey = row ? row[cfg.key] : null;
    const vrste = await getSpisakAll('vrste');
    const form = $('propisi-forma');
    form.innerHTML = `<h3>${row ? 'Izmjena' : 'Nov red'}</h3>${cfg.fields.map((f) => fieldHtml(f, row?.[f.name], vrste, !row)).join('')}
      <div class="red-dugmadi"><button type="submit" class="dugme glavno">Sačuvaj na server</button>
      <button type="button" class="dugme" id="btn-propisi-odustani">Odustani</button></div>`;
    form.hidden = false;
    await fillCategories();
    form.querySelector('select[name="vrsta_kod"]')?.addEventListener('change', () => {
      form.querySelector('select[name="kategorija_kod"]')?.setAttribute('data-value', '');
      fillCategories();
    });
    $('btn-propisi-odustani').addEventListener('click', () => { form.hidden = true; });
    form.scrollIntoView({ block: 'start' });
  };

  const render = async () => {
    const cfg = EDITORI[tab];
    $('propisi-tabovi').querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    $('propisi-naslov-tab').textContent = cfg.naslov;
    $('propisi-forma').hidden = true;
    status.textContent = 'Učitavam…';
    try {
      rows = await refreshSpisak(tab);
      status.textContent = '';
    } catch (err) {
      rows = await getSpisakAll(tab);
      status.textContent = `Nema veze sa serverom — prikazan je keš (${err.message})`;
    }
    const vrste = await getSpisakAll('vrste');
    $('propisi-spisak').innerHTML = rows.map((r) => `
      <li class="trag-red" data-id="${escapeHtml(r[cfg.key])}" data-aktivno="${r.aktivno !== false}">
        <div class="trag-naslov">${cfg.fields.filter((f) => f.type !== 'kod').slice(0, 5)
    .map((f) => `<span><span class="sitno">${escapeHtml(f.label)}:</span> ${escapeHtml(String(displayValue(f, r[f.name], vrste)))}</span>`).join('')}
        <span class="sitno">Izmijenio: ${escapeHtml(users.get(r.promijenio) || 'nepoznato')}, ${r.promijenjeno ? escapeHtml(new Date(r.promijenjeno).toLocaleString('bs-BA')) : '—'}</span></div>
        <div class="red-dugmadi"><button type="button" class="dugme" data-akcija="uredi">Uredi</button></div>
      </li>`).join('') || '<li class="sitno">Nema unesenih redova.</li>';
  };

  $('propisi-forma').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cfg = EDITORI[tab];
    const form = e.target;
    const values = {};
    for (const f of cfg.fields) {
      const el = form.elements[f.name];
      values[f.name] = f.type === 'bool' ? el.checked : el.value;
    }
    const { payload, error } = buildPayload(cfg.fields, values, editingKey == null);
    if (error) { status.textContent = error; return; }
    status.textContent = 'Šaljem…';
    const sb = getClient();
    const q = editingKey == null ? sb.from(tab).insert(payload) : sb.from(tab).update(payload).eq(cfg.key, editingKey);
    const { error: err } = await q;
    if (err) { status.textContent = `Server odbio: ${err.message}`; return; }
    toast('Sačuvano na serveru');
    await render();
    document.dispatchEvent(new CustomEvent('spiskovi:promjena', { detail: { spisak: tab } }));
  });

  $('propisi-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="uredi"]');
    if (!b) return;
    const cfg = EDITORI[tab];
    const row = rows.find((r) => String(r[cfg.key]) === b.closest('[data-id]').dataset.id);
    if (row) openForm(row);
  });
  $('btn-propisi-dodaj').addEventListener('click', () => openForm(null));
  $('propisi-tabovi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    render();
  });
  $('btn-propisi').addEventListener('click', async () => {
    $('postavke').hidden = true;
    panel.hidden = false;
    await fetchUsers();
    await render();
  });
  $('btn-propisi-zatvori').addEventListener('click', () => { panel.hidden = true; });
  registerBackHandler(() => {
    if (panel.hidden) return false;
    panel.hidden = true;
    return true;
  });
}
