import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversine, isPaused, acceptPoint, mergePoints, newTrack, pauseTrack, resumeTrack, stopTrack,
  movingTime, trackDistance, autoPauseCheck, smoothPoints, segmentsByPauses, toGpx, toKml,
  createSnapshotTimer, trackFileName,
} from '../../static/js/trag.js';

const T0 = Date.UTC(2026, 10, 19, 6, 0, 0);
// ~11 m po koraku prema sjeveru
const pt = (i, extra = {}) => ({ t: T0 + i * 5000, lat: 44.88 + i * 0.0001, lon: 16.15, acc: 5, ...extra });

test('udaljenost (haversine)', () => {
  const d = haversine({ lat: 44.88, lon: 16.15 }, { lat: 44.89, lon: 16.15 });
  assert.ok(Math.abs(d - 1112) < 2, String(d));
});

test('tačka: loša tačnost se odbacuje, 5 s ili 5 m', () => {
  assert.equal(acceptPoint(null, pt(0)), true);
  assert.equal(acceptPoint(null, pt(0, { acc: 31 })), false);
  const a = pt(0);
  assert.equal(acceptPoint(a, { ...a, t: a.t + 2000 }), false, 'stoji, 2 s');
  assert.equal(acceptPoint(a, { ...a, t: a.t + 5000 }), true, 'stoji, 5 s');
  assert.equal(acceptPoint(a, { ...a, t: a.t + 1000, lat: a.lat + 0.0001 }), true, 'pomak 11 m');
  assert.equal(acceptPoint(a, { ...a, t: a.t - 1 }), false, 'starija tačka');
});

test('pauza kao interval: otvoren interval traje do kraja', () => {
  const p = [{ od: 10, do: 20 }, { od: 50, do: null }];
  assert.equal(isPaused(9, p), false);
  assert.equal(isPaused(10, p), true);
  assert.equal(isPaused(20, p), false);
  assert.equal(isPaused(99999, p), true);
});

test('replay bafera: bez duplikata, bez tačaka iz pauze i prije starta', () => {
  let tr = newTrack({ id: 'a', start: T0 + 5000, naziv: 'x' });
  tr = pauseTrack(tr, T0 + 20000);
  tr = resumeTrack(tr, T0 + 40000);
  const buffer = Array.from({ length: 12 }, (_, i) => pt(i));
  const first = mergePoints([], buffer.slice(0, 6), tr);
  const replayed = mergePoints(first, buffer, tr); // cijeli bafer ponovo (restart app-a)
  const ts = replayed.map((p) => (p.t - T0) / 5000);
  assert.deepEqual(ts, [1, 2, 3, 8, 9, 10, 11]);
});

test('stop zatvara otvoren interval pauze, a vrijeme kretanja ne broji pauze', () => {
  let tr = newTrack({ id: 'a', start: T0, naziv: 'x' });
  tr = pauseTrack(tr, T0 + 60000);
  tr = pauseTrack(tr, T0 + 70000); // dvostruka pauza ne otvara drugi interval
  assert.equal(tr.pauze.length, 1);
  tr = stopTrack(tr, T0 + 120000);
  assert.equal(tr.status, 'gotovo');
  assert.equal(tr.pauze[0].do, T0 + 120000);
  assert.equal(movingTime(tr), 60000);
});

test('dužina traga', () => {
  const d = trackDistance([pt(0), pt(1), pt(2)]);
  assert.ok(Math.abs(d - 22.2) < 0.5, String(d));
});

test('auto-pauza nakon 2 min mirovanja, auto-nastavak tek pomakom', () => {
  let tr = newTrack({ id: 'a', start: T0, naziv: 'x' });
  const still = Array.from({ length: 30 }, (_, i) => ({ t: T0 + i * 5000, lat: 44.88 + (i % 2) * 0.00002, lon: 16.15, acc: 5 }));
  assert.equal(autoPauseCheck(tr, still.slice(0, 10), T0 + 45000), null, 'prekratko');
  assert.equal(autoPauseCheck(tr, still, T0 + 145000), 'pauza');
  tr = pauseTrack(tr, T0 + 145000, true);
  assert.equal(autoPauseCheck(tr, [...still, { t: T0 + 150000, lat: 44.88002, lon: 16.15, acc: 5 }], T0 + 150000), null);
  assert.equal(autoPauseCheck(tr, [...still, { t: T0 + 150000, lat: 44.8805, lon: 16.15, acc: 5 }], T0 + 150000), 'nastavi');
  const manual = pauseTrack(newTrack({ id: 'b', start: T0, naziv: 'x' }), T0 + 1000, false);
  assert.equal(autoPauseCheck(manual, [{ t: T0 + 5000, lat: 45, lon: 16, acc: 5 }], T0 + 5000), null, 'ručna pauza se ne nastavlja sama');
});

test('uglačavanje čuva broj tačaka, krajeve i vremena', () => {
  const zig = Array.from({ length: 9 }, (_, i) => pt(i, { lon: 16.15 + (i % 2 ? 0.0002 : -0.0002) }));
  const s = smoothPoints(zig);
  assert.equal(s.length, zig.length);
  assert.deepEqual(s[0], zig[0]);
  assert.deepEqual(s.at(-1), zig.at(-1));
  assert.ok(Math.abs(s[4].lon - 16.15) < Math.abs(zig[4].lon - 16.15));
  assert.deepEqual(s.map((p) => p.t), zig.map((p) => p.t));
});

