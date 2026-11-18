import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  syntheticEmail, normalizeNamePart, validatePin, validateName, decideStartScreen, isAuthRejection,
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
