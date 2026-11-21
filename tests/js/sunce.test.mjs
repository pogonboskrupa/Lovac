import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sunTimes, moonAge, moonPhaseName, moonIllumination } from '../../static/js/sunce.js';
import {
  pickRule, huntingWindow, huntingStatus, formatCountdown, seasonStatus, parseDayMonth, formatDayMonth, inPeriod,
} from '../../static/js/propisi.js';

// Referenca: Python astral 3 (Observer 44.88N 16.15E), vremena u UTC.
const REF = [
  ['2026-11-19', '05:58:06', '15:22:57', '05:25:26', '15:55:36'],
  ['2026-06-21', '03:09:25', '18:45:00', '02:31:23', '19:23:02'],
  ['2026-03-29', '04:42:16', '17:18:49', '04:12:16', '17:48:55'],
  ['2026-12-21', '06:30:18', '15:16:35', '05:55:52', '15:51:01'],
];
const utc = (d, t) => Date.parse(`${d}T${t}Z`);
const MIN = 60000;

test('izlazak, zalazak i građanski sumrak: unutar 1 min od astral-a', () => {
  for (const [d, rise, set, dawn, dusk] of REF) {
    const s = sunTimes(Date.parse(`${d}T12:00:00Z`), 44.88, 16.15);
    for (const [name, got, want] of [['izlazak', s.izlazak, rise], ['zalazak', s.zalazak, set], ['svitanje', s.svitanje, dawn], ['suton', s.suton, dusk]]) {
      const diff = Math.abs(got - utc(d, want)) / MIN;
      assert.ok(diff < 1, `${d} ${name}: razlika ${diff.toFixed(1)} min`);
    }
  }
});

test('starost i faza mjeseca (astral: 19.11.2026 = 8,82 dana)', () => {
  const age = moonAge(Date.parse('2026-11-19T00:00:00Z'));
  assert.ok(Math.abs(age - 8.82) < 0.7, String(age));
  assert.equal(moonPhaseName(0.5), 'Mlađak');
  assert.equal(moonPhaseName(7.4), 'Prva četvrt');
  assert.equal(moonPhaseName(14.8), 'Uštap (pun mjesec)');
  assert.equal(moonPhaseName(22.1), 'Zadnja četvrt');
  assert.ok(moonIllumination(14.77) > 0.99);
  assert.ok(moonIllumination(0) < 0.01);
});

const RULES = [
  { id: 'opste', vrsta_kod: null, prije_izlaska_min: 60, poslije_zalaska_min: 60, aktivno: true },
  { id: 'svinja', vrsta_kod: 'divlja_svinja', prije_izlaska_min: 120, poslije_zalaska_min: 120, aktivno: true },
  { id: 'staro', vrsta_kod: 'srna', prije_izlaska_min: 5, poslije_zalaska_min: 5, aktivno: false },
];

test('pravilo lovnog vremena: posebno za vrstu, inače opšte; sklonjeno se ne koristi', () => {
  assert.equal(pickRule(RULES, 'divlja_svinja').id, 'svinja');
  assert.equal(pickRule(RULES, 'srna').id, 'opste');
  assert.equal(pickRule(RULES, null).id, 'opste');
  assert.equal(pickRule([], 'srna'), null, 'bez admin pravila nema izmišljenog lovnog vremena');
});

test('lovno vrijeme i odbrojavanje', () => {
  const sun = { izlazak: utc('2026-11-19', '06:00:00'), zalazak: utc('2026-11-19', '15:30:00') };
  const w = huntingWindow(sun, RULES[0]);
  assert.equal(w.od, utc('2026-11-19', '05:00:00'));
  assert.equal(w.do, utc('2026-11-19', '16:30:00'));
  assert.deepEqual(huntingStatus(utc('2026-11-19', '04:00:00'), w), { stanje: 'prije', zaMs: 3600000 });
  assert.deepEqual(huntingStatus(utc('2026-11-19', '16:00:00'), w), { stanje: 'traje', zaMs: 1800000 });
  assert.equal(huntingStatus(utc('2026-11-19', '17:00:00'), w).stanje, 'poslije');
  assert.equal(formatCountdown(3600000 + 15 * MIN), '1 h 15 min');
  assert.equal(formatCountdown(4 * MIN + 30000), '5 min');
});

test('datum dd.mm. <-> MM-DD', () => {
  assert.equal(parseDayMonth('1.5.'), '05-01');
  assert.equal(parseDayMonth('31.12'), '12-31');
  assert.equal(parseDayMonth(' 15. 10. '), '10-15');
  assert.equal(parseDayMonth('32.1.'), null);
  assert.equal(parseDayMonth('1.13.'), null);
  assert.equal(parseDayMonth('x'), null);
  assert.equal(formatDayMonth('05-01'), '1.5.');
});

