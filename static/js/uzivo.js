// Zajednički lov uživo: pozicije učesnika, SOS (server + SMS), odstrel u lovu, zbirni izvještaj.
// Sve samo dok lov traje i samo učesnicima (provodi server). Bez push servisa: obavijest stiže
// samo dok je aplikacija otvorena — to se lovcu ne obećava drugačije.

import { formatWgs84, formatGk6 } from './geo.js';
import { formatDecimalBs, summarizeHarvest } from './odstrel.js';

const ULOGE = { strijelac: 'Strijelac', pogonic: 'Pogonič', vodja: 'Vođa lova' };

export function sosText(user, fix, lovNaziv) {
  const who = `${user?.ime || ''} ${user?.prezime || ''}`.trim();
  if (!fix) return `SOS! ${who} treba pomoć (lov: ${lovNaziv}). GPS pozicija nepoznata — nazovi.`;
  const ll = `${fix.lat.toFixed(6)},${fix.lon.toFixed(6)}`;
  return `SOS! ${who} treba pomoć (lov: ${lovNaziv}). WGS84 ${formatWgs84(fix.lat, fix.lon)}`
    + `${Number.isFinite(fix.acc) ? ` (±${Math.round(fix.acc)} m)` : ''} | GK6 ${formatGk6(fix.lat, fix.lon)} | https://maps.google.com/?q=${ll}`;
}

export function smsNumbers(telefoni, myId) {
  const out = [];
  for (const t of telefoni || []) {
    if (t.korisnik_id === myId) continue;
    const n = String(t.telefon || '').replace(/[^0-9+]/g, '');
    if (n.length >= 6 && !out.includes(n)) out.push(n);
  }
  return out;
}

export function newSosSince(rows, myId, seen) {
  return rows.filter((r) => r.korisnik_id !== myId && !seen.has(r.id))
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

export function huntReportData(data, odstrel, nameOf, vrstaNaziv) {
  const rows = odstrel.slice().sort((a, b) => String(a.vrijeme).localeCompare(String(b.vrijeme))).map((o) => ({
    vrijeme: new Date(o.vrijeme).toLocaleString('bs-BA'),
    vrsta: vrstaNaziv(o.vrsta),
    kategorija: o.kategorija || '',
    tezina: o.tezina,
    stan: o.stan_broj ?? '',
    lovac: nameOf(o.korisnik_id) || '',
  }));
  const zbir = summarizeHarvest(odstrel.map((o) => ({ vrsta: o.vrsta, tezina: o.tezina })))
    .map((s) => `${vrstaNaziv(s.vrsta)}: ${s.komada} kom., ${formatDecimalBs(Math.round(s.tezina * 10) / 10)} kg`);
  const ucesnici = data.ucesnici.map((u) => {
    const s = data.stanovi.find((x) => x.korisnik_id === u.korisnik_id);
    return `${nameOf(u.korisnik_id)} — ${ULOGE[u.uloga] || u.uloga}${s ? `, stan ${s.broj}` : ''}`;
  });
  return { redovi: rows, zbir, ucesnici };
}
