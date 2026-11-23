import test from 'node:test';
import assert from 'node:assert/strict';
import { explorerView, coversScreen, eyeRatio } from '../../static/js/rotacija.js';

const EKRANI = [[360, 740], [412, 839], [412, 915], [800, 1280]];
const ROTS = [0, 20, 45, 90, 135, 200, 315];

test('staro stanje: kontejner 160 % ekrana, uvećanje 1,6 i perspektiva 900 ostavlja ivice na okrenutoj karti', () => {
  const old = { side: 360 * 1.6, scale: 1.6, p: 900, maxL: Infinity };
  assert.equal(coversScreen(360, 740, 90, 55, old), false);
});

test('pogled pokriva cijeli ekran (ispod magle) za svaki nagib i okret', () => {
  for (const [w, h] of EKRANI) for (const tilt of [25, 40, 55]) {
    const v = explorerView(w, h, tilt);
    for (const r of ROTS) assert.ok(coversScreen(w, h, r, tilt, v), `${w}×${h} nagib ${tilt} okret ${r}`);
  }
});

test('nijedan ugao ravni ne dolazi do oka (inače preglednik odsiječe ravan i ne crta kontrole)', () => {
  for (const [w, h] of EKRANI) for (const tilt of [25, 40, 55]) {
    const v = explorerView(w, h, tilt);
    assert.ok(eyeRatio(v.side, v.scale, tilt, v.p) <= 0.9, `${w}×${h} nagib ${tilt}: ${eyeRatio(v.side, v.scale, tilt, v.p)}`);
  }
  // stara zamka: kontejner 240 % (visina 1776 px na 360×740) uz uvećanje 1,6 i perspektivu 900 prelazi oko
  assert.ok(eyeRatio(740 * 2.4, 1.6, 40, 900) > 1);
});

test('magla samo pri strmom nagibu', () => {
  assert.equal(explorerView(412, 839, 25).fog, 0);
  assert.ok(explorerView(412, 839, 55).fog > 0);
});
