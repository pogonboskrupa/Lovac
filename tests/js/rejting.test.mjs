import test from 'node:test';
import assert from 'node:assert/strict';
import { ZADANI_KRITERIJI, criterionScore, rateMember, rankMembers, validateWeights, mergeCriteria } from '../../static/js/rejting.js';
import { scopeOptions, periodDates, buildStats, ratingYears } from '../../static/js/statistika-opsega.js';

const row = (o = {}) => ({ korisnik_id: 'u', sekcija_id: 'S1', revir_id: 'R1', lovova_odrzano: 4, lovova_ucesce: 4, mjeseci_lovova: 4, mjeseci_ucesce: 4,
  komada: 0, kg: 0, vrsta: 0, prijava_ukupno: 0, prijava_u_roku: 0, ...o });

test('kriteriji: odaziv, tačnost, redovnost iz udjela; ulov i raznovrsnost sa gornjom granicom', () => {
  assert.equal(criterionScore('odaziv', row({ lovova_ucesce: 3 })), 75);
  assert.equal(criterionScore('odaziv', row({ lovova_odrzano: 0 })), null);
  assert.equal(criterionScore('tacnost', row({ prijava_ukupno: 4, prijava_u_roku: 1 })), 25);
  assert.equal(criterionScore('tacnost', row()), null, 'bez prijava nema ocjene tačnosti');
  assert.equal(criterionScore('redovnost', row({ mjeseci_ucesce: 2 })), 50);
  assert.equal(criterionScore('ulov', row({ komada: 5 }), { granica: 10 }), 50);
  assert.equal(criterionScore('ulov', row({ komada: 50 }), { granica: 10 }), 100, 'gornja granica: pretjeran odstrel se ne nagrađuje');
  assert.equal(criterionScore('ulov', row({ komada: 0 }), { granica: 10 }), 0);
  assert.equal(criterionScore('raznovrsnost', row({ vrsta: 2 }), { granica: 4 }), 50);
});

test('rateMember: ponderisani prosjek, kriteriji bez podataka se izostavljaju, bez lovova nema ocjene', () => {
  // savršen odaziv i redovnost, bez prijava: tačnost se izostavlja; ulov i raznovrsnost = 0
  const r = rateMember(row());
  // težine: odaziv 40*100 + redovnost 15*100 + raznovrsnost 10*0 + ulov 10*0 = 5500 / 75
  assert.equal(r.rangiran, true);
  assert.equal(r.ukupno, 73.3);
  assert.equal(r.dijelovi.find((d) => d.kod === 'tacnost').ocjena, null);
  assert.equal(rateMember(row({ lovova_odrzano: 0 })).rangiran, false);
  // lovac koji bira ulov: više komada ne može preći gornju granicu
  const lot = rateMember(row({ komada: 500, vrsta: 9, prijava_ukupno: 500, prijava_u_roku: 500 }));
  assert.equal(lot.ukupno, 100);
  // težina 0 isključuje kriterij
  const k = ZADANI_KRITERIJI.map((x) => (x.kod === 'odaziv' ? { ...x, tezina: 0 } : x));
  assert.ok(rateMember(row({ lovova_ucesce: 0 }), k).ukupno > rateMember(row({ lovova_ucesce: 0 })).ukupno);
});

test('rankMembers: sortirano, isti rezultat = isto mjesto, nerangirani na kraju', () => {
  const rows = [
    row({ korisnik_id: 'b', lovova_ucesce: 2 }), row({ korisnik_id: 'a', lovova_ucesce: 4 }),
    row({ korisnik_id: 'c', lovova_ucesce: 4 }), row({ korisnik_id: 'd', lovova_odrzano: 0 }),
  ];
  const r = rankMembers(rows, ZADANI_KRITERIJI, (id) => id.toUpperCase());
  assert.deepEqual(r.map((x) => [x.korisnik_id, x.mjesto]), [['a', 1], ['c', 1], ['b', 3], ['d', null]]);
});

test('validateWeights i mergeCriteria', () => {
  assert.equal(validateWeights(ZADANI_KRITERIJI), null);
  assert.match(validateWeights([{ kod: 'odaziv', tezina: 101 }]), /0 do 100/);
  assert.match(validateWeights([{ kod: 'odaziv', tezina: 0 }]), /Bar jedan/);
  assert.match(validateWeights([{ kod: 'ulov', tezina: 5, granica: 0 }]), /granica/);
  assert.equal(mergeCriteria([]), ZADANI_KRITERIJI);
  assert.deepEqual(mergeCriteria([{ kod: 'b', redoslijed: 2 }, { kod: 'a', redoslijed: 1 }]).map((k) => k.kod), ['a', 'b']);
});

