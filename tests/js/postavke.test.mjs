import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeProfile } from '../../static/js/postavke.js';

test('opis naloga u postavkama', () => {
  assert.equal(describeProfile(null), 'Niste prijavljeni');
  assert.equal(describeProfile({ ime: 'Ado', prezime: 'Adić', odobren: true, is_admin: true }), 'Ado Adić · administrator');
  assert.equal(describeProfile({ ime: 'Mujo', prezime: 'Mujić', nadimak: '127', odobren: true }), 'Mujo Mujić (127) · lovac');
  assert.equal(describeProfile({ ime: 'Novi', prezime: 'Lovac', odobren: false }), 'Novi Lovac · čeka odobrenje');
});
