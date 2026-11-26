import test from 'node:test';
import assert from 'node:assert/strict';
import { assignRole, ULOGE_NOVOG } from '../../static/js/uloge-dodjela.js';

// Lažni klijent: bilježi pozive, lanac .from().op().eq()/.select() vraća { data, error }.
function fakeSb(fail = null) {
  const calls = [];
  const chain = (rec) => {
    const q = { eq: (k, v) => { rec.eq = [...(rec.eq || []), [k, v]]; return q; }, select: () => q,
      then: (res) => res(fail === rec.t ? { data: null, error: { message: 'odbijeno' } } : { data: [{ id: 'g-nova' }], error: null }) };
    return q;
  };
  return {
    calls,
    from: (t) => ({
      insert: (v) => { const rec = { t, op: 'insert', v }; calls.push(rec); return chain(rec); },
      update: (v) => { const rec = { t, op: 'update', v }; calls.push(rec); return chain(rec); },
      delete: () => { const rec = { t, op: 'delete' }; calls.push(rec); return chain(rec); },
    }),
    rpc: async (n, a) => { calls.push({ t: n, op: 'rpc', v: a }); return { error: null }; },
  };
}
const sekcija = { id: 's1', revir_id: 'r1' };

test('uloga pri pravljenju korisnika: svaka uloga piše tačno ono što treba', async () => {
  let sb = fakeSb();
  await assignRole(sb, 'clan', { userId: 'u', sekcija });
  assert.equal(sb.calls.length, 0);
  sb = fakeSb(); await assignRole(sb, 'grupovodja_grupe', { userId: 'u', sekcija });
  assert.deepEqual(sb.calls.map((c) => `${c.op} ${c.t}`), ['insert grupe', 'rpc dodijeli_grupu']);
  assert.deepEqual(sb.calls[1].v, { p_sekcija: 's1', p_korisnik: 'u', p_grupa: 'g-nova' });
  sb = fakeSb(); await assignRole(sb, 'lovovodja_sekcije', { userId: 'u', sekcija });
  assert.deepEqual(sb.calls[0].v, { grupovodja_id: 'u' });
  sb = fakeSb(); await assignRole(sb, 'lovovodja_revira', { userId: 'u', sekcija });
  assert.deepEqual(sb.calls.map((c) => c.op), ['delete', 'insert']); // sadašnji se skida prvi
  sb = fakeSb(); await assignRole(sb, 'lovocuvar', { userId: 'u', sekcija });
  assert.deepEqual(sb.calls[0].v, { korisnik_id: 'u', uloga: 'lovocuvar' });
  await assert.rejects(() => assignRole(fakeSb('sekcije'), 'lovovodja_sekcije', { userId: 'u', sekcija }), /odbijeno/);
  assert.ok(ULOGE_NOVOG.some((r) => r.id === 'lovovodja_drustva'));
});

import { removeRole } from '../../static/js/uloge-dodjela.js';
test('skidanje uloge: svaka uloga briše tačno svoj red', async () => {
  const sek = { id: 's1', revir_id: 'r1' };
  let sb = fakeSb(); await removeRole(sb, 'predsjednik', { userId: 'u', sekcija: sek });
  assert.deepEqual(sb.calls.map((c) => `${c.op} ${c.t}`), ['delete drustvo_uloge']); assert.deepEqual(sb.calls[0].eq, [['korisnik_id', 'u'], ['uloga', 'predsjednik']]);
  sb = fakeSb(); await removeRole(sb, 'lovovodja_sekcije', { userId: 'u', sekcija: sek });
  assert.deepEqual(sb.calls[0].v, { grupovodja_id: null }); assert.deepEqual(sb.calls[0].eq, [['id', 's1'], ['grupovodja_id', 'u']]); // skida SAMO tog korisnika
  sb = fakeSb(); await removeRole(sb, 'lovovodja_revira', { userId: 'u', sekcija: sek });
  assert.deepEqual(sb.calls[0].eq, [['revir_id', 'r1'], ['korisnik_id', 'u']]);
  sb = fakeSb(); await removeRole(sb, 'grupovodja_grupe', { userId: 'u', sekcija: sek, grupaId: 'g9' });
  assert.deepEqual(sb.calls[0].eq, [['id', 'g9']]);
});
