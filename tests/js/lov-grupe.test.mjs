import test from 'node:test';
import assert from 'node:assert/strict';
import { huntTargets, canManageHunt, organizableSections, leadsRevir } from '../../static/js/lov-traje.js';
import { canApprove } from '../../static/js/sekcije.js';

const S = { id: 's1', revir_id: 'r1', naziv: 'Krupa 1', grupovodja_id: 'lvs', aktivno: true };
const ctx = (extra = {}) => ({
  sekcije: [S], clanovi: [
    { sekcija_id: 's1', korisnik_id: 'gv', status: 'odobren', grupa_id: 'g1' },
    { sekcija_id: 's1', korisnik_id: 'clan', status: 'odobren', grupa_id: 'g1' },
  ],
  lovocuvari: [], grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'gv', dozvola_visih: false }], revirVodje: [], drustvoUloge: [], ...extra,
});
const me = (id, is_admin = false) => ({ id, is_admin });
const ids = (list) => list.map((t) => t.grupaId);

test('lov po grupi: ko za šta smije praviti lov', () => {
  assert.deepEqual(ids(huntTargets(S, ctx(), me('gv'))), ['g1']); // grupovođa samo svoju grupu
  assert.deepEqual(ids(huntTargets(S, ctx(), me('lvs'))), [null]); // lovovođa sekcije: cijela sekcija, grupa tek uz dopuštenje
  const dozvola = ctx({ grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'gv', dozvola_visih: true }] });
  assert.deepEqual(ids(huntTargets(S, dozvola, me('lvs'))), ['g1', null]); // grupa je zadani izbor, cijela sekcija zadnja
  assert.deepEqual(ids(huntTargets(S, dozvola, me('adm', true))), ['g1', null]);
  assert.deepEqual(ids(huntTargets(S, ctx({ revirVodje: [{ korisnik_id: 'rv', revir_id: 'r1' }] }), me('rv'))), ['g1', null]); // lovovođa revira uvijek
  assert.deepEqual(huntTargets(S, ctx({ revirVodje: [{ korisnik_id: 'rv', revir_id: 'r2' }] }), me('rv')), []); // tuđi revir
  assert.deepEqual(huntTargets(S, ctx(), me('clan')), []);
  assert.equal(organizableSections(ctx(), me('gv')).length, 1);
  assert.equal(organizableSections(ctx(), me('clan')).length, 0);
  assert.ok(leadsRevir({ drustvoUloge: [{ korisnik_id: 'ld', uloga: 'lovovodja_drustva' }] }, me('ld'), 'bilo koji'));
});

test('lov po grupi: ko upravlja tim lovom', () => {
  const lovGrupe = { lov: { id: 'l1', sekcija_id: 's1', revir_id: 'r1', grupa_id: 'g1', organizator_id: 'gv' } };
  assert.ok(canManageHunt(lovGrupe, ctx(), me('gv')));
  assert.ok(!canManageHunt(lovGrupe, ctx(), me('lvs')), 'lovovođa sekcije bez dopuštenja');
  assert.ok(!canManageHunt(lovGrupe, ctx(), me('adm', true)), 'ni admin bez dopuštenja');
  const dozvola = ctx({ grupe: [{ id: 'g1', sekcija_id: 's1', grupovodja_id: 'gv', dozvola_visih: true }] });
  assert.ok(canManageHunt(lovGrupe, dozvola, me('lvs')) && canManageHunt(lovGrupe, dozvola, me('adm', true)));
  assert.ok(canManageHunt(lovGrupe, ctx({ revirVodje: [{ korisnik_id: 'rv', revir_id: 'r1' }] }), me('rv')));
  const lovSekcije = { lov: { id: 'l2', sekcija_id: 's1', revir_id: 'r1', grupa_id: null, organizator_id: 'lvs' } };
  assert.ok(canManageHunt(lovSekcije, ctx(), me('lvs')) && canManageHunt(lovSekcije, ctx(), me('adm', true)));
  assert.ok(!canManageHunt(lovSekcije, ctx(), me('gv')), 'grupovođa ne vodi lov cijele sekcije');
});

test('prijem članova: lovovođa revira i društva odobravaju zahtjeve', () => {
  const user = (id) => ({ id });
  assert.ok(!canApprove(S, user('rv'), [], {}));
  assert.ok(canApprove(S, user('rv'), [], { revirVodje: [{ korisnik_id: 'rv', revir_id: 'r1' }] }));
  assert.ok(!canApprove(S, user('rv'), [], { revirVodje: [{ korisnik_id: 'rv', revir_id: 'r2' }] }));
  assert.ok(canApprove(S, user('ld'), [], { drustvoUloge: [{ korisnik_id: 'ld', uloga: 'lovovodja_drustva' }] }));
});
