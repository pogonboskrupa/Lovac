import test from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteHunt } from '../../static/js/lov-brisanje.js';

const rec = (grupovodja) => ({ lov: { id: 'L' }, sekcija: grupovodja === undefined ? null : { grupovodja_id: grupovodja } });

test('lov brišu administrator i lovovođa sekcije tog lova; niko drugi', () => {
  assert.ok(canDeleteHunt(rec('g1'), { id: 'g1' }), 'lovovođa sekcije');
  assert.ok(canDeleteHunt(rec('g1'), { id: 'a1', is_admin: true }), 'admin');
  assert.ok(canDeleteHunt(rec(null), { id: 'a1', is_admin: true }), 'admin, sekcija bez lovovođe sekcije');
  assert.ok(canDeleteHunt(rec(undefined), { id: 'a1', is_admin: true }), 'admin, lov bez sekcije');
  assert.ok(!canDeleteHunt(rec('g1'), { id: 'g2' }), 'lovovođa sekcije druge sekcije');
  assert.ok(!canDeleteHunt(rec('g1'), { id: 'l1' }), 'obični član');
  assert.ok(!canDeleteHunt(rec(null), { id: 'g1' }), 'sekcija bez lovovođe sekcije nije ničija');
  assert.ok(!canDeleteHunt(rec(undefined), { id: 'g1' }), 'lov bez sekcije: samo admin');
  assert.ok(!canDeleteHunt(null, { id: 'a1', is_admin: true }));
  assert.ok(!canDeleteHunt(rec('g1'), null));
});
