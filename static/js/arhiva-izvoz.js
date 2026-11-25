// Arhiva lova kao jedan HTML fajl na telefonu: podaci o lovu, učesnici, ulov, rezultat, slike i crtež tragova.
// Fajl je samostalan (slike su unutra kao dataURL), otvara se u bilo kojem pregledniku i bez interneta.
import { huntDate, huntTimeRange, shotsOnMap, shotLine } from './arhiva.js';
import { summarizeHarvest, formatDecimalBs } from './odstrel.js';
import { trailMeters } from './istrazivac-pregled.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// U fajl idu samo slike (dataURL), nikad drugi sadržaj koji bi se izvršio u pregledniku.
export const safeImage = (src) => (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(src || '')) ? src : null);

const ULOGE = { strijelac: 'Strijelac', pogonic: 'Pogonič', vodja: 'Vođa lova' };
const BOJE = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e8590c', '#0c8599', '#c2255c', '#5c940d', '#364fc7', '#a61e4d'];

const ascii = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

export function archiveFileName(lov) {
  const slug = ascii(lov?.naziv).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'lov';
  return `lov-${String(lov?.datum || '').slice(0, 10) || 'bez-datuma'}-${slug}.html`;
}

// Tačke traga po lovcu, poredane po vremenu.
export function trailsByHunter(rows = []) {
  const m = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r?.lat) || !Number.isFinite(r?.lon)) continue;
    if (!m.has(r.korisnik_id)) m.set(r.korisnik_id, []);
    m.get(r.korisnik_id).push(r);
  }
  for (const pts of m.values()) pts.sort((a, b) => String(a.t).localeCompare(String(b.t)));
  return m;
}

