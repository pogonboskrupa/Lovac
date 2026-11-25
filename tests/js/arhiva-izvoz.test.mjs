import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveHtml, archiveFileName, trailsByHunter, trailsSvg, safeImage } from '../../static/js/arhiva-izvoz.js';

const IMG = 'data:image/jpeg;base64,AAAA';
const z = {
  lov: { id: 'L', naziv: 'Pogon <Grmeč>', datum: '2026-11-22', status: 'zavrsen', pocetak: '2026-11-22T07:00:00Z', kraj: '2026-11-22T13:00:00Z', rezultat: 'Dobar lov', napomena: null },
  sekcija: { naziv: 'Krupa 1' }, revir: { naziv: 'Krupa' },
  ucesnici: [{ korisnik_id: 'a', uloga: 'vodja' }, { korisnik_id: 'b', uloga: 'strijelac' }],
};
const d = { odstrel: [{ vrsta: 'divlja_svinja', tezina: 82.5, korisnik_id: 'b' }], slike: [{ id: 's1', mala: IMG, autor_id: 'a', opis: 'Vepar' }, { id: 's2', mala: 'javascript:alert(1)', autor_id: 'a' }] };
const trag = [
  { korisnik_id: 'a', lat: 44.88, lon: 16.15, t: '2026-11-22T07:10:00Z' }, { korisnik_id: 'a', lat: 44.89, lon: 16.15, t: '2026-11-22T07:00:00Z' },
  { korisnik_id: 'b', lat: 44.87, lon: 16.16, t: '2026-11-22T07:00:00Z' }, { korisnik_id: 'b', lat: 44.875, lon: 16.17, t: '2026-11-22T08:00:00Z' },
];
const names = { a: 'Ado Vođa', b: 'Bego Strijelac' };

test('arhiva u fajl: ime fajla bez dijakritika, sa datumom', () => {
  assert.equal(archiveFileName(z.lov), 'lov-2026-11-22-pogon-grmec.html');
  assert.equal(archiveFileName({ naziv: '', datum: null }), 'lov-bez-datuma-lov.html');
});

test('arhiva u fajl: sadrži lov, ulov, učesnike, slike i tragove; tekst je escape-ovan, samo dataURL slike', () => {
  const html = archiveHtml({ z, d, velike: new Map([['s1', 'data:image/jpeg;base64,BBBB']]), trag, nameOf: (id) => names[id], speciesName: () => 'Divlja svinja', now: Date.parse('2026-11-24T10:00:00Z') });
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes('Pogon &lt;Grmeč&gt;'), 'naziv escape');
  assert.ok(!html.includes('<Grmeč>'));
  assert.match(html, /Divlja svinja<\/b>: 1 kom\., 82,5 kg/);
  assert.match(html, /Ado Vođa <span class="sitno">— Vođa lova/);
  assert.ok(html.includes('data:image/jpeg;base64,BBBB'), 'velika slika kad je na telefonu');
  assert.ok(!html.includes('AAAA'), 'mala se ne koristi kad postoji velika');
  assert.ok(!html.includes('javascript:'), 'ne-slika se ne ubacuje');
  assert.match(html, /<polyline/);
  assert.match(html, /Ne zamjenjuje službeni lovački dnevnik/);
  assert.equal(safeImage('data:image/png;base64,AA=='), 'data:image/png;base64,AA==');
  assert.equal(safeImage('data:text/html;base64,AA'), null);
});

test('arhiva u fajl: tragovi po lovcu po vremenu, isti okvir za sve', () => {
  const by = trailsByHunter(trag);
  assert.deepEqual(by.get('a').map((p) => p.t), ['2026-11-22T07:00:00Z', '2026-11-22T07:10:00Z']);
  const svg = trailsSvg(by, 100, 100, 0);
  assert.equal((svg.match(/<polyline/g) || []).length, 2);
  assert.equal(trailsSvg(new Map()), '');
});

test('arhiva u fajl: pogoci su na crtežu (crveni X sa brojem) i u popisu sa koordinatama; komad bez lokacije se navodi', () => {
  const od = [
    { id: 'o1', vrsta: 'divlja_svinja', tezina: 82.5, korisnik_id: 'b', vrijeme: '2026-11-22T08:30:00Z', lat: 44.8765, lon: 16.1612, stan_broj: 2 },
    { id: 'o2', vrsta: 'zec', korisnik_id: 'a', vrijeme: '2026-11-22T09:00:00Z' },
  ];
  const html = archiveHtml({ z, d: { odstrel: od, slike: [] }, trag, nameOf: (id) => names[id], speciesName: (k) => (k === 'zec' ? 'Zec <obični>' : 'Divlja svinja'), now: Date.parse('2026-11-24T10:00:00Z') });
  assert.match(html, /Gdje je divljač ustrijeljena/);
  assert.match(html, /stroke="#b91c1c"/); // X na crtežu
  assert.match(html, />1<\/text>/);
  assert.ok(html.includes('44.876500, 16.161200'));
  assert.match(html, /Za 1 komad lokacija nije zabilježena/);
  assert.ok(!html.includes('<obični>'), 'naziv vrste escape');
  // bez pogodaka nema odjeljka sa popisom
  const bez = archiveHtml({ z, d: { odstrel: [], slike: [] }, trag, nameOf: (id) => names[id] });
  assert.ok(!bez.includes('Gdje je divljač ustrijeljena</h2>'));
  // crtež postoji i kad nema traga, samo pogoci (dva pogotka)
  const svg = trailsSvg(new Map(), 640, 420, 16, [{ lat: 44.87, lon: 16.15 }, { lat: 44.88, lon: 16.16 }]);
  assert.match(svg, /<svg/);
  assert.equal((svg.match(/<text/g) || []).length, 2);
});
