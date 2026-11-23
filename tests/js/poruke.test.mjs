import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationItems } from '../../static/js/poruke.js';

test('razgovor: naslov dana (Danas/Jučer/datum) i ime samo na prvoj poruci niza istog autora', () => {
  const now = new Date(2026, 10, 23, 12, 0).getTime();
  const at = (d, h) => new Date(2026, 10, d, h, 0).toISOString();
  const msgs = [
    { id: 1, autor_id: 'a', created_at: at(20, 9) },
    { id: 2, autor_id: 'a', created_at: at(22, 9) },
    { id: 3, autor_id: 'a', created_at: at(22, 10) },
    { id: 4, autor_id: 'b', created_at: at(23, 8) },
    { id: 5, autor_id: 'b', created_at: at(23, 9) },
    { id: 6, autor_id: 'a', created_at: at(23, 10) },
  ];
  const items = conversationItems(msgs, now);
  assert.deepEqual(items.map((i) => i.dan || `${i.poruka.id}${i.prva ? '*' : ''}`),
    ['20.11.2026.', '1*', 'Jučer', '2*', '3', 'Danas', '4*', '5', '6*']);
});
