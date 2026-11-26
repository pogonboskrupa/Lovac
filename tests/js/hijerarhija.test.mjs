import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandKeepers, drustvoSlot, revirVodjaTargets, hierarchyChips, MAX_LOVOCUVARA } from '../../static/js/hijerarhija.js';
import { profileRoles } from '../../static/js/profil.js';

const reviri = [{ id: 'R1', naziv: 'Krupa' }, { id: 'R2', naziv: 'Otoka' }, { id: 'R3', naziv: 'Jezerski' }];

test('lovočuvar društva važi za svaki revir, bez duplikata sa starim po-revirskim', () => {
  const out = expandKeepers([{ korisnik_id: 'a', revir_id: 'R1' }], [{ korisnik_id: 'a', uloga: 'lovocuvar' }, { korisnik_id: 'b', uloga: 'lovovodja_drustva' }], reviri);
  assert.equal(out.length, 3); // a: R1 (staro) + R2 + R3; lovovođa društva nije lovočuvar
  assert.deepEqual(out.filter((x) => x.drustvo).map((x) => x.revir_id).sort(), ['R2', 'R3']);
});

test('mjesta društva: najviše 2 lovočuvara i 1 lovovođa; kaže ko ih drži', () => {
  const rows = [{ korisnik_id: 'a', uloga: 'lovocuvar' }, { korisnik_id: 'b', uloga: 'lovocuvar' }, { korisnik_id: 'c', uloga: 'lovovodja_drustva' }];
  const ime = (id) => ({ a: 'Ado', b: 'Bego', c: 'Cero' })[id];
  assert.equal(MAX_LOVOCUVARA, 2);
  const x = drustvoSlot('d', 'lovocuvar', rows, ime);
  assert.equal(x.slobodno, false);
  assert.deepEqual(x.zauzeli, ['Ado', 'Bego']);
  assert.equal(drustvoSlot('a', 'lovocuvar', rows, ime).slobodno, true); // već ima ulogu: može je skinuti
  assert.equal(drustvoSlot('d', 'lovovodja_drustva', rows, ime).slobodno, false);
  assert.equal(drustvoSlot('d', 'lovocuvar', rows.slice(0, 1), ime).slobodno, true);
});

test('lovovođa revira: ponuda reviri bez njega, uz sadašnjeg koga zamjenjuje', () => {
  const vodje = [{ revir_id: 'R1', korisnik_id: 'x' }, { revir_id: 'R2', korisnik_id: 'a' }];
  const t = revirVodjaTargets('a', reviri, vodje, (id) => (id === 'x' ? 'Xaver' : id));
  assert.deepEqual(t.map((r) => r.id), ['R1', 'R3']);
  assert.equal(t[0].trenutni, 'Xaver');
  assert.equal(t[1].trenutni, '');
});

test('čipovi uloga: društvo i revir; lovočuvar društva se ne ponavlja po revirima', () => {
  const ctx = { reviri, drustvoUloge: [{ korisnik_id: 'a', uloga: 'lovocuvar' }], revirVodje: [{ revir_id: 'R2', korisnik_id: 'a' }], lovocuvari: expandKeepers([], [{ korisnik_id: 'a', uloga: 'lovocuvar' }], reviri), sekcije: [], grupovodje: [] };
  assert.deepEqual(hierarchyChips('a', ctx).map((c) => c.tekst), ['Lovočuvar društva', 'Lovovođa revira · Otoka']);
  const chips = profileRoles({ id: 'a', odobren: true }, ctx).map((c) => c.tekst);
  assert.deepEqual(chips, ['Lovočuvar društva', 'Lovovođa revira · Otoka']);
});
