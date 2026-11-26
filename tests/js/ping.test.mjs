import test from 'node:test';
import assert from 'node:assert/strict';
import { canPing, newPing, incomingPings, newAnswers, requestText, answerText, cooldownLeft, PING_TTL_MS, PING_COOLDOWN_MS } from '../../static/js/ping.js';

const NOW = Date.UTC(2026, 10, 22, 10, 0, 0);
const iso = (minAgo) => new Date(NOW - minAgo * 60000).toISOString();

test('canPing: član/lovovođa sekcije/lovočuvar traže člana ili lovovođu sekcije; ne sebe, ne lovočuvara, ne čekanje/admin', () => {
  assert.equal(canPing('clan', 'clan', 'a', 'b'), true);
  assert.equal(canPing('grupovodja', 'clan', 'a', 'b'), true);
  assert.equal(canPing('lovocuvar', 'grupovodja', 'a', 'b'), true);
  assert.equal(canPing('clan', 'clan', 'a', 'a'), false);
  assert.equal(canPing('clan', 'lovocuvar', 'a', 'b'), false);
  assert.equal(canPing('ceka', 'clan', 'a', 'b'), false);
  assert.equal(canPing('admin', 'clan', 'a', 'b'), false);
  assert.equal(canPing('clan', 'clan', undefined, 'b'), false);
});

test('newPing: klijentski UUID, bez odgovora', () => {
  const a = newPing({ sekcija_id: 's', od_id: 'a', za_id: 'b' }, NOW);
  const b = newPing({ sekcija_id: 's', od_id: 'a', za_id: 'b' }, NOW);
  assert.notEqual(a.id, b.id);
  assert.equal(a.odgovor, null);
  assert.equal(a.created_at, new Date(NOW).toISOString());
});

test('incomingPings: samo meni, neodgovoreni, svježi (≤ 15 min), najstariji prvi', () => {
  const rows = [
    { id: '1', za_id: 'me', od_id: 'x', created_at: iso(5) },
    { id: '2', za_id: 'me', od_id: 'y', created_at: iso(10) },
    { id: '3', za_id: 'me', od_id: 'z', created_at: iso(20) },
    { id: '4', za_id: 'me', od_id: 'z', created_at: iso(1), odgovor: 'ne' },
    { id: '5', za_id: 'drugi', od_id: 'x', created_at: iso(1) },
  ];
  assert.deepEqual(incomingPings(rows, 'me', NOW).map((r) => r.id), ['2', '1']);
  assert.ok(PING_TTL_MS === 15 * 60000);
});

test('newAnswers: odgovori na moja pitanja koje još nisam vidio', () => {
  const rows = [
    { id: '1', od_id: 'me', za_id: 'b', created_at: iso(5), odgovor: 'da', odgovoreno: iso(4) },
    { id: '2', od_id: 'me', za_id: 'c', created_at: iso(5), odgovor: 'ne', odgovoreno: iso(3) },
    { id: '3', od_id: 'me', za_id: 'd', created_at: iso(5) },
    { id: '4', od_id: 'x', za_id: 'me', created_at: iso(5), odgovor: 'da' },
    { id: '5', od_id: 'me', za_id: 'e', created_at: iso(300), odgovor: 'da' },
  ];
  assert.deepEqual(newAnswers(rows, 'me', [], NOW).map((r) => r.id), ['1', '2']);
  assert.deepEqual(newAnswers(rows, 'me', ['1'], NOW).map((r) => r.id), ['2']);
});

test('tekstovi i cooldown', () => {
  assert.equal(requestText('Ado Adić'), 'Ado Adić traži tvoju lokaciju.');
  assert.match(answerText({ odgovor: 'da' }, 'Ado'), /DA/);
  assert.match(answerText({ odgovor: 'ne' }, 'Ado'), /NE/);
  assert.equal(cooldownLeft({ b: NOW - 30000 }, 'b', NOW), PING_COOLDOWN_MS - 30000);
  assert.equal(cooldownLeft({ b: NOW - 3 * 60000 }, 'b', NOW), 0);
  assert.equal(cooldownLeft({}, 'b', NOW), 0);
  assert.equal(cooldownLeft(null, 'b', NOW), 0);
});
