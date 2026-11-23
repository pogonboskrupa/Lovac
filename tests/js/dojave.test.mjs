import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDojava, newDojava, defaultRevir, keeperRevirs, sortForKeeper, mergeDojave, dojavaAlerts, vrstaNaziv } from '../../static/js/dojave.js';

test('dojava traži vrstu, revir i lokaciju', () => {
  assert.equal(validateDojava({ vrsta: 'krivolov', revir_id: 'R', lat: 44.8, lon: 16.1 }), null);
  assert.match(validateDojava({ vrsta: 'x', revir_id: 'R', lat: 1, lon: 1 }), /Izaberi/);
  assert.match(validateDojava({ vrsta: 'pas', revir_id: '', lat: 1, lon: 1 }), /revir/);
  assert.match(validateDojava({ vrsta: 'pas', revir_id: 'R', lat: NaN, lon: 1 }), /lokacije/);
  assert.equal(vrstaNaziv('ranjena'), 'Ranjena divljač');
});

test('nova dojava: zaokružena lokacija, prazan opis = null, status nova, čeka slanje', () => {
  const d = newDojava({ id: 'D', autorId: 'A', vrsta: 'ubijena', revirId: 'R', opis: '  ', lat: 44.123456789, lon: 16.987654321, now: new Date('2026-11-23T08:00:00Z') });
  assert.deepEqual(d, { id: 'D', autor_id: 'A', revir_id: 'R', vrsta: 'ubijena', opis: null, lat: 44.123457, lon: 16.987654, slika: null,
    created_at: '2026-11-23T08:00:00.000Z', status: 'nova', sinhronizovano: false });
});

test('revir dojave: moja sekcija, inače revir gdje sam lovočuvar', () => {
  const ctx = { sekcije: [{ id: 'S1', revir_id: 'R1', grupovodja_id: 'g' }], clanovi: [{ sekcija_id: 'S1', korisnik_id: 'c', status: 'odobren' }],
    lovocuvari: [{ korisnik_id: 'l', revir_id: 'R2' }], reviri: [{ id: 'R1' }, { id: 'R2' }] };
  assert.equal(defaultRevir(ctx, 'c'), 'R1');
  assert.equal(defaultRevir(ctx, 'g'), 'R1');
  assert.equal(defaultRevir(ctx, 'l'), 'R2');
  assert.equal(defaultRevir(ctx, 'x'), null);
  assert.deepEqual(keeperRevirs(ctx, { id: 'l' }), ['R2']);
  assert.deepEqual(keeperRevirs(ctx, { id: 'a', is_admin: true }), ['R1', 'R2']);
  assert.deepEqual(keeperRevirs(ctx, { id: 'c' }), []);
});

test('lovočuvar vidi nove prve; spajanje; obavijest za novu tuđu i promjenu moje', () => {
  const list = [{ id: '1', status: 'rijesena', created_at: '3' }, { id: '2', status: 'nova', created_at: '1' }, { id: '3', status: 'nova', created_at: '2' }];
  assert.deepEqual(sortForKeeper(list).map((d) => d.id), ['3', '2', '1']);
  assert.deepEqual(mergeDojave([{ id: '1', status: 'nova', sinhronizovano: false }], [{ id: '1', status: 'preuzeta' }]), [{ id: '1', status: 'preuzeta', sinhronizovano: true }]);
  const prev = [{ id: 'm', autor_id: 'ja', status: 'nova', revir_id: 'R' }];
  const next = [{ id: 'm', autor_id: 'ja', status: 'preuzeta', revir_id: 'R' }, { id: 't', autor_id: 'drugi', status: 'nova', revir_id: 'R' },
    { id: 'z', autor_id: 'drugi', status: 'nova', revir_id: 'X' }];
  assert.deepEqual(dojavaAlerts(prev, next, { myId: 'ja', revirs: ['R'] }).map((d) => d.id), ['m', 't']);
});
