// Rejting lovaca po više kriterija (čista logika). Podatke po lovcu daje server (rejting_podaci), a težine kriterija
// unosi administrator (rejting_kriteriji). Težište je na lovačkoj disciplini (odaziv, tačnost prijave, redovnost);
// broj komada ima gornju granicu da se ne nagrađuje pretjeran odstrel.

// Zadane težine, iste kao u migraciji 023: koriste se samo dok težine sa servera nisu stigle.
export const ZADANI_KRITERIJI = [
  { kod: 'odaziv', naziv: 'Odaziv na lovove', opis: 'Udio lovova sekcije na kojima je lovac bio na spisku učesnika', tezina: 40, granica: null, aktivno: true, redoslijed: 10 },
  { kod: 'tacnost', naziv: 'Tačnost prijave ulova', opis: 'Udio ulova prijavljenih društvu u roku od 24 sata', tezina: 25, granica: null, aktivno: true, redoslijed: 20 },
  { kod: 'redovnost', naziv: 'Redovnost kroz sezonu', opis: 'U koliko mjeseci sa lovovima je lovac učestvovao', tezina: 15, granica: null, aktivno: true, redoslijed: 30 },
  { kod: 'raznovrsnost', naziv: 'Raznovrsnost prijavljenog ulova', opis: 'Broj različitih vrsta (do gornje granice)', tezina: 10, granica: 4, aktivno: true, redoslijed: 40 },
  { kod: 'ulov', naziv: 'Prijavljeni ulov', opis: 'Broj prijavljenih komada, sa gornjom granicom da se ne nagrađuje pretjeran odstrel', tezina: 10, granica: 10, aktivno: true, redoslijed: 50 },
];

const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : null);

// Ocjena jednog kriterija 0–100; null kad nema podataka (kriterij se tada izostavlja iz računa).
export function criterionScore(kod, row, kriterij = {}) {
  switch (kod) {
    case 'odaziv': return pct(row.lovova_ucesce, row.lovova_odrzano);
    case 'tacnost': return pct(row.prijava_u_roku, row.prijava_ukupno);
    case 'redovnost': return pct(row.mjeseci_ucesce, row.mjeseci_lovova);
    case 'raznovrsnost': return pct(Math.min(row.vrsta, kriterij.granica || 4), kriterij.granica || 4) ?? 0;
    case 'ulov': return pct(Math.min(row.komada, kriterij.granica || 10), kriterij.granica || 10) ?? 0;
    default: return null;
  }
}

// Ocjena lovca: ponderisani prosjek kriterija koji imaju podatke. Bez održanih lovova nema ocjene (nije rangiran).
export function rateMember(row, kriteriji = ZADANI_KRITERIJI) {
  if (!row || !(row.lovova_odrzano > 0)) return { rangiran: false, ukupno: null, dijelovi: [] };
  const dijelovi = kriteriji.filter((k) => k.aktivno !== false && k.tezina > 0).map((k) => ({
    kod: k.kod, naziv: k.naziv, tezina: k.tezina, ocjena: criterionScore(k.kod, row, k),
  }));
  const used = dijelovi.filter((d) => d.ocjena != null);
  const sum = used.reduce((s, d) => s + d.tezina, 0);
  if (!sum) return { rangiran: false, ukupno: null, dijelovi };
  const ukupno = used.reduce((s, d) => s + d.tezina * d.ocjena, 0) / sum;
  return { rangiran: true, ukupno: Math.round(ukupno * 10) / 10, dijelovi };
}

// Ljestvica: redovi {korisnik_id, sekcija_id, ...}; nerangirani idu na kraj. Isti rezultat = isto mjesto.
export function rankMembers(rows, kriteriji = ZADANI_KRITERIJI, nameOf = (id) => id) {
  const rated = rows.map((r) => ({ ...r, ime: nameOf(r.korisnik_id), ocjena: rateMember(r, kriteriji) }));
  const ranked = rated.filter((r) => r.ocjena.rangiran)
    .sort((a, b) => b.ocjena.ukupno - a.ocjena.ukupno || b.lovova_ucesce - a.lovova_ucesce || String(a.ime).localeCompare(String(b.ime), 'bs'));
  ranked.forEach((r, i) => {
    r.mjesto = i > 0 && ranked[i - 1].ocjena.ukupno === r.ocjena.ukupno ? ranked[i - 1].mjesto : i + 1;
  });
  const rest = rated.filter((r) => !r.ocjena.rangiran).sort((a, b) => String(a.ime).localeCompare(String(b.ime), 'bs')).map((r) => ({ ...r, mjesto: null }));
  return [...ranked, ...rest];
}

// Provjera težina prije snimanja (administrator): cijeli brojevi 0–100, bar jedan aktivan > 0.
export function validateWeights(list) {
  if (list.some((k) => !Number.isInteger(k.tezina) || k.tezina < 0 || k.tezina > 100)) return 'Težine su cijeli brojevi od 0 do 100';
  if (!list.some((k) => k.aktivno !== false && k.tezina > 0)) return 'Bar jedan kriterij mora imati težinu veću od 0';
  if (list.some((k) => k.granica != null && !(Number(k.granica) > 0))) return 'Gornja granica mora biti veća od 0';
  return null;
}

export function mergeCriteria(server) {
  if (!server?.length) return ZADANI_KRITERIJI;
  return [...server].sort((a, b) => (a.redoslijed ?? 0) - (b.redoslijed ?? 0));
}
