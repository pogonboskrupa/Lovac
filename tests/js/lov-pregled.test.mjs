import test from 'node:test';
import assert from 'node:assert/strict';
import { huntGroups, huntDateText } from '../../static/js/lov.js';

const z = (id, status, datum) => ({ id, lov: { status, datum } });

test('planirani lovovi idu od najbližeg datuma, završeni od najnovijeg', () => {
  const all = [z('p2', 'planiran', '2099-01-01'), z('p1', 'planiran', '2026-12-05'), z('z1', 'zavrsen', '2026-10-01'), z('z2', 'zavrsen', '2026-11-01'), z('u', 'u_toku', '2026-11-23')];
  const g = huntGroups(all, ['u']);
  assert.deepEqual(g.map(([n, l]) => [n, l.map((x) => x.id)]), [['Danas i u toku', ['u']], ['Planirani', ['p1', 'p2']], ['Završeni', ['z2', 'z1']]]);
});

test('datum lova sa danom u sedmici, bez pomaka vremenske zone', () => {
  assert.equal(huntDateText('2026-12-05'), 'subota, 5.12.2026.');
  assert.equal(huntDateText('2026-11-23'), 'ponedjeljak, 23.11.2026.');
  assert.equal(huntDateText(null), '—');
});
