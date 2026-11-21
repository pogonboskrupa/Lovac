import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terenUrl, TEREN_FILE, splitMaps, terenStatus } from '../../static/js/karte-ui.js';
import { BASE_CHOICES, resolveBase } from '../../static/js/map.js';

test('Teren se preuzima sa Release-a "karte" istog repozitorija', () => {
  assert.equal(TEREN_FILE, 'teren.mbtiles');
  assert.equal(terenUrl('pogonboskrupa/Lovac'), 'https://github.com/pogonboskrupa/Lovac/releases/download/karte/teren.mbtiles');
});

test('fajl terena se izdvaja iz spiska offline karata (ne prikazuje se kao sloj)', () => {
  const list = [{ id: 'teren.mbtiles', minzoom: 8, maxzoom: 16 }, { id: 'moja.mbtiles' }];
  const { teren, ostale } = splitMaps(list);
  assert.equal(teren.id, 'teren.mbtiles');
  assert.deepEqual(ostale.map((m) => m.id), ['moja.mbtiles']);
  assert.deepEqual(splitMaps([{ id: 'x.mbtiles' }]).teren, null);
});

test('stanje terena: bez aplikacije, nije preuzet, preuzet', () => {
  assert.equal(terenStatus(false, null).stanje, 'bez-aplikacije');
  assert.match(terenStatus(false, null).tekst, /aplikaciji/);
  assert.equal(terenStatus(true, null).stanje, 'nema');
  assert.match(terenStatus(true, null).tekst, /nije preuzet/i);
  const t = terenStatus(true, { id: 'teren.mbtiles', minzoom: 8, maxzoom: 16, velicina: 314572800 });
  assert.equal(t.stanje, 'preuzet');
  assert.match(t.tekst, /300 MB/);
  assert.match(t.tekst, /zoom 8–16/);
});

test('izbor podloge na mapi: Topo, Satelit, Teren (OSM više nije ponuđen)', () => {
  assert.deepEqual(BASE_CHOICES, ['topo', 'satelit', 'teren']);
  assert.equal(resolveBase('satelit', { terenReady: false }), 'satelit');
  assert.equal(resolveBase('osm', { terenReady: false }), 'topo', 'staro sačuvano OSM pada na Topo');
  assert.equal(resolveBase('teren', { terenReady: false }), 'topo', 'bez preuzetog terena ostaje Topo');
  assert.equal(resolveBase('teren', { terenReady: true }), 'teren');
  assert.equal(resolveBase(undefined, { terenReady: true }), 'topo');
});
