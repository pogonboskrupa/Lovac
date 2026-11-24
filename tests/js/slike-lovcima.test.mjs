import test from 'node:test';
import assert from 'node:assert/strict';
import {
  missingOnServer, retryLater, recipientsFrom, filterRecipients, validateSend, newSends, newInboxIds, expiryText, sentStatus, inboxSummary, MAX_PRIMALACA,
  groupAlbums, filterAlbums, albumsOverview,
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

test('slike lovcima: provjera prije slanja i jedan red po slici i primaocu (album)', () => {
  assert.match(validateSend({ primaoci: [], slike: ['data:x'] }), /Izaberi/);
  assert.match(validateSend({ primaoci: ['a'], slike: [] }), /Nema slike/);
  assert.match(validateSend({ primaoci: Array(MAX_PRIMALACA + 1).fill('a'), slike: ['x'] }), /Najviše/);
  assert.match(validateSend({ primaoci: ['a'], slike: Array(7).fill('x') }), /6 slika/);
  assert.equal(validateSend({ primaoci: ['a', 'b', 'c', 'd', 'e'], slike: Array(6).fill('x') }), null, '6 × 5 = 30 je granica servera');
  const rows = newSends({ ids: ['1', '2', '3', '4'], primaoci: ['a', 'b'], slike: ['s0', 's1'], grupa: 'g', kategorija: 'trofej', opis: '  vepar  ', lat: 44.8, lon: NaN, now: 0 });
  assert.deepEqual(rows.map((r) => [r.id, r.primalac_id, r.slika, r.redni, r.grupa, r.kategorija, r.opis, r.lon]),
    [['1', 'a', 's0', 0, 'g', 'trofej', 'vepar', null], ['2', 'a', 's1', 1, 'g', 'trofej', 'vepar', null], ['3', 'b', 's0', 0, 'g', 'trofej', 'vepar', null], ['4', 'b', 's1', 1, 'g', 'trofej', 'vepar', null]]);
  assert.ok(!('posiljalac_id' in rows[0]) && !('istice' in rows[0]), 'pošiljaoca i rok postavlja server');
  assert.equal(newSends({ ids: ['1'], primaoci: ['a'], slike: ['s'], grupa: 'g', kategorija: 'xx' })[0].kategorija, 'ostalo');
});

test('slike lovcima: albumi — primljene po grupi i pošiljaocu, poslane sa primaocima i jednom slikom po rednom broju', () => {
  const t = (m) => `2026-11-24T10:0${m}:00Z`;
  const prim = [
    { id: '1', grupa: 'g1', redni: 1, posiljalac_id: 'x', kategorija: 'trofej', created_at: t(1), novo: true },
    { id: '2', grupa: 'g1', redni: 0, posiljalac_id: 'x', kategorija: 'trofej', created_at: t(1) },
    { id: '3', posiljalac_id: 'y', created_at: t(5) }, // stari zapis bez grupe
  ];
  const a = groupAlbums(prim);
  assert.deepEqual(a.map((x) => [x.grupa, x.slike.map((s) => s.id), x.kategorija, x.novo]), [['3', ['3'], 'ostalo', false], ['g1', ['2', '1'], 'trofej', true]]);
  assert.equal(filterAlbums(a, 'trofej').length, 1);
  const posl = [
    { id: 'p1', grupa: 'g2', redni: 0, primalac_id: 'a', kategorija: 'trofej', created_at: t(2) },
    { id: 'p2', grupa: 'g2', redni: 0, primalac_id: 'b', kategorija: 'trofej', created_at: t(2) },
    { id: 'p3', grupa: 'g2', redni: 1, primalac_id: 'a', kategorija: 'trofej', created_at: t(2) },
  ];
  const b = groupAlbums(posl, { poslane: true });
  assert.equal(b.length, 1);
  assert.deepEqual(b[0].primaoci, ['a', 'b']);
  assert.deepEqual(b[0].slike.map((s) => s.redni), [0, 1]);
  assert.deepEqual(albumsOverview(prim, posl), { primljeno: 2, trofeja: 2, poslano: 1 });
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
