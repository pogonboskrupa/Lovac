import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missingOnServer, retryLater, recipientsFrom, filterRecipients, validateSend, newSends, newInboxIds, expiryText, sentStatus, inboxSummary, MAX_PRIMALACA,
} from '../../static/js/slike-lovcima.js';

const M = [
  { id: 'a', ime: 'Šefik', prezime: 'Zukić' }, { id: 'ja', ime: 'Ja', prezime: 'Ja' },
  { id: 'b', ime: 'Ćamil', prezime: 'Begić', nadimak: '12' }, { id: 'b', ime: 'Ćamil', prezime: 'Begić' },
];

test('slike lovcima: primaoci bez mene i bez duplikata, po prezimenu; pretraga bez dijakritika', () => {
  const r = recipientsFrom(M, 'ja');
  assert.deepEqual(r.map((m) => m.id), ['b', 'a']);
  assert.deepEqual(filterRecipients(r, 'camil').map((m) => m.id), ['b']);
  assert.deepEqual(filterRecipients(r, 'sefik').map((m) => m.id), ['a']);
  assert.equal(filterRecipients(r, ' ').length, 2);
});

test('slike lovcima: provjera prije slanja i jedan red po primaocu', () => {
  assert.match(validateSend({ primaoci: [], slika: 'data:x' }), /Izaberi/);
  assert.match(validateSend({ primaoci: ['a'], slika: null }), /Nema slike/);
  assert.match(validateSend({ primaoci: Array(MAX_PRIMALACA + 1).fill('a'), slika: 'x' }), /Najviše/);
  assert.equal(validateSend({ primaoci: ['a'], slika: 'x' }), null);
  const rows = newSends({ ids: ['1', '2'], primaoci: ['a', 'b'], slika: 'x', opis: '  trag  ', lat: 44.8, lon: NaN, now: 0 });
  assert.deepEqual(rows.map((r) => [r.id, r.primalac_id, r.opis, r.lat, r.lon]), [['1', 'a', 'trag', 44.8, null], ['2', 'b', 'trag', 44.8, null]]);
  assert.ok(!('posiljalac_id' in rows[0]) && !('istice' in rows[0]), 'pošiljaoca i rok postavlja server');
});

test('slike lovcima: nove u sandučiću, rok na serveru i stanje poslane', () => {
  assert.deepEqual(newInboxIds([{ id: '1' }, { id: '2' }], ['1']), ['2']);
  const now = Date.parse('2026-11-24T10:00:00Z');
  assert.equal(expiryText('2026-11-24T21:30:00Z', now), 'Na serveru još 11 h');
  assert.equal(expiryText('2026-11-24T10:20:00Z', now), 'Na serveru još 20 min');
  assert.equal(expiryText('2026-11-24T09:00:00Z', now), 'Rok na serveru je istekao');
  assert.equal(sentStatus({ poslano: false }, now).stanje, 'ceka');
  assert.match(sentStatus({ poslano: true, istice: '2026-11-24T21:30:00Z' }, now).tekst, /još 11 h/);
  assert.match(sentStatus({ poslano: true, istice: '2026-11-24T09:00:00Z' }, now).tekst, /ostala na telefonima/);
  assert.match(sentStatus({ odbijena: 'Previše' }, now).tekst, /Previše/);
  assert.equal(inboxSummary([{ novo: true }, { novo: true }]), '2 nove slike');
  assert.equal(inboxSummary([{}]), 'Primljeno: 1');
});

test('slike lovcima: server bez migracije 033 (tabela ne postoji) nije odbijanje — slika čeka u redu', () => {
  assert.equal(missingOnServer({ code: 'PGRST205', message: "Could not find the table 'public.slike_lovcima' in the schema cache" }), true);
  assert.equal(missingOnServer({ code: '42P01' }), true);
  assert.equal(missingOnServer({ code: '42501', message: 'row-level security' }), false);
  assert.equal(missingOnServer({ code: '54000', message: 'Previše' }), false);
  assert.equal(missingOnServer(null), false);
});

test('slike lovcima: 54000 (najviše 30 slika čeka) je privremeno — slika ostaje u redu', () => {
  assert.equal(retryLater({ code: '54000' }), true);
  assert.equal(retryLater({ code: '42501' }), false);
});
