import test from 'node:test';
import assert from 'node:assert/strict';
import { routePath, trackStats, filterPeriod, sortTracks, groupByMonth, lastDaysKm } from '../../static/js/tragovi-pregled.js';
import { daysSince, visitStatus, visitText, filterObjects, sortObjects, typeCounts, OBILAZAK_KASNI_DANA } from '../../static/js/objekti.js';

const NOW = new Date(2026, 10, 22, 12).getTime();
const day = (n) => NOW - n * 86400000;
const line = (n, dlat = 0.0005) => Array.from({ length: n }, (_, i) => ({ t: 0, lat: 44.88 + i * dlat, lon: 16.15 + (i % 2) * 0.0003, acc: 5 }));

test('routePath: prazan za < 2 tačke, ostaje u okviru, najviše 60 tačaka, M pa L', () => {
  assert.equal(routePath([]), '');
  assert.equal(routePath([{ lat: 44, lon: 16 }]), '');
  const d = routePath(line(500), 96, 64, 6);
  assert.ok(d.startsWith('M'));
  assert.ok((d.match(/L/g) || []).length <= 60);
  const nums = d.match(/-?\d+\.\d/g).map(Number);
  assert.ok(nums.every((n) => n >= 0 && n <= 96), 'unutar okvira');
  assert.equal(routePath([{ lat: 44.88, lon: 16.15 }, { lat: 44.88, lon: 16.15 }]).includes('NaN'), false, 'ista tačka ne daje NaN');
});

const trk = (id, daysAgo, n, extra = {}) => ({ id, status: 'gotovo', start: day(daysAgo), kraj: day(daysAgo) + 3600000, tacke: line(n).map((p, i) => ({ ...p, t: day(daysAgo) + i * 20000 })), pauze: [], ...extra });

test('tragovi: brojke po tragu, period, sortiranje, grupisanje po mjesecima, zadnjih 7 dana', () => {
  const a = trk('a', 1, 30); const b = trk('b', 40, 10); const c = trk('c', 3, 60);
  const st = trackStats(c);
  assert.equal(st.tacaka, 60);
  assert.ok(st.metara > 1000 && st.brzinaKmh > 0);
  assert.equal(trackStats({ ...c, tacke: [] }).brzinaKmh, 0);
  assert.equal(trackStats({ ...c, tacke: [], kraj: c.start }).brzinaKmh, null, 'bez trajanja nema brzine');
  assert.deepEqual(filterPeriod([a, b, c], 'sedmica', NOW).map((t) => t.id), ['a', 'c']);
  assert.deepEqual(filterPeriod([a, b, c], 'mjesec', NOW).map((t) => t.id), ['a', 'c']);
  assert.equal(filterPeriod([a, b, c], 'godina', NOW).length, 3);
  assert.equal(filterPeriod([a, b, c], 'sve', NOW).length, 3);
  assert.deepEqual(sortTracks([a, b, c], 'novije').map((t) => t.id), ['a', 'c', 'b']);
  assert.deepEqual(sortTracks([a, b, c], 'duze').map((t) => t.id), ['c', 'a', 'b']);
  const g = groupByMonth(sortTracks([a, b, c], 'novije'));
  assert.deepEqual(g.map((x) => [x.kljuc, x.tracks.length]), [['2026-11', 2], ['2026-10', 1]]);
  assert.equal(g[0].naziv, 'Novembar 2026.');
  const bars = lastDaysKm([a, b, c], NOW);
  assert.equal(bars.length, 7);
  assert.ok(bars[6].km === 0 && bars[5].km > 0 && bars[3].km > 0, 'jučer i prije 3 dana imaju km, danas ne');
});

const obj = (id, o = {}) => ({ id, naziv: id, vrsta: 'cekalo', stanje: 'ispravno', zadnji_obilazak: '2026-11-20', ...o });

test('objekti: dani od obilaska, "dugo bez obilaska" (30+), tekst, filteri, sortiranje, brojevi po vrsti', () => {
  assert.equal(daysSince('2026-11-22', NOW), 0);
  assert.equal(daysSince('2026-11-12', NOW), 10);
  assert.equal(daysSince(null, NOW), null);
  assert.equal(daysSince('nije datum', NOW), null);
  assert.equal(OBILAZAK_KASNI_DANA, 30);
  assert.deepEqual(visitStatus(obj('a', { zadnji_obilazak: '2026-10-23' }), NOW), { dana: 30, kasni: true });
  assert.equal(visitStatus(obj('a', { zadnji_obilazak: '2026-10-24' }), NOW).kasni, false);
  assert.equal(visitStatus(obj('a', { zadnji_obilazak: null }), NOW).kasni, true, 'bez upisanog obilaska = nije obilažen');
  assert.equal(visitText(obj('a', { zadnji_obilazak: '2026-11-22' }), NOW), 'obiđen danas');
  assert.equal(visitText(obj('a', { zadnji_obilazak: '2026-11-21' }), NOW), 'obiđen jučer');
  assert.equal(visitText(obj('a', { zadnji_obilazak: '2026-11-12' }), NOW), 'obiđen prije 10 dana');
  assert.equal(visitText(obj('a', { zadnji_obilazak: '' }), NOW), 'nije obilažen');
  const items = [obj('b', { stanje: 'popravka' }), obj('a', { zadnji_obilazak: '2026-09-01', vrsta: 'hraniliste' }), obj('c', { stanje: 'sruseno', zadnji_obilazak: null })];
  assert.deepEqual(filterObjects(items, { filter: 'popravka' }, NOW).map((o) => o.id), ['b', 'c']);
  assert.deepEqual(filterObjects(items, { filter: 'kasni' }, NOW).map((o) => o.id), ['a', 'c']);
  assert.deepEqual(filterObjects(items, { vrsta: 'hraniliste' }, NOW).map((o) => o.id), ['a']);
  assert.deepEqual(sortObjects(items, 'naziv', NOW).map((o) => o.id), ['a', 'b', 'c']);
  assert.deepEqual(sortObjects(items, 'obilazak', NOW).map((o) => o.id), ['c', 'a', 'b'], 'nije obilažen prvi, pa najdavniji');
  assert.deepEqual(sortObjects(items, 'blizu', NOW).map((o) => o.id), ['b', 'a', 'c'], 'blizu = redoslijed koji je stigao');
  assert.deepEqual(typeCounts(items), [{ vrsta: 'cekalo', komada: 2 }, { vrsta: 'hraniliste', komada: 1 }]);
});
