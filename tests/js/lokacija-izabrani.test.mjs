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

test('stanje slanja izabranima: lovac vidi kad lokacija NE odlazi (GPS, veza, server)', async () => {
  const { sendStateText } = await import('../../static/js/lokacija-izabrani.js');
  const now = 1_000_000;
  assert.match(sendStateText({ stanje: 'ok', t: now - 2000 }, now), /Poslano upravo/);
  assert.match(sendStateText({ stanje: 'ok', t: now - 40000 }, now), /prije 40 s/);
  assert.match(sendStateText({ stanje: 'ok', t: now - 300000 }, now), /prije 5 min/);
  assert.match(sendStateText({ stanje: 'gps' }, now), /Čekam GPS/);
  assert.match(sendStateText({ stanje: 'veza' }, now), /Nema veze/);
  assert.equal(sendStateText({ stanje: 'greska', poruka: 'X' }, now), 'X');
});

test('ponuda "Dijeli i ti": ko dijeli sa mnom, a ja s njim ne; "Ne sada" važi samo za to dijeljenje', async () => {
  const { reciprocalOffers, offerBadgeText, offerNotice } = await import('../../static/js/lokacija-izabrani.js');
  const now = Date.parse('2026-11-25T12:00:00Z');
  const future = '2026-11-25T14:00:00Z';
  const rows = [
    { vlasnik_id: 'a', primalac_id: 'me', do_: future },
    { vlasnik_id: 'b', primalac_id: 'me', do_: future },
    { vlasnik_id: 'c', primalac_id: 'me', do_: '2026-11-25T11:00:00Z' }, // isteklo
    { vlasnik_id: 'd', primalac_id: 'neko-drugi', do_: future },        // nije za mene
    { vlasnik_id: 'e', primalac_id: 'me', do_: future },
  ];
  const nameOf = (id) => ({ a: 'Ado', b: 'Bego', e: 'Esad' })[id] || id;
  const offers = reciprocalOffers(rows, 'me', nameOf, ['b'], { e: future }, now);
  assert.deepEqual(offers.map((o) => o.id), ['a']); // b: već dijelim s njim, e: odbijeno, c: isteklo, d: nije meni
  // novo dijeljenje istog lovca (drugi do_) se ponovo nudi
  assert.deepEqual(reciprocalOffers(rows, 'me', nameOf, [], { e: '2026-11-25T10:00:00Z' }, now).map((o) => o.id), ['a', 'b', 'e']);
  assert.equal(offerBadgeText(3), '3');
  assert.equal(offerBadgeText(12), '9+');
  assert.match(offerNotice(offers), /Ado dijeli lokaciju sa tobom/);
  assert.match(offerNotice([{ ime: 'A' }, { ime: 'B' }, { ime: 'C' }]), /A i B i još 1 dijele/);
  assert.equal(offerNotice([]), '');
});
