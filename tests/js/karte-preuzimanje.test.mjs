import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const java = readFileSync('android/app/src/main/java/ba/grmec/lovac/KarteBridge.java', 'utf8');

test('karta se preuzima u paralelnim dijelovima (Range) uz nastavak dijela poslije pucanja veze', () => {
  assert.match(java, /DIJELOVA = 4/);
  assert.match(java, /"Range", range/);
  assert.match(java, /"bytes=" \+ pos \+ "-" \+ end/); // nastavak od mjesta gdje je dio stao
  assert.match(java, /getResponseCode\(\) != 206/);
  assert.match(java, /downloadSingle\(url, tmp\)/); // bez Range podrške stari put
  assert.match(java, /__karteBrzina/);
});
