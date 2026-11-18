import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const jsFiles = readdirSync(new URL('static/js/', root)).filter((f) => f.endsWith('.js'));

test('saldo <div> u <body> je nula (nezatvoren div sakrije sve iza sebe)', () => {
  const body = html.slice(html.indexOf('<body'), html.indexOf('</body>'));
  const open = (body.match(/<div\b/g) || []).length;
  const close = (body.match(/<\/div>/g) || []).length;
  assert.equal(open, close, `otvorenih ${open}, zatvorenih ${close}`);
});

test('imena funkcija su jedinstvena kroz sve module', () => {
  const seen = new Map();
  const sources = [...jsFiles.map((f) => [f, read(`static/js/${f}`)]), ['sw.js', read('sw.js')]];
  for (const [file, src] of sources) {
    for (const m of src.matchAll(/(?:^|\s)(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
      const name = m[1];
      assert.ok(!seen.has(name), `funkcija ${name} postoji u ${seen.get(name)} i ${file}`);
      seen.set(name, file);
    }
  }
});

function versions() {
  const ver = html.match(/APP_VER\s*=\s*'(v\d+\.\d+\.\d+)'/)?.[1];
  const sw = read('sw.js').match(/APP_VERSION\s*=\s*'(v\d+\.\d+\.\d+)'/)?.[1];
  const gradle = read('android/app/build.gradle');
  const name = gradle.match(/versionName\s+"(v?\d+\.\d+\.\d+)"/)?.[1];
  const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
  return { ver, sw, name, code };
}

test('verzija je ista na tri mjesta', () => {
  const v = versions();
  assert.ok(v.ver, 'APP_VER u index.html');
  assert.equal(v.sw, v.ver, 'sw.js APP_VERSION');
  assert.equal(`v${v.name.replace(/^v/, '')}`, v.ver, 'build.gradle versionName');
  assert.ok(v.code > 0, 'versionCode');
});

test('šema verzije: Y i Z su 0–9 (v1.1.9 -> v1.2.0, nikad v1.1.10)', () => {
  const [, y, z] = versions().ver.slice(1).split('.').map(Number);
  assert.ok(y <= 9 && z <= 9, versions().ver);
});

test('service worker kešira sve JS module i fajlovi postoje', () => {
  const sw = read('sw.js');
  for (const f of jsFiles) assert.ok(sw.includes(`'static/js/${f}'`), `sw.js ne kešira ${f}`);
  for (const m of sw.matchAll(/'(static\/[^']+)'/g)) assert.ok(existsSync(new URL(m[1], root)), `nema ${m[1]}`);
});

test('svi lokalni <script>/<link> iz index.html postoje (nikad samo CDN)', () => {
  for (const m of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)) {
    const ref = m[1];
    assert.ok(!/^https?:/.test(ref), `vanjski resurs ${ref}`);
    assert.ok(existsSync(new URL(ref, root)), `nema ${ref}`);
  }
});

// Kontrast (WCAG) za parove tekst/pozadina u obje teme.
function tokens(css, selector) {
  const block = css.split(selector)[1].split('}')[0];
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('kontrast ≥ 4.5:1 u noćnoj i dnevnoj temi', () => {
  const css = read('static/css/app.css');
  const PAIRS = [
    ['tekst', 'pozadina'], ['tekst', 'povrsina'], ['tekst-2', 'pozadina'], ['tekst-2', 'povrsina'],
    ['dugme-tekst', 'dugme'], ['naglasak-tekst', 'naglasak'], ['upozorenje-tekst', 'upozorenje'],
    ['greska', 'pozadina'], ['gps-tekst', 'gps-dobro'], ['gps-tekst', 'gps-srednje'], ['gps-tekst', 'gps-lose'],
    ['pozadina', 'tekst'],
  ];
  for (const sel of [':root[data-tema="noc"] {', ':root[data-tema="dan"] {']) {
    const t = tokens(css, sel);
    for (const [fg, bg] of PAIRS) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${sel} ${fg} na ${bg}: ${r.toFixed(2)}`);
    }
  }
});

test('config.js: server je podešen, a u repou je samo javni ključ (nikad service_role / secret)', () => {
  const cfg = read('static/js/config.js');
  assert.match(cfg, /SUPABASE_URL = 'https:\/\/[a-z0-9]+\.supabase\.co'/);
  const key = cfg.match(/SUPABASE_ANON_KEY = '([^']+)'/)?.[1] ?? '';
  assert.ok(key.startsWith('sb_publishable_') || key.startsWith('eyJ'), 'očekivan publishable ili anon key');
  assert.ok(!/sb_secret_/.test(cfg), 'secret key u repou');
  if (key.startsWith('eyJ')) {
    const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
    assert.equal(role, 'anon', `JWT ključ ima ulogu ${role}`);
  }
});
