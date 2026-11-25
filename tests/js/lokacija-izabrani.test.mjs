import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchHunters, activeSelectedShare, addRecipient, removeRecipient, shareRows, receivedShares, validRecipients, MAX_PRIMALACA, displayName,
} from '../../static/js/lokacija-izabrani.js';

const members = [
  { id: 'a', ime: 'Ćamil', prezime: 'Đulić', nadimak: null },
  { id: 'b', ime: 'Amir', prezime: 'Hodžić', nadimak: 'Šumar' },
  { id: 'c', ime: 'Amra', prezime: 'Kovač', nadimak: null },
  { id: 'me', ime: 'Ja', prezime: 'Lovac', nadimak: null },
];

test('pretraga: samo pretraga — bez upisa nema nikoga; traži ime, prezime i nadimak bez dijakritika', () => {
  assert.deepEqual(searchHunters(members, '', { myId: 'me' }), []);
  assert.deepEqual(searchHunters(members, 'a', { myId: 'me' }), [], 'jedno slovo nije dovoljno');
  assert.deepEqual(searchHunters(members, 'camil', { myId: 'me' }).map((m) => m.id), ['a']);
  assert.deepEqual(searchHunters(members, 'sumar', { myId: 'me' }).map((m) => m.id), ['b'], 'nadimak');
  assert.deepEqual(searchHunters(members, 'am', { myId: 'me' }).map((m) => m.id), ['b', 'c', 'a'], 'Amir, Amra i Ćamil (u riječi), bez mene');
  assert.deepEqual(searchHunters(members, 'lovac', { myId: 'me' }), [], 'ja se ne nudim');
  assert.deepEqual(searchHunters(members, 'am', { myId: 'me', selected: ['b'] }).map((m) => m.id), ['c', 'a'], 'već izabrani se ne nudi');
  assert.equal(searchHunters(members, 'am', { myId: 'me', limit: 1 }).length, 1);
});

test('izabrani primaoci: bez duplikata, najviše MAX_PRIMALACA', () => {
  assert.deepEqual(addRecipient(['a'], 'a'), ['a']);
  assert.deepEqual(addRecipient(['a'], 'b'), ['a', 'b']);
  const full = Array.from({ length: MAX_PRIMALACA }, (_, i) => `u${i}`);
  assert.equal(addRecipient(full, 'novi').length, MAX_PRIMALACA);
  assert.deepEqual(removeRecipient(['a', 'b'], 'a'), ['b']);
  assert.equal(displayName(members[1]), 'Amir Hodžić (Šumar)');
});

test('spremljeno stanje: isteklo ili prazno nije aktivno', () => {
  const now = 1_000_000;
  assert.deepEqual(activeSelectedShare({ ids: ['a', 'a', 'b'], do: now + 1 }, now), { ids: ['a', 'b'], do: now + 1 });
  assert.equal(activeSelectedShare({ ids: ['a'], do: now - 1 }, now), null);
  assert.equal(activeSelectedShare({ ids: [], do: now + 1 }, now), null);
  assert.equal(activeSelectedShare(null, now), null);
});

test('redovi za server: po jedan za svakog primaoca sa istom pozicijom i istekom', () => {
  const rows = shareRows(['a', 'b'], { lat: 44.88, lon: 16.15, acc: 5 }, Date.UTC(2026, 10, 25, 12), 'me');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], { vlasnik_id: 'me', primalac_id: 'b', lat: 44.88, lon: 16.15, acc: 5, do_: '2026-11-25T12:00:00.000Z' });
});

test('primljene pozicije: samo one gdje sam primalac, istekle i bez signala se ne prikazuju, najbliži prvi', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const rows = [
    { vlasnik_id: 'a', primalac_id: 'me', lat: 44.8805, lon: 16.15, t: iso(1), do_: new Date(now + 3600000).toISOString() },
    { vlasnik_id: 'b', primalac_id: 'me', lat: 44.881, lon: 16.15, t: iso(1), do_: new Date(now - 1000).toISOString() },
    { vlasnik_id: 'c', primalac_id: 'neko_drugi', lat: 44.88, lon: 16.15, t: iso(1), do_: new Date(now + 3600000).toISOString() },
    { vlasnik_id: 'me', primalac_id: 'a', lat: 44.88, lon: 16.15, t: iso(1), do_: new Date(now + 3600000).toISOString() },
  ];
  const list = receivedShares(rows, 'me', (id) => id.toUpperCase(), { lat: 44.88, lon: 16.15 }, now);
  assert.deepEqual(list.map((x) => x.id), ['a']);
  assert.ok(list[0].udaljenost > 40 && list[0].udaljenost < 70);
});

test('primalac koji više nije član se ne šalje', () => {
  assert.deepEqual(validRecipients(['a', 'x'], members), ['a']);
});
