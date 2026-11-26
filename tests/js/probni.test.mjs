import test from 'node:test';
import assert from 'node:assert/strict';
import { hasAppAccess, inTrial, trialDaysLeft, trialBannerText, waitingText } from '../../static/js/probni.js';
import { decideStartScreen } from '../../static/js/auth.js';

const NOW = Date.parse('2026-11-23T10:00:00Z');
const day = 86400000;

test('probni period: aplikacija radi dok traje, poslije ekran čekanja', () => {
  const trial = { id: 'u', odobren: false, probni_do: new Date(NOW + 3.2 * day).toISOString() };
  const expired = { id: 'u', odobren: false, probni_do: new Date(NOW - 1000).toISOString() };
  const none = { id: 'u', odobren: false, probni_do: null };
  assert.equal(hasAppAccess(trial, NOW), true);
  assert.equal(hasAppAccess(expired, NOW), false);
  assert.equal(hasAppAccess(none, NOW), false);
  assert.equal(hasAppAccess({ odobren: true }, NOW), true);
  assert.equal(inTrial({ odobren: true, probni_do: trial.probni_do }, NOW), false);
  assert.equal(trialDaysLeft(trial, NOW), 4);
  assert.match(trialBannerText(trial, NOW), /još 4 dana/);
  assert.match(trialBannerText({ odobren: false, probni_do: new Date(NOW + 0.5 * day).toISOString() }, NOW), /još 12 h\./);
  assert.match(waitingText(expired), /istekao/);
  assert.match(waitingText(none), /lovovođa sekcije/);
});

test('početni ekran: probni lovac ulazi na kartu', () => {
  const future = new Date(Date.now() + day).toISOString();
  assert.equal(decideStartScreen({ odobren: false, probni_do: future }, true), 'mapa');
  assert.equal(decideStartScreen({ odobren: false, probni_do: null }, true), 'cekanje');
});
