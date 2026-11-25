import test from 'node:test';
import assert from 'node:assert/strict';
import { markerDiameter, showInitials, clusterMembers, groupDiameter, MIN_PX, MAX_PX, INITIALS_MIN_PX } from '../../static/js/marker-velicina.js';

test('marker prati razmjeru: manji kad je karta manje uvećana, veći kad je uvećana, uvijek u granicama', () => {
  assert.equal(markerDiameter(15, 1), 34);
  for (let z = 10; z < 18; z++) assert.ok(markerDiameter(z, 5) <= markerDiameter(z + 1, 5));
  for (let z = 5; z <= 20; z++) for (const n of [1, 10, 30, 80]) {
    const d = markerDiameter(z, n);
    assert.ok(d >= MIN_PX && d <= MAX_PX, `${z}/${n}: ${d}`);
  }
  assert.ok(markerDiameter(12, 1) < 34);
});

test('marker je manji kad je lovaca puno: do 8 puna veličina, 30 i više najmanje 70 %', () => {
  assert.equal(markerDiameter(15, 8), markerDiameter(15, 1));
  assert.ok(markerDiameter(15, 16) < markerDiameter(15, 8));
  assert.ok(markerDiameter(15, 30) <= Math.round(34 * 0.71));
  assert.equal(markerDiameter(15, 30), markerDiameter(15, 200));
});

test('inicijali samo kad se mogu pročitati', () => {
  assert.ok(showInitials(INITIALS_MIN_PX));
  assert.ok(!showInitials(INITIALS_MIN_PX - 1));
  assert.ok(!showInitials(markerDiameter(11, 30)));
});

test('grupisanje: bliski lovci u jednu grupu, udaljeni ostaju sami, lanac se ne sliva tranzitivno', () => {
  const P = { a: [100, 100], b: [110, 104], c: [300, 300], d: [160, 100], e: [210, 100] };
  const m = (id) => ({ id, lat: P[id][1], lon: P[id][0] });
  const project = (x) => ({ x: x.lon, y: x.lat });
  const g = clusterMembers(['a', 'b', 'c'].map(m), project, 30);
  assert.deepEqual(g.map((x) => x.members.map((y) => y.id)), [['a', 'b'], ['c']]);
  assert.equal(g[0].lon, 105);
  // lanac a-d-e (razmaci 60 i 50) sa pragom 85 % od 80 px = 68: a i d zajedno, e (50 od d, 110 od a) ostaje posebno
  const lanac = clusterMembers(['a', 'd', 'e'].map(m), project, 80);
  assert.deepEqual(lanac.map((x) => x.members.map((y) => y.id)), [['a', 'd'], ['e']]);
  assert.deepEqual(clusterMembers([], project, 30), []);
});

test('manji markeri = manje grupisanja (razmak isti u pikselima)', () => {
  const ms = [{ id: 'a', lat: 0, lon: 0 }, { id: 'b', lat: 0, lon: 24 }];
  const project = (x) => ({ x: x.lon, y: x.lat });
  assert.equal(clusterMembers(ms, project, 34).length, 1);
  assert.equal(clusterMembers(ms, project, 24).length, 2);
});

test('znak grupe je veći od markera, ali ne manji od 22 px', () => {
  assert.ok(groupDiameter(34) > 34);
  assert.equal(groupDiameter(16), 22);
});