// Svi tragovi u ISTOJ razmjeri (zajednički okvir), da se vidi ko je gdje bio u odnosu na druge.
export function trailsSvg(byHunter, w = 640, h = 420, pad = 16, shots = []) {
  const all = [...byHunter.values()].flat(), shotPts = shots.filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon));
  all.push(...shotPts);
  if (all.length < 2) return '';
  const k = Math.cos((all[0].lat * Math.PI) / 180);
  const xs = all.map((p) => p.lon * k);
  const ys = all.map((p) => -p.lat);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY) || 1e-9;
  const scale = Math.min(w - 2 * pad, h - 2 * pad) / span;
  const offX = (w - (maxX - minX) * scale) / 2;
  const offY = (h - (maxY - minY) * scale) / 2;
  const pt = (p) => `${(offX + (p.lon * k - minX) * scale).toFixed(1)},${(offY + (-p.lat - minY) * scale).toFixed(1)}`;
  let i = 0;
  const lines = [];
  for (const pts of byHunter.values()) {
    const c = BOJE[i++ % BOJE.length];
    if (pts.length > 1) lines.push(`<polyline points="${pts.map(pt).join(' ')}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
    lines.push(`<circle cx="${pt(pts[pts.length - 1]).split(',')[0]}" cy="${pt(pts[pts.length - 1]).split(',')[1]}" r="5" fill="${c}" stroke="#fff" stroke-width="2"/>`);
  }
  // pogoci: crveni X sa rednim brojem (isti broj je u popisu ispod crteža)
  shotPts.forEach((sp, n) => {
    const [x, y] = pt(sp).split(',').map(Number);
    lines.push(`<g stroke="#b91c1c" stroke-width="4" stroke-linecap="round"><line x1="${x - 7}" y1="${y - 7}" x2="${x + 7}" y2="${y + 7}"/><line x1="${x - 7}" y1="${y + 7}" x2="${x + 7}" y2="${y - 7}"/></g>`
      + `<text x="${x + 10}" y="${y - 8}" font-size="15" font-weight="700" fill="#7f1d1d" stroke="#fff" stroke-width="3" paint-order="stroke">${n + 1}</text>`);
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Tragovi kretanja lovaca i pogoci"><rect width="${w}" height="${h}" fill="#f4f1e8"/>${lines.join('')}</svg>`;
}

// z: { lov, sekcija, revir, ucesnici }, d: { odstrel, slike }, velike: Map(id → dataURL), trag: redovi lov_tragovi.
export function archiveHtml({ z, d = { odstrel: [], slike: [] }, velike = new Map(), trag = [], nameOf = (id) => id, speciesName = (k) => k, now = Date.now() }) {
  const lov = z.lov;
  const sum = summarizeHarvest((d.odstrel || []).map((o) => ({ vrsta: o.vrsta, tezina: o.tezina })));
  const byHunter = trailsByHunter(trag);
  const { sa: pogoci, bez: bezLokacije } = shotsOnMap(d.odstrel || [], nameOf, speciesName);
  const legenda = [...byHunter.entries()].map(([uid, pts], i) => `<li><span class="boja" style="background:${BOJE[i % BOJE.length]}"></span>${esc(nameOf(uid))}
    <span class="sitno">${(trailMeters(pts) / 1000).toFixed(2).replace('.', ',')} km</span></li>`).join('');
  const slike = (d.slike || []).map((s) => {
    const src = safeImage(velike.get(s.id)) || safeImage(s.mala);
    return src ? `<figure><img src="${src}" alt="${esc(s.opis || 'Slika lova')}"><figcaption>${esc(nameOf(s.autor_id))}${s.opis ? ` — ${esc(s.opis)}` : ''}</figcaption></figure>` : '';
  }).join('');
  const kada = new Date(now);
  const generisano = `${String(kada.getDate()).padStart(2, '0')}.${String(kada.getMonth() + 1).padStart(2, '0')}.${kada.getFullYear()}. ${String(kada.getHours()).padStart(2, '0')}:${String(kada.getMinutes()).padStart(2, '0')}`;
  return `<!doctype html>
<html lang="bs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(lov.naziv)} — ${esc(huntDate(lov.datum))}</title>
<style>
body{margin:0;padding:16px;font:16px/1.45 system-ui,sans-serif;color:#14170f;background:#fbfaf5;max-width:900px;margin-inline:auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:19px;margin:24px 0 8px;border-bottom:2px solid #8a5a00;padding-bottom:4px}
.sitno{color:#3f4636;font-size:14px}.brojevi{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
.brojevi div{flex:1;min-width:90px;background:#fff;border:1.5px solid #8b8670;border-radius:12px;padding:8px;text-align:center}
.brojevi b{display:block;font-size:24px}ul{padding-left:20px}li{margin:4px 0}
.slike{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
figure{margin:0;background:#fff;border:1px solid #d6d2c4;border-radius:10px;overflow:hidden}
figure img{width:100%;display:block}figcaption{padding:6px;font-size:13px}
.boja{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:6px;vertical-align:middle}
.legenda{list-style:none;padding:0}.napomena{margin-top:28px;padding:10px;border-left:4px solid #8a5a00;background:#fff}
</style></head><body>
<h1>${esc(lov.naziv)}</h1>
<p class="sitno">${esc(huntDate(lov.datum))} · ${esc(huntTimeRange(lov))}${z.sekcija?.naziv ? ` · Sekcija ${esc(z.sekcija.naziv)}` : ''}${z.revir?.naziv ? ` · Revir ${esc(z.revir.naziv)}` : ''}</p>
<div class="brojevi"><div><b>${(z.ucesnici || []).length}</b>učesnika</div><div><b>${(d.odstrel || []).length}</b>komada ulova</div><div><b>${(d.slike || []).length}</b>slika</div></div>
${lov.napomena ? `<p>${esc(lov.napomena)}</p>` : ''}
<h2>Rezultat</h2><p>${esc(lov.rezultat || 'Rezultat nije upisan.')}</p>
<h2>Ulov</h2><ul>${sum.map((s) => `<li><b>${esc(speciesName(s.vrsta))}</b>: ${s.komada} kom.${s.tezina ? `, ${esc(formatDecimalBs(Math.round(s.tezina * 10) / 10))} kg` : ''}
  <span class="sitno">(${esc((d.odstrel || []).filter((o) => o.vrsta === s.vrsta).map((o) => nameOf(o.korisnik_id)).join(', '))})</span></li>`).join('') || '<li>Nema upisanog ulova.</li>'}</ul>
<h2>Učesnici</h2><ul>${(z.ucesnici || []).map((u) => `<li>${esc(nameOf(u.korisnik_id))} <span class="sitno">— ${esc(ULOGE[u.uloga] || u.uloga || '')}</span></li>`).join('') || '<li>Nema učesnika.</li>'}</ul>
${byHunter.size || pogoci.length ? `<h2>Kretanje lovaca i pogoci</h2>${trailsSvg(byHunter, 640, 420, 16, pogoci)}${legenda ? `<ul class="legenda">${legenda}</ul>` : ''}
<p class="sitno">Crtež je u istoj razmjeri za sve lovce; tačka je zadnja zabilježena pozicija, crveni X je mjesto gdje je divljač ustrijeljena. Sjever je gore.</p>` : ''}
${pogoci.length || bezLokacije ? `<h2>Gdje je divljač ustrijeljena</h2><ol class="pogoci">${pogoci.map((p) => `<li>${esc(shotLine(p))} <span class="sitno">— ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}</span></li>`).join('')}</ol>
${bezLokacije ? `<p class="sitno">Za ${bezLokacije} ${bezLokacije === 1 ? 'komad' : 'komada'} lokacija nije zabilježena.</p>` : ''}` : ''}
${slike ? `<h2>Slike</h2><div class="slike">${slike}</div>` : ''}
<p class="napomena">Izvještaj iz aplikacije Lovačkog društva "Grmeč", napravljen ${esc(generisano)}. Ne zamjenjuje službeni lovački dnevnik.</p>
</body></html>`;
}
