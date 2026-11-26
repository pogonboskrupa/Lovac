import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huntControlsHtml, huntCardHtml, conversationHtml, membersHtml } from '../../static/js/sekcija-render.js';

const names = { gv: 'Gvido Lovovođa sekcije', a: 'Adnan <b>', b: 'Bego' };
const nameOf = (id) => names[id] || 'drugi lovac';
const sekcija = { id: 'S', naziv: 'Krupa 1' };
const clanovi = [
  { sekcija_id: 'S', korisnik_id: 'gv', status: 'odobren' },
  { sekcija_id: 'S', korisnik_id: 'a', status: 'odobren' },
  { sekcija_id: 'S', korisnik_id: 'b', status: 'odobren' },
];
const lov = { id: 'L1', naziv: 'Pogon <1>', datum: '2026-11-25', status: 'planiran', sekcija_id: 'S' };
const cur = { zapis: { lov, ucesnici: [{ korisnik_id: 'gv', uloga: 'vodja' }, { korisnik_id: 'a', uloga: 'strijelac', samoprijava: true }], stanovi: [] } };
const base = { s: sekcija, cur, st: 'grupovodja', myId: 'gv', clanovi, odazivi: { lovId: null, rows: [] }, nameOf, extra: { pozicije: [], odstrel: [], sos: [], lovId: null }, vrste: [], traceOn: false };

test('bez lova: lovovođa sekcije dobija "Novi lov", član objašnjenje', () => {
  assert.match(huntControlsHtml({ ...base, cur: null }), /data-akcija="lov-novi"/);
  const clan = huntControlsHtml({ ...base, cur: null, st: 'clan', myId: 'a' });
  assert.ok(!clan.includes('lov-novi'));
  assert.match(clan, /Lovovođa sekcije još nije napravio lov/);
});

test('planirani lov: lovovođa sekcije vidi Pokreni, Obriši, prisutne i spisak za dodavanje; član ne vidi upravljanje', () => {
  const html = huntControlsHtml(base);
  for (const a of ['lov-pokreni', 'lov-obrisi', 'lov-ukloni', 'lov-dodaj']) assert.ok(html.includes(`data-akcija="${a}"`), a);
  assert.match(html, /Prisutni \(2\)/);
  assert.match(html, /prijavio se sam/);
  assert.ok(!html.includes('data-uid="gv"') || !/data-uid="gv"[\s\S]*?lov-ukloni[\s\S]*?<\/li>/.test(html.split('data-uid="a"')[0]), 'sebe ne uklanjaš');
  const clan = huntControlsHtml({ ...base, st: 'clan', myId: 'b' });
  assert.match(clan, /lov-prijavi/);
  for (const a of ['lov-pokreni', 'lov-obrisi', 'lov-dodaj']) assert.ok(!clan.includes(a), a);
});

test('kartica lova: naziv je escape-ovan, brojevi i datum su tu', () => {
  const html = huntCardHtml(base);
  assert.ok(html.includes('Pogon &lt;1&gt;'));
  assert.ok(!html.includes('<1>'));
  assert.match(html, /<b>2<\/b><span>prisutnih/);
  assert.match(html, /Planiran/);
  assert.match(huntCardHtml({ ...base, cur: null }), /Nema lova u toku/);
});

test('razgovor: ime samo na prvoj poruci niza, escape teksta, "čeka slanje"', () => {
  const msgs = [
    { id: '1', autor_id: 'a', tekst: 'Zdravo <i>', created_at: '2026-11-25T08:00:00Z' },
    { id: '2', autor_id: 'a', tekst: 'Drugi', created_at: '2026-11-25T08:00:30Z', sinhronizovano: false },
    { id: '3', autor_id: 'gv', tekst: 'Moja', created_at: '2026-11-25T08:01:00Z' },
  ];
  const html = conversationHtml(msgs, { showHunt: false, myId: 'gv', nameOf });
  assert.ok(html.includes('Zdravo &lt;i&gt;'));
  assert.ok(html.includes('Adnan &lt;b&gt;'));
  assert.equal((html.match(/Adnan &lt;b&gt; ·/g) || []).length, 1);
  assert.match(html, /čeka slanje/);
  assert.match(html, /poruka-red moja/);
});

test('redovi lovaca: broj lovova, oznaka (ti), dugmad po pravima, prazno stanje', () => {
  const actOf = () => ({ stanje: 'nema-lova', uloga: null, zadnje: null });
  const rows = [{ id: 'gv', ime: 'Gvido', uloga: 'grupovodja' }, { id: 'a', ime: 'Adnan', uloga: 'clan' }];
  const html = membersHtml(rows, { actOf, myId: 'gv', st: 'grupovodja', lovCounts: new Map([['a', 3]]), avatarOf: () => null, canPing: (st, u, me, id) => id === 'a', total: 2 });
  assert.match(html, /Gvido \(ti\)/);
  assert.match(html, /3 lovova/);
  assert.match(html, /bez lovova/);
  assert.equal((html.match(/data-akcija="poruka"/g) || []).length, 1); // sebi ne šalješ poruku
  assert.equal((html.match(/data-akcija="ping"/g) || []).length, 1);
  assert.match(membersHtml([], { actOf, myId: 'x', st: 'clan', lovCounts: new Map(), avatarOf: () => null, canPing: () => false, total: 0 }), /Nema članova/);
  assert.match(membersHtml([], { actOf, myId: 'x', st: 'clan', lovCounts: new Map(), avatarOf: () => null, canPing: () => false, total: 4 }), /ne odgovara pretrazi/);
});