test('segmenti se dijele na pauzama', () => {
  let tr = newTrack({ id: 'a', start: T0, naziv: 'x' });
  tr = pauseTrack(tr, T0 + 12000);
  tr = resumeTrack(tr, T0 + 30000);
  const segs = segmentsByPauses([pt(0), pt(1), pt(2), pt(7), pt(8)], tr.pauze);
  assert.deepEqual(segs.map((s) => s.length), [3, 2]);
});

test('GPX i KML izvoz: ispravan XML, escapovan naziv, segmenti', () => {
  let tr = newTrack({ id: 'a', start: T0, naziv: 'Čeka <Gornja> & "Bara"' });
  tr = pauseTrack(tr, T0 + 12000);
  tr = stopTrack(resumeTrack(tr, T0 + 30000), T0 + 60000);
  const pts = [pt(0), pt(1, { alt: 512.3 }), pt(2), pt(7), pt(8)];
  const gpx = toGpx(tr, pts);
  assert.match(gpx, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(gpx, /<name>Čeka &lt;Gornja&gt; &amp; &quot;Bara&quot;<\/name>/);
  assert.equal((gpx.match(/<trkseg>/g) || []).length, 2);
  assert.equal((gpx.match(/<trkpt /g) || []).length, 5);
  assert.match(gpx, /<ele>512\.3<\/ele>/);
  assert.match(gpx, /<time>2026-11-19T06:00:00\.000Z<\/time>/);
  const kml = toKml(tr, pts);
  assert.match(kml, /<kml xmlns="http:\/\/www\.opengis\.net\/kml\/2\.2">/);
  assert.equal((kml.match(/<LineString>/g) || []).length, 2);
  assert.match(kml, /16\.1500000,44\.8800000/);
});

test('naziv fajla za izvoz', () => {
  const tr = newTrack({ id: 'a', start: Date.UTC(2026, 0, 5, 7, 3), naziv: 'x' });
  assert.match(trackFileName(tr, 'gpx'), /^trag-2026-01-05-\d{4}\.gpx$/);
});

test('dijeljeni tajmer crash-snimka se gasi tek kad nijedno snimanje ne traje', () => {
  const calls = [];
  let handle = 0;
  const timers = { setInterval: (fn) => { calls.push('start'); return ++handle; }, clearInterval: () => calls.push('stop') };
  const t = createSnapshotTimer(() => {}, 30000, timers);
  t.start('trag'); t.start('potraga');
  t.stop('trag');
  assert.equal(t.isRunning(), true);
  t.stop('potraga');
  assert.equal(t.isRunning(), false);
  assert.deepEqual(calls, ['start', 'stop']);
});

import { nearestReturnTargets } from '../../static/js/trag.js';

test('GPX/KML: oznake potrage (nastrijel, krv) kao tačke', () => {
  const tr = stopTrack(newTrack({ id: 'p', start: T0, naziv: 'Potraga' }), T0 + 60000);
  const wpts = [{ lat: 44.88, lon: 16.15, t: T0, naziv: 'Nastrijel' }, { lat: 44.8805, lon: 16.1505, t: T0 + 30000, naziv: 'Krv' }];
  const gpx = toGpx(tr, [pt(0), pt(1)], wpts);
  assert.equal((gpx.match(/<wpt /g) || []).length, 2);
  assert.match(gpx, /<wpt lat="44\.8800000" lon="16\.1500000"><time>[^<]+<\/time><name>Nastrijel<\/name><\/wpt>/);
  const kml = toKml(tr, [pt(0), pt(1)], wpts);
  assert.equal((kml.match(/<Point>/g) || []).length, 2);
  assert.match(kml, /<name>Krv<\/name>/);
});

test('"Vodi me nazad": nastrijel, najbliža čeka i auto, početak traga', () => {
  const me = { lat: 44.88, lon: 16.15 };
  const objekti = [
    { id: 'c1', vrsta: 'ceka_visoka', naziv: 'Daleka čeka', lat: 44.95, lon: 16.15 },
    { id: 'c2', vrsta: 'ceka_niska', naziv: 'Bliska čeka', lat: 44.882, lon: 16.15 },
    { id: 'a1', vrsta: 'parking', naziv: 'Auto', lat: 44.87, lon: 16.15 },
    { id: 'h1', vrsta: 'hraniliste', naziv: 'Hranilište', lat: 44.8801, lon: 16.15 },
  ];
  const potraga = { nastrijel: { lat: 44.881, lon: 16.151 }, tacke: [{ lat: 44.8812, lon: 16.1512, t: 1 }] };
  const t = nearestReturnTargets(me, objekti, potraga);
  assert.deepEqual(t.map((x) => x.vrsta), ['nastrijel', 'ceka', 'auto', 'pocetak']);
  assert.equal(t[1].naziv, 'Bliska čeka');
  assert.equal(t[2].naziv, 'Auto');
});
