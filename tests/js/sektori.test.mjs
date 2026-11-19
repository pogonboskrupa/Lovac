import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  norm, arcContains, mergeArcs, isForbidden, allowedArcs, neighborSector, standSectors, sectorWedge, standWarnings,
  MIN_HALF_DEG, LATERAL_BUFFER_M,
} from '../../static/js/sektori.js';
import { destination } from '../../static/js/vjetar.js';
import { haversine } from '../../static/js/trag.js';
import { bearing } from '../../static/js/geo.js';

const S = { lat: 44.88, lon: 16.15, broj: 1 };
const at = (brg, dist, broj) => ({ ...destination(S, brg, dist), broj });

test('normalizacija ugla', () => {
  assert.equal(norm(370), 10);
  assert.equal(norm(-10), 350);
  assert.equal(norm(360), 0);
});

test('luk sadrži ugao, i preko sjevera (350° -> 10°)', () => {
  assert.equal(arcContains({ od: 350, do: 10 }, 355), true);
  assert.equal(arcContains({ od: 350, do: 10 }, 5), true);
  assert.equal(arcContains({ od: 350, do: 10 }, 0), true);
  assert.equal(arcContains({ od: 350, do: 10 }, 11), false);
  assert.equal(arcContains({ od: 350, do: 10 }, 349), false);
  assert.equal(arcContains({ od: 10, do: 20 }, 10), true, 'granica je zabranjena (sigurnija strana)');
  assert.equal(arcContains({ od: 10, do: 20 }, 20), true);
});

test('spajanje lukova: preklapanje, preko sjevera, puni krug', () => {
  assert.deepEqual(mergeArcs([{ od: 10, do: 30 }, { od: 20, do: 40 }]), [{ od: 10, do: 40 }]);
  assert.deepEqual(mergeArcs([{ od: 350, do: 10 }, { od: 5, do: 20 }]), [{ od: 350, do: 20 }]);
  assert.deepEqual(mergeArcs([{ od: 100, do: 120 }, { od: 10, do: 20 }]), [{ od: 10, do: 20 }, { od: 100, do: 120 }]);
  assert.deepEqual(mergeArcs([{ od: 0, do: 200 }, { od: 190, do: 360 }]), [{ od: 0, do: 360 }]);
  assert.deepEqual(mergeArcs([]), []);
});

test('dozvoljeni pravci su tačno komplement zabranjenih', () => {
  const forb = mergeArcs([{ od: 350, do: 20 }, { od: 90, do: 100 }]);
  const ok = allowedArcs(forb);
  assert.deepEqual(ok, [{ od: 20, do: 90 }, { od: 100, do: 350 }]);
  for (let b = 0; b < 360; b += 0.5) {
    const f = isForbidden(b, forb);
    const a = ok.some((x) => arcContains(x, b) && !(b === x.od || b === x.do));
    if (f) assert.equal(a, false, `ugao ${b} ne smije biti i dozvoljen i zabranjen`);
  }
  assert.deepEqual(allowedArcs([{ od: 0, do: 360 }]), []);
  assert.deepEqual(allowedArcs([]), [{ od: 0, do: 360 }]);
});

test('sektor prema susjednom stanu: centriran na pravac, širina iz bočne sigurnosne zone', () => {
  const n = at(0, 300, 2);
  const sec = neighborSector(S, n);
  const half = Math.atan(LATERAL_BUFFER_M / haversine(S, n)) * 180 / Math.PI;
  assert.ok(isForbidden(bearing(S, n), [sec]), 'pravac ka susjedu je zabranjen');
  assert.ok(Math.abs(norm(sec.do - sec.od) - 2 * half) < 0.01);
  assert.match(sec.razlog, /Stan 2/);
  // Daleki stan: širina ne pada ispod minimuma.
  const far = neighborSector(S, at(90, 5000, 3));
  assert.ok(norm(far.do - far.od) >= 2 * MIN_HALF_DEG - 1e-9);
  assert.ok(isForbidden(90, [far]));
});

test('stan: svi drugi stanovi (bez obzira na udaljenost) + ručni sektori, spojeno', () => {
  const stands = [S, at(10, 250, 2), at(20, 400, 3), at(180, 3000, 4)];
  const sectors = standSectors(S, stands, [{ od: 265, do: 275, razlog: 'Put' }]);
  assert.ok(isForbidden(10, sectors.lukovi));
  assert.ok(isForbidden(20, sectors.lukovi));
  assert.ok(isForbidden(180, sectors.lukovi), 'i stan na 3 km je zabranjen pravac');
  assert.ok(isForbidden(270, sectors.lukovi), 'ručni sektor (put)');
  assert.ok(!isForbidden(135, sectors.lukovi));
  assert.ok(!isForbidden(315, sectors.lukovi));
  assert.ok(sectors.razlozi.some((r) => /Put/.test(r)));
  assert.equal(sectors.lukovi.length, 3, 'stanovi 2 i 3 se preklapaju u jedan luk');
});

test('ručni sektor preko sjevera i provjera za svaki stepen', () => {
  const sectors = standSectors(S, [S], [{ od: 340, do: 15, razlog: 'Selo' }]);
  for (let b = 0; b < 360; b++) {
    const expected = b >= 340 || b <= 15;
    assert.equal(isForbidden(b, sectors.lukovi), expected, `ugao ${b}`);
  }
});

test('upozorenja: stanovi preblizu i stan bez koordinata', () => {
  const w = standWarnings([S, { ...destination(S, 45, 20), broj: 2 }, { broj: 3, lat: null, lon: null }]);
  assert.ok(w.some((x) => /Stan 1 i stan 2 su preblizu/.test(x)));
  assert.ok(w.some((x) => /Stan 3 nema poziciju/.test(x)));
  assert.deepEqual(standWarnings([S, at(0, 300, 2)]), []);
});

test('klin sektora za kartu počinje u stanu i ide do zadanog radijusa', () => {
  const wedge = sectorWedge(S, { od: 350, do: 10 }, 500);
  assert.deepEqual(wedge[0], [S.lat, S.lon]);
  const tip = wedge[1];
  assert.ok(Math.abs(haversine(S, { lat: tip[0], lon: tip[1] }) - 500) < 1);
  assert.ok(Math.abs(bearing(S, { lat: tip[0], lon: tip[1] }) - 350) < 0.5);
  const last = wedge[wedge.length - 1];
  assert.ok(Math.abs(bearing(S, { lat: last[0], lon: last[1] }) - 10) < 0.5);
});