const ctx = {
  reviri: [{ id: 'R1', naziv: 'Krupa' }, { id: 'R2', naziv: 'Otoka' }],
  sekcije: [{ id: 'S1', revir_id: 'R1', naziv: 'Krupa 1', grupovodja_id: 'gv', aktivno: true }, { id: 'S2', revir_id: 'R2', naziv: 'Otoka 1', aktivno: true, lovocuvar_id: null }],
  clanovi: [{ sekcija_id: 'S1', korisnik_id: 'l1', status: 'odobren' }, { sekcija_id: 'S2', korisnik_id: 'l2', status: 'ceka' }],
  lovocuvari: [{ revir_id: 'R2', korisnik_id: 'lc' }],
};

test('scopeOptions: admin sve, lovočuvar revir (i sekcija ako je i član), grupovođa/lovac svoju sekciju', () => {
  const adm = scopeOptions({ id: 'a', odobren: true, is_admin: true }, ctx).map((o) => o.kljuc);
  assert.deepEqual(adm, ['drustvo', 'revir:R1', 'revir:R2', 'sekcija:S1', 'sekcija:S2']);
  assert.deepEqual(scopeOptions({ id: 'lc', odobren: true }, ctx).map((o) => o.kljuc), ['revir:R2', 'sekcija:S2']);
  assert.deepEqual(scopeOptions({ id: 'gv', odobren: true }, ctx).map((o) => o.kljuc), ['sekcija:S1']);
  assert.deepEqual(scopeOptions({ id: 'l1', odobren: true }, ctx).map((o) => o.kljuc), ['sekcija:S1']);
  assert.deepEqual(scopeOptions({ id: 'l2', odobren: true }, ctx), [], 'zahtjev na čekanju nema opseg');
  assert.deepEqual(scopeOptions({ id: 'x', odobren: false, is_admin: true }, ctx), []);
});

test('periodDates i buildStats: zbirke po sekcijama, revirima, vrstama i mjesecima', () => {
  assert.deepEqual(periodDates(2026), { od: '2026-01-01', do: '2026-12-31' });
  assert.deepEqual(periodDates('sve'), { od: '2026-01-01', do: null }, 'evidencija tek od 2026.');
  assert.deepEqual(periodDates(2024), { od: '2026-01-01', do: '2026-12-31' }, 'ranija godina se ne računa');
  assert.deepEqual(ratingYears(new Date('2028-05-01')), ['2028', '2027', '2026']);
  assert.deepEqual(ratingYears(new Date('2025-05-01')), ['2026']);
  const lovovi = [
    { revir_id: 'R1', sekcija_id: 'S1', lovova: 2, ucesca: 3, clanova: 2 },
    { revir_id: 'R1', sekcija_id: 'S3', lovova: 1, ucesca: 1, clanova: 1 },
    { revir_id: 'R2', sekcija_id: 'S2', lovova: 0, ucesca: 0, clanova: 1 },
  ];
  const ulov = [
    { revir_id: 'R1', sekcija_id: 'S1', vrsta: 'zec', mjesec: '2026-01-01', komada: 1, kg: 3 },
    { revir_id: 'R1', sekcija_id: 'S1', vrsta: 'srna', mjesec: '2026-03-01', komada: 2, kg: 40 },
    { revir_id: 'R2', sekcija_id: 'S2', vrsta: 'srna', mjesec: '2026-03-01', komada: 1, kg: 22.5 },
  ];
  const s = buildStats({ ulov, lovovi });
  assert.deepEqual(s.ukupno, { lovova: 3, ucesca: 4, clanova: 4, odaziv: 80, komada: 4, kg: 65.5, vrsta: 2 });
  assert.equal(s.sekcije.find((x) => x.sekcija_id === 'S1').odaziv, 75); // 3 / (2*2)
  assert.equal(s.sekcije.find((x) => x.sekcija_id === 'S2').odaziv, null, 'bez lovova nema odaziva');
  assert.deepEqual(s.reviri.map((r) => [r.revir_id, r.sekcija, r.komada]), [['R1', 2, 3], ['R2', 1, 1]]);
  assert.deepEqual(s.vrste.map((v) => [v.vrsta, v.komada, v.kg]), [['srna', 3, 62.5], ['zec', 1, 3]]);
  assert.deepEqual(s.mjeseci.slice(0, 4), [1, 0, 3, 0]);
});
