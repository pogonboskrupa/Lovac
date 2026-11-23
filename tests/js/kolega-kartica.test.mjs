import test from 'node:test';
import assert from 'node:assert/strict';
import { memberCard } from '../../static/js/istrazivac.js';

test('kartica kolege: ime, udaljenost i strana svijeta od mene, starost', () => {
  const me = { lat: 44.88, lon: 16.15 };
  const him = { lat: 44.8845, lon: 16.15 }; // ~500 m sjeverno
  const html = memberCard('Goran Grupovođa', me, him, 3);
  assert.match(html, /Goran Grupovođa/);
  assert.match(html, /50\d m S od tebe/);
  assert.match(html, /prije 3 min/);
});

test('kartica kolege: bez mog GPS-a ne izmišlja udaljenost; ime se escapira', () => {
  const html = memberCard('<img src=x>', null, { lat: 1, lon: 1 }, 0);
  assert.match(html, /nema tvog GPS-a/);
  assert.ok(!html.includes('<img'));
});
