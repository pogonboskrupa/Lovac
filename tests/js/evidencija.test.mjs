import test from 'node:test';
import assert from 'node:assert/strict';
import {
  speciesBadge, lastMonths, biggestHarvest, sortHarvest, sortObservations, groupByMonthOf, filterReported, observationLight, lightDistribution, lastSeenText,
} from '../../static/js/evidencija.js';

const NOW = new Date(2026, 10, 22, 12).getTime();
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('emblem vrste: iz Divljači, a za drugu vrstu stabilna boja i slova naziva', () => {
  assert.deepEqual(speciesBadge('srna'), { boja: '#92400e', znak: 'SR' });
  const a = speciesBadge('lisica', 'Lisica'); const b = speciesBadge('lisica', 'Lisica');
  assert.deepEqual(a, b);
  assert.equal(a.znak, 'LI');
  assert.match(a.boja, /^#[0-9a-f]{6}$/);
  assert.equal(speciesBadge('x1').znak, 'X');
  assert.equal(speciesBadge('', '').znak, '?');
});

test('lastMonths: 12 mjeseci unazad, stari izvan raspona se ne računaju', () => {
  const items = [{ t: at(2026, 11, 3) }, { t: at(2026, 11, 20) }, { t: at(2026, 1, 5) }, { t: at(2025, 1, 5) }, { t: at(2025, 12, 1), kg: 5 }];
  const m = lastMonths(items, (o) => o.t, () => 1, NOW);
  assert.equal(m.length, 12);
  assert.deepEqual([m[0].godina, m[0].mjesec, m[11].godina, m[11].mjesec], [2025, 12, 2026, 11]);
  assert.equal(m[11].vrijednost, 2);
  assert.equal(m[1].vrijednost, 1, 'januar 2026');
  assert.equal(m[0].vrijednost, 1, 'decembar 2025');
  assert.equal(m.reduce((s, x) => s + x.vrijednost, 0), 4, 'januar 2025 je izvan 12 mjeseci');
  assert.equal(lastMonths(items, (o) => o.t, (o) => o.kg || 0, NOW)[0].vrijednost, 5);
});

test('odstrel: najveći komad, sortiranje po težini i vremenu, filter po prijavi', () => {
  const l = [{ id: 'a', tezina: 30, vrijeme: 3 }, { id: 'b', tezina: 85, vrijeme: 1 }, { id: 'c', tezina: null, vrijeme: 2 }, { id: 'd', tezina: 85, vrijeme: 5 }];
  assert.equal(biggestHarvest(l).id, 'b');
  assert.equal(biggestHarvest([{ tezina: null }, { tezina: 0 }]), null);
  assert.deepEqual(sortHarvest(l, 'novije').map((o) => o.id), ['d', 'a', 'c', 'b']);
  assert.deepEqual(sortHarvest(l, 'teze').map((o) => o.id), ['d', 'b', 'a', 'c']);
  const state = { a: 'poslana', b: 'ceka', c: 'nema', d: 'odbijena' };
  assert.deepEqual(filterReported(l, 'prijavljeni', (id) => state[id]).map((o) => o.id), ['a', 'b']);
  assert.deepEqual(filterReported(l, 'neprijavljeni', (id) => state[id]).map((o) => o.id), ['c', 'd']);
  assert.equal(filterReported(l, 'svi', (id) => state[id]).length, 4);
  assert.deepEqual(filterReported([{ id: 'z', tudji: true }], 'neprijavljeni', () => 'nema'), [], 'tuđi zapis se ne prijavljuje');
});

test('opažanja: sortiranje po grlima, grupe po mjesecima, doba dana iz sunca, zadnje viđeno', () => {
  const l = [{ id: 'a', broj: 2, vrijeme: at(2026, 11, 20) }, { id: 'b', broj: 5, vrijeme: at(2026, 11, 2) }, { id: 'c', broj: 1, vrijeme: at(2026, 10, 30) }];
  assert.deepEqual(sortObservations(l, 'grla').map((o) => o.id), ['b', 'a', 'c']);
  const g = groupByMonthOf(sortObservations(l, 'novije'), (o) => o.vrijeme);
  assert.deepEqual(g.map((x) => [x.kljuc, x.items.length]), [['2026-11', 2], ['2026-10', 1]]);
  assert.equal(g[0].naziv, 'Novembar 2026.');
  // Grmeč, 19.11.: sunce izlazi oko 6:57, zalazi oko 16:23 (lokalno)
  // vrijeme je zadano kao CET (UTC+1), da test ne zavisi od vremenske zone računara
  const o = (h, mi = 0) => ({ lat: 44.88, lon: 16.15, vrijeme: Date.UTC(2026, 10, 19, h - 1, mi), broj: 1 });
  assert.equal(observationLight(o(12)), 'dan');
  assert.equal(observationLight(o(2)), 'noc');
  assert.equal(observationLight(o(6, 40)), 'zora');
  assert.equal(observationLight(o(16, 40)), 'sumrak');
  assert.equal(observationLight(o(22)), 'noc');
  assert.equal(observationLight({ vrijeme: 1 }), null, 'bez lokacije nema doba dana');
  assert.deepEqual(lightDistribution([{ ...o(12), broj: 3 }, o(2), o(16, 40)]), { zora: 0, dan: 3, sumrak: 1, noc: 1 });
  assert.equal(lastSeenText([], NOW), '—');
  assert.equal(lastSeenText(l, NOW), 'prije 2 d');
  assert.equal(lastSeenText([{ vrijeme: NOW - 3600000 }], NOW), 'danas');
  assert.equal(lastSeenText([{ vrijeme: NOW - 86400000 }], NOW), 'jučer');
});