test('period preko Nove godine', () => {
  assert.equal(inPeriod('11-19', '10-01', '01-31'), true);
  assert.equal(inPeriod('01-15', '10-01', '01-31'), true);
  assert.equal(inPeriod('02-01', '10-01', '01-31'), false);
  assert.equal(inPeriod('05-01', '05-01', '09-30'), true);
  assert.equal(inPeriod('09-30', '05-01', '09-30'), true);
  assert.equal(inPeriod('10-01', '05-01', '09-30'), false);
});

const LOVOSTAJ = [
  { id: 'a', vrsta_kod: 'srna', kategorija_kod: 'srndac', otvoreno_od: '05-01', otvoreno_do: '09-30', aktivno: true },
  { id: 'b', vrsta_kod: 'srna', kategorija_kod: 'srna', otvoreno_od: '09-01', otvoreno_do: '12-31', aktivno: true },
  { id: 'c', vrsta_kod: 'zec', kategorija_kod: null, otvoreno_od: '10-01', otvoreno_do: '12-31', aktivno: true },
  { id: 'd', vrsta_kod: 'zec', kategorija_kod: null, otvoreno_od: '01-01', otvoreno_do: '12-31', aktivno: false },
];
const day = (s) => new Date(`${s}T12:00:00`);

test('lovostaj: otvoreno / lovostaj (sa sljedećim otvaranjem) / nije uneseno', () => {
  assert.deepEqual(seasonStatus(LOVOSTAJ, 'zec', null, day('2026-11-19')), { stanje: 'otvoreno', do: '12-31', samoZa: [] });
  const z = seasonStatus(LOVOSTAJ, 'zec', null, day('2026-03-01'));
  assert.equal(z.stanje, 'lovostaj');
  assert.equal(z.od, '10-01');
  assert.equal(seasonStatus(LOVOSTAJ, 'medvjed', null, day('2026-11-19')).stanje, 'nepoznato');
  assert.equal(seasonStatus(LOVOSTAJ, 'srna', 'srndac', day('2026-11-19')).stanje, 'lovostaj');
  assert.equal(seasonStatus(LOVOSTAJ, 'srna', 'srna', day('2026-11-19')).stanje, 'otvoreno');
  assert.deepEqual(seasonStatus(LOVOSTAJ, 'srna', null, day('2026-11-19')), { stanje: 'otvoreno', do: '12-31', samoZa: ['srna'] });
  assert.equal(seasonStatus(LOVOSTAJ, 'srna', 'lane', day('2026-11-19')).stanje, 'lovostaj', 'kategorija bez reda nije otvorena');
});

import { buildPayload, parseKategorije, formatKategorije, EDITORI } from '../../static/js/propisi-admin.js';

test('admin forma: datum dd.mm. postaje MM-DD, obavezna polja, broj u granicama', () => {
  const f = EDITORI.lovostaj.fields;
  assert.deepEqual(buildPayload(f, { vrsta_kod: 'srna', kategorija_kod: '', otvoreno_od: '1.5.', otvoreno_do: '30.9.', napomena: '', izvor: 'Odluka X', aktivno: true }, true).payload,
    { vrsta_kod: 'srna', kategorija_kod: null, otvoreno_od: '05-01', otvoreno_do: '09-30', napomena: null, izvor: 'Odluka X', aktivno: true });
  assert.match(buildPayload(f, { vrsta_kod: '', otvoreno_od: '1.5.', otvoreno_do: '30.9.' }, true).error, /Vrsta/);
  assert.match(buildPayload(f, { vrsta_kod: 'srna', otvoreno_od: '31.2.', otvoreno_do: '30.9.' }, true).error, /dd\.mm\./);
  const lv = EDITORI.lovno_vrijeme.fields;
  assert.match(buildPayload(lv, { prije_izlaska_min: '300', poslije_zalaska_min: '60' }, true).error, /cijeli broj/);
  assert.equal(buildPayload(lv, { vrsta_kod: '', prije_izlaska_min: '60', poslije_zalaska_min: '45', aktivno: true }, true).payload.vrsta_kod, null);
});

