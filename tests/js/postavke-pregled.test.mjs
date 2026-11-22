import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, storageSummary, syncAgeText, syncText, backupAdvice } from '../../static/js/postavke-pregled.js';

const NOW = 1_700_000_000_000;

test('formatBytes: B, KB, MB, GB sa zarezom; neispravno daje crticu', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1536), '1,5 KB');
  assert.equal(formatBytes(5 * 1024 ** 2), '5,0 MB');
  assert.equal(formatBytes(120 * 1024 ** 2), '120 MB');
  assert.equal(formatBytes(3.2 * 1024 ** 3), '3,2 GB');
  assert.equal(formatBytes(NaN), '—');
  assert.equal(formatBytes(-1), '—');
});

test('storageSummary: postotak, upozorenje od 80 %, nedostupno', () => {
  const a = storageSummary({ usage: 50 * 1024 ** 2, quota: 1024 ** 3 }, true);
  assert.equal(a.postotak, 4.9);
  assert.equal(a.upozorenje, false);
  assert.equal(a.zasticena, true);
  assert.match(a.tekst, /^Zauzeto 50 MB od 1,0 GB \(4,9 %\)$/);
  assert.equal(storageSummary({ usage: 900, quota: 1000 }).upozorenje, true);
  assert.equal(storageSummary({ usage: 2000, quota: 1000 }).postotak, 100);
  assert.equal(storageSummary(null).postotak, null);
  assert.equal(storageSummary({ usage: 1, quota: 0 }).postotak, null);
});

test('syncAgeText i syncText', () => {
  assert.equal(syncAgeText(NOW - 20000, NOW), 'upravo');
  assert.equal(syncAgeText(NOW - 5 * 60000, NOW), 'prije 5 min');
  assert.equal(syncAgeText(NOW - 3 * 3600000, NOW), 'prije 3 h');
  assert.equal(syncAgeText(NOW - 86400000, NOW), 'prije 1 dan');
  assert.equal(syncAgeText(NOW - 10 * 86400000, NOW), 'prije 10 dana');
  assert.equal(syncAgeText(undefined, NOW), 'još nikad');
  assert.equal(syncText(0, NOW - 60000, NOW), 'sve je poslano · zadnje slanje prije 1 min');
  assert.equal(syncText(3, undefined, NOW), 'čeka slanje: 3 · zadnje slanje još nikad');
});

test('backupAdvice: bez podataka ok, nikad = nema, 30+ dana = stara', () => {
  assert.deepEqual(backupAdvice(undefined, false, NOW), { stanje: 'ok', tekst: 'Nema podataka za kopiranje' });
  assert.equal(backupAdvice(undefined, true, NOW).stanje, 'nema');
  assert.equal(backupAdvice(NOW - 29 * 86400000, true, NOW).stanje, 'ok');
  const old = backupAdvice(NOW - 30 * 86400000, true, NOW);
  assert.equal(old.stanje, 'stara');
  assert.match(old.tekst, /prije 30 dana — napravi novu/);
});
