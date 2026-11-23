import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceToTrack, orderTracks, normalizeStyle, polylineStyle, distanceLabel } from '../../static/js/tragovi-karta.js';

const C = { lat: 44.88, lon: 16.15 };
const line = (lat0, lon0, lat1, lon1) => [{ lat: lat0, lon: lon0 }, { lat: lat1, lon: lon1 }];

test('udaljenost do traga mjeri do DUŽI, ne samo do tačaka', () => {
  // duž prolazi tačno kroz sredinu, a krajnje tačke su ~800 m daleko
  const d = distanceToTrack(line(44.88, 16.14, 44.88, 16.16), C);
  assert.ok(d < 1, `d=${d}`);
  const d2 = distanceToTrack(line(44.89, 16.14, 44.89, 16.16), C); // ~1,1 km sjeverno
  assert.ok(Math.abs(d2 - 1112) < 15, `d2=${d2}`);
  assert.equal(distanceToTrack([], C), Infinity);
});

test('zadani redoslijed: najbliži sredini karte prvi; "novije" po datumu; bez tačaka na kraj', () => {
  const daleko = { id: 'daleko', start: 3, tacke: line(44.95, 16.2, 44.96, 16.21) };
  const blizu = { id: 'blizu', start: 1, tacke: line(44.881, 16.149, 44.882, 16.151) };
  const prazan = { id: 'prazan', start: 5, tacke: [] };
  assert.deepEqual(orderTracks([daleko, prazan, blizu], C).map((r) => r.t.id), ['blizu', 'daleko', 'prazan']);
  assert.deepEqual(orderTracks([daleko, prazan, blizu], C, 'novije').map((r) => r.t.id), ['prazan', 'daleko', 'blizu']);
});

test('stil linije: neispravno → zadano; isprekidana i tačkasta imaju dashArray', () => {
  assert.deepEqual(normalizeStyle({ boja: 'javascript:', debljina: 99 }), { boja: '#e11d48', debljina: 4, linija: 'puna' });
  assert.equal(polylineStyle({ linija: 'isprekidana' }).dashArray, '12 8');
  assert.equal(polylineStyle({}).dashArray, undefined);
  assert.equal(polylineStyle({ linija: 'tackasta', debljina: 6 }).weight, 6);
  assert.equal(distanceLabel(1234), '1,2 km od sredine karte');
  assert.equal(distanceLabel(20), 'u sredini karte');
});