test('admin forma: kod se ne mijenja pri izmjeni; kategorije kod:Naziv', () => {
  const f = EDITORI.vrste.fields;
  const p = buildPayload(f, { kod: 'srna', naziv: 'Srna', kategorije: 'srndac:Srndać\nsrna:Srna', redoslijed: '10', aktivno: true }, false).payload;
  assert.equal('kod' in p, false);
  assert.deepEqual(p.kategorije, [{ kod: 'srndac', naziv: 'Srndać' }, { kod: 'srna', naziv: 'Srna' }]);
  assert.equal(parseKategorije('bez dvotacke'), null);
  assert.equal(formatKategorije([{ kod: 'a', naziv: 'A' }]), 'a:A');
  assert.match(buildPayload(f, { kod: 'Loš Kod', naziv: 'x' }, true).error, /Kod/);
});

import { daylightStatus } from '../../static/js/sunce.js';
import { distanceM, bearingDeg, formatMemberDistance, arrowAngle, memberVectors } from '../../static/js/istrazivac.js';

test('daylightStatus: zora, dan, sumrak, noć', () => {
  const t = (h, m = 0) => Date.UTC(2026, 10, 19, h, m);
  const today = { svitanje: t(5, 25), izlazak: t(6), zalazak: t(15, 23), suton: t(15, 56) };
  const tomorrow = { ...today, svitanje: t(5, 27) + 86400000 };
  assert.equal(daylightStatus(t(12), today).stanje, 'dan');
  assert.match(daylightStatus(t(12), today).tekst, /^Svjetlo do \d\d:\d\d \(još \d+ h \d\d min\)$/);
  assert.equal(daylightStatus(t(15, 30), today).stanje, 'sumrak');
  assert.equal(daylightStatus(t(5, 40), today).stanje, 'zora');
  assert.equal(daylightStatus(t(2), today).stanje, 'noc');
  assert.equal(daylightStatus(t(20), today, tomorrow).stanje, 'noc');
  assert.match(daylightStatus(t(20), today, tomorrow).tekst, /^Noć, svitanje \d\d:\d\d$/);
  assert.equal(daylightStatus(t(12), { ...today, izlazak: null }).stanje, 'nepoznato');
});

test('istrazivac: udaljenost, smjer, strelica, filtriranje', () => {
  const me = { lat: 44.88, lon: 16.15 };
  const sjever = { lat: 44.89, lon: 16.15 };
  assert.ok(Math.abs(distanceM(me, sjever) - 1112) < 5);
  assert.ok(bearingDeg(me, sjever) < 0.01 || bearingDeg(me, sjever) > 359.99);
  assert.ok(Math.abs(bearingDeg(me, { lat: 44.88, lon: 16.16 }) - 90) < 0.5);
  assert.equal(formatMemberDistance(480), '480 m');
  assert.equal(formatMemberDistance(1500), '1,5 km');
  assert.equal(formatMemberDistance(12400), '12 km');
  assert.equal(arrowAngle(90, 90), 0);
  assert.equal(arrowAngle(10, 350), 20);
  assert.equal(arrowAngle(90, null), 90);
  const now = Date.parse('2026-11-19T10:00:00Z');
  const rows = [
    { korisnik_id: 'a', ...sjever, t: '2026-11-19T09:59:00Z' },
    { korisnik_id: 'ja', ...me, t: '2026-11-19T10:00:00Z' },
    { korisnik_id: 'b', lat: 44.881, lon: 16.15, t: '2026-11-19T09:58:00Z' },
    { korisnik_id: 'stari', lat: 44.9, lon: 16.2, t: '2026-11-19T08:00:00Z' },
  ];
  const v = memberVectors(me, rows, 'ja', (id) => id.toUpperCase(), now);
  assert.deepEqual(v.map((x) => x.id), ['b', 'a']);
  assert.equal(v[0].ime, 'B');
  assert.equal(v[0].starost, 2);
});

import { normalizeShare, shareIntervalMs, sharingState, initialsOf, pickActiveHunt, shareList } from '../../static/js/lokacija.js';

