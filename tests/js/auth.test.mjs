import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syntheticEmail, normalizeNamePart, validatePin, validateName, validateNadimak, decideStartScreen, isAuthRejection,
} from '../../static/js/auth.js';

test('interni email iz imena i prezimena (dijakritika)', () => {
  assert.equal(normalizeNamePart('  Đuro '), 'djuro');
  assert.equal(syntheticEmail('Šaćir', 'Čehić-Ćorić'), 'sacir.cehic-coric@lovci.grmec.app');
  assert.throws(() => syntheticEmail('', 'X'));
});

test('PIN 6 do 8 cifara', () => {
  assert.equal(validatePin('123456'), null);
  assert.equal(validatePin('12345678'), null);
  assert.ok(validatePin('1234'));
  assert.ok(validatePin('123456789'));
  assert.ok(validatePin('12a456'));
});

test('ime', () => {
  assert.equal(validateName('Ab'), null);
  assert.ok(validateName('A'));
  assert.ok(validateName('!!!'));
});

test('početni ekran se odlučuje bez mreže', () => {
  assert.equal(decideStartScreen(null, true), 'prijava');
  assert.equal(decideStartScreen({ odobren: false }, true), 'cekanje');
  assert.equal(decideStartScreen({ odobren: true }, true), 'mapa');
  assert.equal(decideStartScreen(null, false), 'mapa');
});

test('mrežna greška nije odbijena sesija', () => {
  assert.equal(isAuthRejection({ name: 'TimeoutError' }), false);
  assert.equal(isAuthRejection({ name: 'AuthRetryableFetchError', status: 0 }), false);
  assert.equal(isAuthRejection({ status: 401 }), true);
  assert.equal(isAuthRejection({ code: 'PGRST301' }), true);
});

test('nadimak ili broj člana razlikuje lovce istog imena', () => {
  assert.equal(syntheticEmail('Mujo', 'Mujić', ''), 'mujo.mujic@lovci.grmec.app');
  assert.equal(syntheticEmail('Mujo', 'Mujić', '  '), 'mujo.mujic@lovci.grmec.app');
  assert.equal(syntheticEmail('Mujo', 'Mujić', '127'), 'mujo.mujic.127@lovci.grmec.app');
  assert.equal(syntheticEmail('Mujo', 'Mujić', 'Mali Đuro'), 'mujo.mujic.mali-djuro@lovci.grmec.app');
  assert.notEqual(syntheticEmail('Mujo', 'Mujić'), syntheticEmail('Mujo', 'Mujić', '2'));
});

test('nadimak je neobavezan, ali ako postoji mora biti ispravan', () => {
  assert.equal(validateNadimak(''), null);
  assert.equal(validateNadimak(null), null);
  assert.equal(validateNadimak('127'), null);
  assert.ok(validateNadimak('!!!'));
  assert.ok(validateNadimak('x'.repeat(21)));
});
