import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  labelScale, labelFontPx, placeLabels, LABEL_MIN_PX,
  TACKA_VRSTE, validateTacka, newTacka, editTacka, mergeTacke, visibleTacke, nextTackeCursor, missingTable, vrstaNaziv,
} from '../../static/js/teren-tacke.js';

const T0 = Date.parse('2026-11-25T10:00:00Z');
const base = { id: 'a', naziv: 'Pjanić', vrsta: 'naselje', lat: 44.88, lon: 16.15 };

test('validacija: naziv, vrsta, pozicija', () => {
  assert.equal(validateTacka(base), null);
  assert.match(validateTacka({ ...base, naziv: '   ' }), /naziv/i);
  assert.match(validateTacka({ ...base, naziv: 'x'.repeat(61) }), /predug/);
  assert.match(validateTacka({ ...base, vrsta: 'grad' }), /vrstu/);
  assert.match(validateTacka({ ...base, lat: NaN }), /pozicij/i);
});

test('nova tačka čeka slanje, naziv se trimuje; izmjena je ponovo u redu slanja', () => {
  const t = newTacka({ ...base, naziv: '  Pjanić  ', autorId: 'u1' }, T0);
  assert.equal(t.naziv, 'Pjanić');
  assert.equal(t.sinhronizovano, false);
  const e = editTacka({ ...t, sinhronizovano: true }, { naziv: 'Pjanić gaj', aktivno: false }, T0 + 1000);
  assert.equal(e.naziv, 'Pjanić gaj');
  assert.equal(e.aktivno, false);
  assert.equal(e.sinhronizovano, false);
  assert.ok(Date.parse(e.updated_at) > Date.parse(t.updated_at));
});

test('spajanje: neposlana lokalna pobjeđuje, inače novija verzija, nove sa servera ulaze', () => {
  const local = [{ ...base, updated_at: '2026-11-25T10:00:00Z', sinhronizovano: false, naziv: 'Lokalno' }, { ...base, id: 'b', naziv: 'B', updated_at: '2026-11-25T11:00:00Z', sinhronizovano: true }];
  const remote = [
    { ...base, naziv: 'Server', updated_at: '2026-11-25T12:00:00Z' },
    { ...base, id: 'b', naziv: 'B staro', updated_at: '2026-11-25T09:00:00Z' },
    { ...base, id: 'c', naziv: 'C', updated_at: '2026-11-25T09:00:00Z' },
  ];
  const m = Object.fromEntries(mergeTacke(local, remote).map((t) => [t.id, t]));
  assert.equal(m.a.naziv, 'Lokalno');
  assert.equal(m.b.naziv, 'B', 'starija verzija sa servera ne prepisuje novu');
  assert.equal(m.c.sinhronizovano, true);
});

test('vidljivost po zoomu i skinute se ne crtaju; važnija mjesta prva', () => {
  const rows = [
    { ...base, id: '1', naziv: 'Ostalo', vrsta: 'ostalo' },
    { ...base, id: '2', naziv: 'Selo', vrsta: 'naselje' },
    { ...base, id: '3', naziv: 'Vrh', vrsta: 'vrh' },
    { ...base, id: '4', naziv: 'Skinuto', vrsta: 'naselje', aktivno: false },
  ];
  assert.deepEqual(visibleTacke(rows, 12).map((t) => t.id), ['2']);
  assert.deepEqual(visibleTacke(rows, 13).map((t) => t.id), ['2', '3']);
  assert.deepEqual(visibleTacke(rows, 16).map((t) => t.id), ['2', '3', '1']);
  assert.deepEqual(visibleTacke(rows, 11), []);
});

test('kursor ide po updated_at sa preklopom i nikad unazad', () => {
  const c1 = nextTackeCursor([{ updated_at: '2026-11-25T10:00:00Z' }, { updated_at: '2026-11-25T10:05:00Z' }]);
  assert.equal(c1, '2026-11-25T10:04:00.000Z');
  assert.equal(nextTackeCursor([{ updated_at: '2026-11-25T09:00:00Z' }], c1), c1);
  assert.equal(nextTackeCursor([], c1), c1);
  assert.equal(nextTackeCursor([], null), null);
});

test('tabela koje nema na serveru se prepoznaje; druge greške ne', () => {
  assert.ok(missingTable({ code: 'PGRST205' }));
  assert.ok(missingTable({ code: '42P01' }));
  assert.ok(!missingTable({ code: '42501', message: 'row-level security' }));
  assert.ok(!missingTable(null));
});

test('sve vrste imaju naziv i zoom u rasponu Terena (12–16)', () => {
  for (const v of TACKA_VRSTE) { assert.ok(v.naziv); assert.ok(v.minZoom >= 12 && v.minZoom <= 16); }
  assert.equal(vrstaNaziv('vrh'), 'Vrh / brdo');
  assert.equal(vrstaNaziv('nešto'), 'Ostalo');
});

test('veličina oznake: 60 % na radnom zoomu 14, srazmjerno manja kad je karta manje uvećana, uvećava se sa zoomom', () => {
  assert.equal(labelScale(14), 0.6);
  assert.ok(labelScale(12) < labelScale(13) && labelScale(13) < labelScale(14) && labelScale(14) < labelScale(15) && labelScale(15) < labelScale(16));
  assert.ok(labelScale(16) <= 1 && labelScale(0) >= 0.35);
  // ranije je slovo bilo 13 px (naselje 15 px): sada 40 % manje
  assert.ok(Math.abs(labelFontPx('vrh', 14) - 13 * 0.6) < 1e-9 || labelFontPx('vrh', 14) === LABEL_MIN_PX);
  assert.ok(labelFontPx('naselje', 14) <= 15 * 0.6 + 1e-9);
  // nikad nečitljivo sitno
  for (let z = 8; z <= 16; z++) assert.ok(labelFontPx('ostalo', z) >= LABEL_MIN_PX);
});

test('preklapanje: važnija oznaka ostaje, ona koja bi je prekrila se ne crta; udaljene se crtaju sve', () => {
  const t = (id, naziv, vrsta) => ({ id, naziv, vrsta });
  const items = [t('a', 'Pjanić', 'naselje'), t('b', 'Veliki vrh', 'vrh'), t('c', 'Izvor', 'voda')];
  const blizu = { a: { x: 100, y: 100 }, b: { x: 110, y: 102 }, c: { x: 400, y: 400 } };
  const out = placeLabels(items, (i) => blizu[i.id], 14);
  assert.deepEqual(out.map((x) => x.id), ['a', 'c']);
  const daleko = { a: { x: 100, y: 100 }, b: { x: 100, y: 200 }, c: { x: 300, y: 100 } };
  assert.equal(placeLabels(items, (i) => daleko[i.id], 14).length, 3);
  // manja oznaka (dalji zoom) = manje preklapanja
  const gust = { a: { x: 100, y: 100 }, b: { x: 140, y: 100 }, c: { x: 400, y: 400 } };
  assert.ok(placeLabels(items, (i) => gust[i.id], 12).length >= placeLabels(items, (i) => gust[i.id], 16).length);
});