test('lokacija: postavke, svježina, inicijali, aktivni lov, spisak', () => {
  assert.deepEqual(normalizeShare(undefined), { on: true, interval: 'normalno' });
  assert.deepEqual(normalizeShare({ on: false, interval: 'cesto' }), { on: false, interval: 'cesto' });
  assert.equal(normalizeShare({ interval: 'nesto' }).interval, 'normalno');
  assert.equal(shareIntervalMs('stedi'), 60000);
  assert.equal(shareIntervalMs('x'), 20000);
  const now = Date.parse('2026-11-19T10:00:00Z');
  const ago = (m) => new Date(now - m * 60000).toISOString();
  assert.equal(sharingState(ago(1), now), 'zivo');
  assert.equal(sharingState(ago(5), now), 'staro');
  assert.equal(sharingState(ago(20), now), 'bez-signala');
  assert.equal(sharingState(ago(45), now), 'nema');
  assert.equal(initialsOf('Goran Grupovođa'), 'GG');
  assert.equal(initialsOf('Ivo'), 'I');
  const recs = [
    { id: 'a', lov: { status: 'planiran', datum: '2026-11-20' }, ucesnici: [{ korisnik_id: 'ja' }] },
    { id: 'b', lov: { status: 'u_toku', datum: '2026-11-19' }, ucesnici: [{ korisnik_id: 'ja' }] },
    { id: 'c', lov: { status: 'u_toku', datum: '2026-11-19' }, ucesnici: [{ korisnik_id: 'drugi' }] },
  ];
  assert.equal(pickActiveHunt(recs, 'ja').id, 'b');
  assert.equal(pickActiveHunt(recs, 'niko'), null);
  const me = { lat: 44.88, lon: 16.15 };
  const uc = [{ korisnik_id: 'ja' }, { korisnik_id: 'x', uloga: 'strijelac' }, { korisnik_id: 'y' }, { korisnik_id: 'z' }];
  const rows = [
    { korisnik_id: 'x', lat: 44.89, lon: 16.15, t: ago(1) },
    { korisnik_id: 'y', lat: 44.881, lon: 16.15, t: ago(40) },
  ];
  const list = shareList(uc, rows, 'ja', (id) => id.toUpperCase(), me, now);
  assert.deepEqual(list.map((m) => [m.id, m.stanje]), [['x', 'zivo'], ['y', 'nema'], ['z', 'nema']]);
  assert.ok(list[0].udaljenost > 1000);
});

import { canLead, newDogadjaj, mergeDogadjaji, driveState, memberStatus, elapsedText, alertsFor, isRlsDenied } from '../../static/js/tok.js';

test('tok lova: vođa, događaji, stanje pogona i statusi', () => {
  const lov = { lov: { organizator_id: 'org' }, ucesnici: [{ korisnik_id: 'v', uloga: 'vodja' }, { korisnik_id: 's', uloga: 'strijelac' }] };
  assert.equal(canLead(lov, 'org', false), true);
  assert.equal(canLead(lov, 'v', false), true);
  assert.equal(canLead(lov, 's', false), false);
  assert.equal(canLead(lov, 's', true), true);
  assert.throws(() => newDogadjaj({ id: '1', lovId: 'l', autorId: 'a', vrsta: 'bum' }));
  const mk = (id, autor, vrsta, min) => ({ id, autor_id: autor, vrsta, created_at: new Date(Date.UTC(2026, 10, 19, 8, min)).toISOString() });
  const ev = mergeDogadjaji([mk('b', 's', 'na_stanu', 5)], [mk('a', 'v', 'pocetak_pogona', 1), mk('b', 's', 'na_stanu', 5)]);
  assert.deepEqual(ev.map((e) => e.id), ['a', 'b']);
  assert.equal(driveState([]).stanje, 'nije');
  assert.equal(driveState(ev).stanje, 'pogon');
  assert.equal(driveState([...ev, mk('c', 'v', 'okupljanje', 6)]).stanje, 'pogon');
  assert.equal(driveState([...ev, mk('d', 'v', 'prekid', 7)]).stanje, 'prekid');
  assert.equal(driveState([...ev, mk('d', 'v', 'prekid', 7), mk('e', 'v', 'pocetak_pogona', 9)]).stanje, 'pogon');
  assert.equal(driveState([...ev, mk('f', 'v', 'kraj_pogona', 8)]).stanje, 'kraj');
  assert.equal(memberStatus(ev, 's').stanje, 'na-stanu');
  assert.equal(memberStatus([...ev, mk('g', 's', 'napustio_stan', 9)], 's').stanje, 'u-pokretu');
  assert.equal(memberStatus(ev, 'x').stanje, 'nema');
  assert.equal(elapsedText('2026-11-19T08:00:00Z', Date.parse('2026-11-19T08:42:30Z')), '42 min');
  assert.equal(elapsedText('2026-11-19T08:00:00Z', Date.parse('2026-11-19T09:05:00Z')), '1 h 05 min');
  assert.deepEqual(alertsFor(ev, 's', new Set()).map((e) => e.id), ['a']);
  assert.deepEqual(alertsFor(ev, 's', new Set(['a'])), []);
  assert.deepEqual(alertsFor(ev, 'v', new Set()), []);
  assert.equal(isRlsDenied('new row violates row-level security policy'), true);
  assert.equal(isRlsDenied('network down'), false);
});
