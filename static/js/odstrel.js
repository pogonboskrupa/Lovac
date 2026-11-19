// Čista logika evidencije odstrela: izvoz CSV (Excel) i izvještaj za PDF, zbir, upozorenja.
// Evidencija NE zamjenjuje službeni lovački dnevnik.

import { seasonStatus, formatDayMonth } from './propisi.js';

export const NAPOMENA_DNEVNIK = 'Ova evidencija ne zamjenjuje službeni lovački dnevnik.';

export function formatDecimalBs(n) {
  return n == null || !Number.isFinite(Number(n)) ? '' : String(Number(n)).replace('.', ',');
}

export function parseDecimalBs(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function csvCell(v, type) {
  let s = type === 'decimal' ? formatDecimalBs(v) : String(v ?? '');
  // Excel izvršava ćeliju koja počinje sa = + - @ kao formulu.
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Excel (bs/hr lokalizacija): ';' razdvaja kolone, decimalni zarez, BOM za UTF-8.
export function toCsv(rows, columns) {
  const head = columns.map((c) => csvCell(c.label)).join(';');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c.key], c.type)).join(';'));
  return `﻿${[head, ...body].join('\r\n')}\r\n`;
}

const esc = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

export function reportHtml({ naslov, podnaslov = '', redovi, kolone, zbir = [], napomena = NAPOMENA_DNEVNIK }) {
  const th = kolone.map((k) => `<th>${esc(k.label)}</th>`).join('');
  const tr = redovi.map((r) => `<tr>${kolone.map((k) => `<td>${esc(k.type === 'decimal' ? formatDecimalBs(r[k.key]) : r[k.key])}</td>`).join('')}</tr>`).join('');
  const sum = zbir.length ? `<h2>Zbir</h2><ul>${zbir.map((z) => `<li>${esc(z)}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="bs"><head><meta charset="utf-8"><title>${esc(naslov)}</title>
<style>body{font:12px/1.4 sans-serif;margin:16mm}h1{font-size:18px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #444;padding:4px;text-align:left;vertical-align:top}th{background:#eee}.nap{margin-top:12px;font-style:italic}</style>
</head><body><h1>${esc(naslov)}</h1><p>${esc(podnaslov)}</p><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>${sum}
<p class="nap">${esc(napomena)}</p></body></html>`;
}

export function summarizeHarvest(list) {
  const m = new Map();
  for (const o of list) {
    const s = m.get(o.vrsta) || { vrsta: o.vrsta, komada: 0, tezina: 0 };
    s.komada += 1;
    s.tezina += Number(o.tezina) || 0;
    m.set(o.vrsta, s);
  }
  return [...m.values()].sort((a, b) => b.komada - a.komada);
}

// Upozorenja prije čuvanja; pravila dolaze iz admin spiskova.
export function harvestWarnings(rec, lovostajRows, window) {
  const out = [];
  const st = seasonStatus(lovostajRows, rec.vrsta, rec.kategorija === 'nepoznato' ? null : rec.kategorija, new Date(rec.vrijeme));
  if (st.stanje === 'lovostaj') out.push(`Vrsta je u lovostaju${st.od ? ` (otvara se ${formatDayMonth(st.od)})` : ''}.`);
  if (window && (rec.vrijeme < window.od || rec.vrijeme > window.do)) out.push('Vrijeme odstrela je van lovnog vremena za taj dan.');
  return out;
}
