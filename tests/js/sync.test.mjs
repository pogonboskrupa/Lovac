import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toServerRow, fromServerRow, shouldReplaceLocal, nextDelay } from '../../static/js/sync.js';

const ME = 'me-uuid';

test('red za server: lokalna polja se ne šalju, vlasnik je uvijek prijavljeni korisnik', () => {
  const rec = {
    id: 'a', naziv: 'Čeka', vrsta: 'ceka_visoka', lat: 44.88, lon: 16.15, rev: 3, vidljivost: 'drustvo', dijeli_sa: [],
    created_at: 1000, updated_at: 2000, sinhronizovano: false, tudji: false, vlasnik_id: 'neko-drugi', fotografije: ['f1'], udaljenost: 12,
  };
  const row = toServerRow('objekti', rec, ME);
  assert.equal(row.vlasnik_id, ME);
  assert.deepEqual(row.podaci, { naziv: 'Čeka', vrsta: 'ceka_visoka' });
  assert.equal(row.rev, 3);
  assert.equal(row.vidljivost, 'drustvo');
  assert.equal(row.created_at, new Date(1000).toISOString());
  assert.equal(row.obrisan, false);
});

test('zadana vidljivost je privatno', () => {
  assert.equal(toServerRow('objekti', { id: 'x', lat: 1, lon: 1 }, ME).vidljivost, 'privatno');
});

test('trag: pozicija iz prve tačke, vremena iz starta/kraja', () => {
  const row = toServerRow('tragovi', { id: 't', start: 5000, kraj: 9000, status: 'gotovo', tacke: [{ lat: 44.9, lon: 16.2, t: 5000 }], pauze: [], rev: 2 }, ME);
  assert.equal(row.lat, 44.9);
  assert.equal(row.lon, 16.2);
  assert.equal(row.created_at, new Date(5000).toISOString());
  assert.equal(row.podaci.tacke.length, 1);
});

test('brisanje ide kao nadgrobni zapis', () => {
  const row = toServerRow('opazanja', { id: 'o', obrisan: true, rev: 4, updated_at: 1 }, ME);
  assert.deepEqual(row, { id: 'o', vlasnik_id: ME, obrisan: true, rev: 4, updated_at: new Date(1).toISOString(), podaci: {} });
});

test('red sa servera: tuđi zapis se označava (ne uređuje se, ne šalje nazad)', () => {
  const row = { id: 'a', vlasnik_id: 'drugi', vidljivost: 'drustvo', dijeli_sa: null, lat: 1, lon: 2, podaci: { naziv: 'X' }, rev: 2,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' };
  const r = fromServerRow(row, ME);
  assert.equal(r.tudji, true);
  assert.equal(r.naziv, 'X');
  assert.deepEqual(r.dijeli_sa, []);
  assert.equal(r.sinhronizovano, true);
  assert.equal(fromServerRow({ ...row, vlasnik_id: ME }, ME).tudji, false);
});

test('lokalna neposlana izmjena ima prednost nad starijom/istom sa servera', () => {
  assert.equal(shouldReplaceLocal(null, { rev: 1 }), true);
  assert.equal(shouldReplaceLocal({ rev: 3, sinhronizovano: false }, { rev: 2 }), false);
  assert.equal(shouldReplaceLocal({ rev: 3, sinhronizovano: false }, { rev: 3 }), false);
  assert.equal(shouldReplaceLocal({ rev: 3, sinhronizovano: false }, { rev: 4 }), true);
  assert.equal(shouldReplaceLocal({ rev: 3, sinhronizovano: true }, { rev: 3 }), true);
  assert.equal(shouldReplaceLocal({ rev: 5, sinhronizovano: true }, { rev: 4 }), false);
});

test('backoff raste i ima gornju granicu', () => {
  assert.equal(nextDelay(0), 5000);
  assert.equal(nextDelay(3), 40000);
  assert.equal(nextDelay(30), 10 * 60000);
});

import { needsSending } from '../../static/js/sync.js';

test('mreža sigurnosti: šta se šalje', () => {
  assert.equal(needsSending('objekti', { sinhronizovano: false }), true);
  assert.equal(needsSending('objekti', { sinhronizovano: true }), false);
  assert.equal(needsSending('objekti', { sinhronizovano: false, tudji: true }), false);
  assert.equal(needsSending('objekti', {}), false, 'stari zapis bez polja se ne šalje naslijepo');
  assert.equal(needsSending('tragovi', { sinhronizovano: false, status: 'snima', vrsta: 'obilazak' }), false);
  assert.equal(needsSending('tragovi', { sinhronizovano: false, status: 'snima', vrsta: 'potraga' }), true);
  assert.equal(needsSending('tragovi', { sinhronizovano: false, status: 'gotovo' }), true);
});

import { withDeadline, isNetworkFailure } from '../../static/js/sync.js';

test('visi poziv se prekida rokom (inače red slanja ostaje zaglavljen)', async () => {
  let aborted = false;
  await assert.rejects(
    withDeadline((signal) => new Promise(() => { signal.addEventListener('abort', () => { aborted = true; }); }), 30),
    (e) => e.name === 'TimeoutError',
  );
  assert.equal(aborted, true);
  assert.equal(await withDeadline(async () => 7, 1000), 7);
});

test('greška veze se razlikuje od odbijanja servera', () => {
  assert.equal(isNetworkFailure(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
  assert.equal(isNetworkFailure(new TypeError('Failed to fetch')), true);
  assert.equal(isNetworkFailure({ code: '42501', message: 'row-level security' }), false);
  assert.equal(isNetworkFailure({ status: 500, message: 'network' }), false);
});

test('greška iz klijenta (postgrest) o mrtvoj vezi je greška veze', () => {
  assert.equal(isNetworkFailure({ message: 'TimeoutError: Server nije odgovorio za 12 s', code: '', details: '' }), true);
  assert.equal(isNetworkFailure({ message: 'TypeError: Failed to fetch', code: '' }), true);
});

import { isPolicyRejection, belongsToOther } from '../../static/js/sync.js';

test('RLS odbijanje se razlikuje od mrtve veze i od 503', () => {
  assert.equal(isPolicyRejection({ code: '42501', message: 'x' }), true);
  assert.equal(isPolicyRejection({ message: 'new row violates row-level security policy (USING expression) for table "tragovi"' }), true);
  assert.equal(isPolicyRejection({ message: 'server privremeno nedostupan' }), false);
  assert.equal(isPolicyRejection({ message: 'TypeError: Failed to fetch' }), false);
});
test('zapis drugog naloga na istom telefonu se ne šalje kao moj', () => {
  assert.equal(belongsToOther('a', 'b'), true);
  assert.equal(belongsToOther('a', 'a'), false);
  assert.equal(belongsToOther(undefined, 'b'), false, 'stari zapis bez oznake ostaje moj');
});
