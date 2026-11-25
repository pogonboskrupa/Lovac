import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveOverview, shotsOnMap, shotLine, huntMovement, formatKmM, formatMinutes } from '../../static/js/arhiva.js';

test('pregled arhive broji lovove, ulov i slike iz detalja na telefonu', () => {
  const hunts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const d = { a: { odstrel: [1, 2], slike: [1] }, b: { odstrel: [], slike: [1, 2, 3] } };
  assert.deepEqual(archiveOverview(hunts, (id) => d[id]), { lovova: 3, komada: 2, slika: 4 });
});

test('pogoci: odstrel sa tačkom ide na kartu poredan po vremenu, bez tačke se samo broji', () => {
  const od = [
    { id: 'b', vrsta: 'zec', korisnik_id: 'u2', vrijeme: '2026-12-05T10:30:00Z', lat: 44.9, lon: 16.2 },
    { id: 'a', vrsta: 'divlja_svinja', korisnik_id: 'u1', vrijeme: '2026-12-05T09:10:00Z', tezina: 85.5, stan_broj: 3, lat: 44.88, lon: 16.15 },
    { id: 'c', vrsta: 'lisica', korisnik_id: 'u1', vrijeme: '2026-12-05T11:00:00Z', lat: null, lon: null },
    { id: 'd', vrsta: 'lisica', korisnik_id: 'u1', vrijeme: '2026-12-05T11:05:00Z' },
  ];
  const r = shotsOnMap(od, (id) => `Lovac ${id}`, (k) => `Vrsta ${k}`);
  assert.deepEqual(r.sa.map((s) => s.id), ['a', 'b']);
  assert.equal(r.bez, 2);
  assert.equal(r.sa[0].naziv, 'Vrsta divlja_svinja');
  assert.equal(r.sa[0].stan, 3);
  assert.deepEqual(shotsOnMap([]), { sa: [], bez: 0 });
});

test('opis pogotka: vrsta, lovac, vrijeme, težina i stan; bez praznih dijelova', () => {
  const t = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const s = { naziv: 'Divlja svinja', lovac: 'Lovro Lovac', vrijeme: '2026-12-05T09:10:00Z', tezina: 85.5, stan: 3 };
  assert.equal(shotLine(s), `Divlja svinja · Lovro Lovac · ${t(s.vrijeme)} · 85,5 kg · stan 3`);
  assert.equal(shotLine({ naziv: 'Zec', lovac: 'Luka' }), 'Zec · Luka');
});

test('kretanje lovaca: pređeno i trajanje po lovcu iz traga, najduži prvi; tačke bez koordinata se preskaču', () => {
  const rows = [
    { korisnik_id: 'a', lat: 44.0, lon: 16.0, t: '2026-12-05T08:00:00Z' },
    { korisnik_id: 'a', lat: 44.009, lon: 16.0, t: '2026-12-05T09:30:00Z' },
    { korisnik_id: 'b', lat: 44.0, lon: 16.0, t: '2026-12-05T08:00:00Z' },
    { korisnik_id: 'b', lat: 44.001, lon: 16.0, t: '2026-12-05T08:10:00Z' },
    { korisnik_id: 'b', lat: null, lon: 16.0, t: '2026-12-05T08:20:00Z' },
  ];
  const m = huntMovement(rows, (id) => id.toUpperCase());
  assert.deepEqual(m.map((x) => x.id), ['a', 'b']);
  assert.equal(m[0].ime, 'A');
  assert.ok(m[0].metara > 990 && m[0].metara < 1010, String(m[0].metara));
  assert.equal(m[0].minuta, 90);
  assert.equal(m[1].tacaka, 2);
  assert.deepEqual(huntMovement([]), []);
});

test('formati: metri ispod 1 km, kilometri sa zarezom, minute i sati', () => {
  assert.equal(formatKmM(640), '640 m');
  assert.equal(formatKmM(2345), '2,35 km');
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(135), '2 h 15 min');
});
