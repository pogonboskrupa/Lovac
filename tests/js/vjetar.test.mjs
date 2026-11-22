import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  windSector, suitsStand, destination, scentCone, parseForecast, currentWind, ageText, thermalHint, isStandType,
} from '../../static/js/vjetar.js';
import { decodeTerrarium, tilePixel, uphillAspect } from '../../static/js/dem.js';
import { haversine } from '../../static/js/trag.js';
import { bearing } from '../../static/js/geo.js';

test('sektor vjetra (odakle duva), 8 strana', () => {
  assert.equal(windSector(0), 0);
  assert.equal(windSector(22), 0);
  assert.equal(windSector(23), 1);
  assert.equal(windSector(315), 7);
  assert.equal(windSector(359), 0);
});

test('čeka odgovara vjetru samo ako je smjer među dozvoljenima', () => {
  assert.equal(suitsStand(300, [6, 7]), true);
  assert.equal(suitsStand(90, [6, 7]), false);
  assert.equal(suitsStand(90, []), null, 'bez zadanih smjerova nema presude');
});

test('konus mirisa ide NIZ vjetar', () => {
  const o = { lat: 44.88, lon: 16.15 };
  const p = destination(o, 90, 1000);
  assert.ok(Math.abs(haversine(o, p) - 1000) < 1);
  assert.ok(Math.abs(bearing(o, p) - 90) < 0.1);
  // Vjetar sa zapada (270) nosi miris prema istoku.
  const cone = scentCone(o, 270, 400, 20);
  assert.deepEqual(cone[0], [o.lat, o.lon]);
  const tip = cone[Math.floor(cone.length / 2)];
  assert.ok(Math.abs(bearing(o, { lat: tip[0], lon: tip[1] }) - 90) < 1);
  assert.ok(Math.abs(haversine(o, { lat: tip[0], lon: tip[1] }) - 400) < 1);
});

const H = 3600;
const fc = {
  hourly: {
    time: [1763542800, 1763542800 + H, 1763542800 + 2 * H],
    wind_speed_10m: [2.1, 3.4, 5],
    wind_direction_10m: [300, 310, 320],
    wind_gusts_10m: [4, 6.5, 9],
  },
};

test('prognoza: trenutni sat iz keša, a zastarjela prognoza se NE prikazuje kao trenutna', () => {
  const parsed = parseForecast(fc, 1000);
  assert.equal(parsed.preuzeto, 1000);
  assert.deepEqual(currentWind(parsed, (1763542800 + H + 1200) * 1000), { brzina: 3.4, smjer: 310, udari: 6.5, sat: (1763542800 + H) * 1000 });
  assert.equal(currentWind(parsed, (1763542800 + 5 * H) * 1000), null, 'jučerašnji/stari vjetar nije trenutni');
  assert.equal(currentWind(parsed, (1763542800 - 1) * 1000), null);
});

test('starost prognoze', () => {
  assert.equal(ageText(0, 30 * 1000), 'prognoza preuzeta upravo');
  assert.equal(ageText(0, 25 * 60000), 'prognoza preuzeta prije 25 min');
  assert.equal(ageText(0, 5 * 3600000), 'prognoza preuzeta prije 5 h');
  assert.equal(ageText(0, 50 * 3600000), 'prognoza preuzeta prije 2 dana');
});

test('termika kao pravilo palca: danju uzbrdo, navečer i noću nizbrdo', () => {
  const sun = { izlazak: 6 * H * 1000, zalazak: 16 * H * 1000 };
  assert.match(thermalHint(90, sun, 12 * H * 1000), /uzbrdo.*prema I/);
  assert.match(thermalHint(90, sun, 18 * H * 1000), /nizbrdo.*prema Z/);
  assert.match(thermalHint(90, sun, 6.5 * H * 1000), /okreće/);
  assert.equal(thermalHint(null, sun, 12 * H * 1000), null, 'ravan teren / bez DEM-a nema savjeta');
});

test('čeke i zakloni imaju vjetar, ostali objekti ne', () => {
  assert.equal(isStandType('ceka_visoka'), true);
  assert.equal(isStandType('zaklon'), true);
  assert.equal(isStandType('hraniliste'), false);
});

test('Terrarium DEM: dekodiranje, piksel u pločici, smjer uzbrdo', () => {
  assert.equal(decodeTerrarium(130, 0, 0), 512);
  assert.equal(decodeTerrarium(128, 0, 128), 0.5);
  const t = tilePixel(44.88, 16.15, 13);
  assert.equal(t.x, 4463);
  assert.equal(t.y, 2950);
  assert.ok(t.px >= 0 && t.px < 256 && t.py >= 0 && t.py < 256);
  assert.equal(Math.round(uphillAspect(1, 0)), 90, 'raste prema istoku');
  assert.equal(Math.round(uphillAspect(0, -1)), 0, 'raste prema sjeveru (y piksela raste prema jugu)');
  assert.equal(uphillAspect(0, 0), null);
});

import { weatherLabel, hasWeather, currentHour, hoursOfDay, daySummary, windStrength, windBlowsTo } from '../../static/js/vrijeme.js';

test('vrijeme: opis, jačina vjetra i smjer u koji duva', () => {
  assert.equal(weatherLabel(0), 'Vedro');
  assert.equal(weatherLabel(63), 'Kiša');
  assert.equal(weatherLabel(95), 'Grmljavina');
  assert.equal(weatherLabel(null), '—');
  assert.equal(windStrength(0.2), 'bez vjetra');
  assert.equal(windStrength(5), 'umjeren vjetar');
  assert.equal(windStrength(20), 'olujni vjetar');
  assert.equal(windBlowsTo(225), 45);
  assert.equal(windBlowsTo(10), 190);
});

test('vrijeme: sati lokalnog dana, tekući sat i sažetak; stari keš bez temperature se prepoznaje', () => {
  const d0 = new Date(2026, 10, 22).getTime();
  const sati = Array.from({ length: 48 }, (_, i) => ({ t: d0 + i * 3600000, temp: i, padavine: i === 5 ? 1.25 : 0, brzina: 2, udari: i === 9 ? 9 : 4 }));
  const fc = { preuzeto: 0, sati };
  const now = d0 + 10.5 * 3600000;
  assert.equal(hoursOfDay(fc, now).length, 24);
  assert.equal(currentHour(fc, now).temp, 10);
  assert.equal(currentHour(fc, d0 + 100 * 3600000), null);
  assert.deepEqual(daySummary(hoursOfDay(fc, now)), { min: 0, max: 23, padavine: 1.3, najjaciUdar: 9 });
  assert.equal(hasWeather(fc), true);
  assert.equal(hasWeather({ sati: [{ t: 1, brzina: 2 }] }), false);
  assert.equal(daySummary([]), null);
});

test('parseForecast nosi i temperaturu, padavine, oblake i kod vremena', () => {
  const p = parseForecast({ hourly: { time: [1], wind_speed_10m: [1], wind_direction_10m: [90], wind_gusts_10m: [2], temperature_2m: [7.5], precipitation: [0.2], cloud_cover: [80], weather_code: [3] } });
  assert.deepEqual(p.sati[0], { t: 1000, brzina: 1, smjer: 90, udari: 2, temp: 7.5, padavine: 0.2, oblaci: 80, kod: 3 });
});
