import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addArea, removeArea, coveringArea, areaTitle, areaDetail, areasSummary, newAreaId } from '../../static/js/podrucja.js';

const B = { south: 44.8, west: 16.0, north: 44.9, east: 16.2 };
const mk = (o = {}) => ({ id: 'a', base: 'topo', bounds: B, zMin: 12, zMax: 16, plocica: 900, gresaka: 0, t: Date.UTC(2026, 10, 20), ...o });

test('isto područje se ažurira, ne dupla; najnovije prvo; granica broja', () => {
  let l = addArea([], mk());
  l = addArea(l, mk({ plocica: 950, t: Date.UTC(2026, 10, 21) }));
  assert.equal(l.length, 1);
  assert.equal(l[0].plocica, 950);
  for (let i = 0; i < 30; i++) l = addArea(l, mk({ id: `x${i}`, t: i }));
  assert.equal(l.length, 20);
  assert.equal(removeArea(l, 'x29').some((a) => a.id === 'x29'), false);
});
test('pokrivenost: ista podloga, unutar granica, zoom u rasponu, bez grešaka', () => {
  const l = [mk()];
  const unutra = { south: 44.82, west: 16.05, north: 44.85, east: 16.1 };
  assert.ok(coveringArea(l, 'topo', unutra, 15));
  assert.equal(coveringArea(l, 'satelit', unutra, 15), null);
  assert.equal(coveringArea(l, 'topo', { ...unutra, north: 45.0 }, 15), null, 'viri izvan područja');
  assert.equal(coveringArea(l, 'topo', unutra, 17), null, 'zoom iznad preuzetog');
  assert.equal(coveringArea([mk({ gresaka: 3 })], 'topo', unutra, 15), null, 'sa greškama se ne tvrdi da je pokriveno');
});
test('opisi i zbir', () => {
  assert.equal(areaTitle(mk()), 'Topo · zoom 12–16');
  assert.match(areaDetail(mk({ gresaka: 2 })), /900 pločica, 2 nije stiglo · \d\d\.11\.2026\./);
  assert.deepEqual(areasSummary([mk(), mk({ id: 'b', plocica: 100 })]), { broj: 2, plocica: 1000 });
  assert.equal(newAreaId('topo', B, 16), 'topo:44800:16000:44900:16200:16');
});
