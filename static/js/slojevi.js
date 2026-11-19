// Uvoz slojeva (granice lovišta, revira, lovnih površina): KML, KMZ, GPX, SHP (zip ili .shp+.dbf+.prj).
// Sve se pretvara u GeoJSON u WGS84; SHP u GK zoni 6 (MGI Balkans) se preračunava.

import { gk6ToWgs84 } from './geo.js';

// ---------------- ZIP ----------------
// Čita centralni direktorij; sadržaj unosa se raspakuje tek kad zatreba (lijeno).
export function readZip(buffer) {
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Fajl nije ispravan ZIP/KMZ');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Oštećen ZIP');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buffer, p + 46, nameLen));
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    out.set(name, async () => {
      const data = new Uint8Array(buffer, start, csize);
      if (method === 0) return data.slice().buffer;
      if (method !== 8) throw new Error(`ZIP metoda ${method} nije podržana`);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).arrayBuffer();
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------------- SHP / DBF ----------------
function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return s / 2; // > 0 = smjer kazaljke (SHP vanjski prsten)
}

export function parseShp(buffer) {
  const dv = new DataView(buffer);
  if (dv.getInt32(0, false) !== 9994) throw new Error('Fajl nije SHP');
  const fileLen = dv.getInt32(24, false) * 2;
  const shapes = [];
  let p = 100;
  while (p + 8 <= Math.min(fileLen, buffer.byteLength)) {
    const len = dv.getInt32(p + 4, false) * 2;
    const c = p + 8;
    const type = dv.getInt32(c, true) % 10; // Z i M varijante imaju iste osnovne koordinate
    if (type === 1) {
      shapes.push({ type: 'Point', coordinates: [dv.getFloat64(c + 4, true), dv.getFloat64(c + 12, true)] });
    } else if (type === 3 || type === 5) {
      const nParts = dv.getInt32(c + 36, true);
      const nPoints = dv.getInt32(c + 40, true);
      const parts = [];
      for (let i = 0; i < nParts; i++) parts.push(dv.getInt32(c + 44 + i * 4, true));
      const ptsStart = c + 44 + nParts * 4;
      const rings = parts.map((s, i) => {
        const e = i + 1 < nParts ? parts[i + 1] : nPoints;
        const r = [];
        for (let k = s; k < e; k++) r.push([dv.getFloat64(ptsStart + k * 16, true), dv.getFloat64(ptsStart + k * 16 + 8, true)]);
        return r;
      });
      if (type === 3) {
        shapes.push(rings.length === 1 ? { type: 'LineString', coordinates: rings[0] } : { type: 'MultiLineString', coordinates: rings });
      } else {
        const polys = [];
        for (const r of rings) {
          if (ringArea(r) >= 0 || !polys.length) polys.push([r]);
          else polys[polys.length - 1].push(r); // rupa
        }
        shapes.push(polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys });
      }
    } else if (type === 8) {
      const n = dv.getInt32(c + 36, true);
      const pts = [];
      for (let k = 0; k < n; k++) pts.push([dv.getFloat64(c + 40 + k * 16, true), dv.getFloat64(c + 48 + k * 16, true)]);
      shapes.push({ type: 'MultiPoint', coordinates: pts });
    } else {
      shapes.push(null);
    }
    p = c + len;
  }
  return shapes;
}

export function parseDbf(buffer, encoding = 'utf-8') {
  const dv = new DataView(buffer);
  const n = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recLen = dv.getUint16(10, true);
  const dec = new TextDecoder(encoding);
  const fields = [];
  for (let o = 32; o < headerLen - 1 && dv.getUint8(o) !== 0x0d; o += 32) {
    const name = dec.decode(new Uint8Array(buffer, o, 11)).replace(/\0.*$/, '').trim();
    fields.push({ name, type: String.fromCharCode(dv.getUint8(o + 11)), len: dv.getUint8(o + 16) });
  }
  const rows = [];
  for (let i = 0; i < n; i++) {
    let o = headerLen + i * recLen + 1;
    const row = {};
    for (const f of fields) {
      const raw = dec.decode(new Uint8Array(buffer, o, f.len)).trim();
      row[f.name] = (f.type === 'N' || f.type === 'F') && raw !== '' ? Number(raw) : raw;
      o += f.len;
    }
    rows.push(row);
  }
  return rows;
}

function firstCoord(shapes) {
  for (const s of shapes) {
    if (!s) continue;
    let c = s.coordinates;
    while (Array.isArray(c[0])) c = c[0];
    return c;
  }
  return null;
}

export function detectProjection(prj, shapes) {
  const t = String(prj || '');
  if (/Balkans[_ ]?zone[_ ]?6|31276|MGI.*zone.?6/i.test(t)) return 'gk6';
  if (/GCS_WGS_1984|WGS[_ ]?84|4326/i.test(t) && !/PROJCS/i.test(t)) return 'wgs84';
  const c = firstCoord(shapes);
  if (c && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) return 'wgs84';
  if (c && c[0] > 6.2e6 && c[0] < 6.8e6 && c[1] > 4.6e6 && c[1] < 5.1e6) return 'gk6';
  return 'nepoznato';
}

function mapCoords(c, fn) {
  return typeof c[0] === 'number' ? fn(c) : c.map((x) => mapCoords(x, fn));
}

const NAME_KEYS = ['name', 'NAME', 'NAZIV', 'naziv', 'Naziv', 'IME', 'ime', 'LABEL'];

export function shapefileToGeoJSON(shapes, attrs, proj) {
  if (proj === 'nepoznato') throw new Error('Nepoznat koordinatni sistem SHP fajla (dodaj .prj)');
  const conv = proj === 'gk6' ? ([x, y]) => { const r = gk6ToWgs84(x, y); return [r.lon, r.lat]; } : (c) => c;
  const features = [];
  shapes.forEach((g, i) => {
    if (!g) return;
    const props = { ...(attrs?.[i] || {}) };
    const nk = NAME_KEYS.find((k) => props[k] != null && props[k] !== '');
    if (nk && props.name == null) props.name = String(props[nk]);
    features.push({ type: 'Feature', geometry: { type: g.type, coordinates: mapCoords(g.coordinates, conv) }, properties: props });
  });
  return { type: 'FeatureCollection', features };
}

// ---------------- KML / GPX (DOMParser, samo u browseru) ----------------
export function kmlColor(abgr) {
  const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(abgr || '').trim());
  if (!m) return null;
  return { color: `#${m[4]}${m[3]}${m[2]}`.toLowerCase(), opacity: Math.round((parseInt(m[1], 16) / 255) * 100) / 100 };
}

const kids = (el, name) => [...el.getElementsByTagNameNS('*', name)];
const text = (el, name) => kids(el, name)[0]?.textContent?.trim() ?? null;

function kmlCoords(s) {
  return String(s || '').trim().split(/\s+/).map((t) => t.split(',').map(Number)).filter((c) => c.length >= 2 && c.every(Number.isFinite)).map((c) => [c[0], c[1]]);
}

function kmlGeometries(pm) {
  const out = [];
  for (const p of kids(pm, 'Point')) out.push({ type: 'Point', coordinates: kmlCoords(text(p, 'coordinates'))[0] });
  for (const l of kids(pm, 'LineString')) out.push({ type: 'LineString', coordinates: kmlCoords(text(l, 'coordinates')) });
  for (const poly of kids(pm, 'Polygon')) {
    const outer = kids(poly, 'outerBoundaryIs').map((o) => kmlCoords(text(o, 'coordinates')));
    const inner = kids(poly, 'innerBoundaryIs').map((o) => kmlCoords(text(o, 'coordinates')));
    if (outer[0]?.length) out.push({ type: 'Polygon', coordinates: [outer[0], ...inner] });
  }
  return out.filter((g) => g.coordinates && g.coordinates.length);
}

export function parseKml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('KML nije ispravan XML');
  const styles = {};
  for (const st of kids(doc, 'Style')) {
    const id = st.getAttribute('id');
    if (!id) continue;
    const line = kids(st, 'LineStyle')[0];
    const poly = kids(st, 'PolyStyle')[0];
    styles[`#${id}`] = {
      line: line ? kmlColor(text(line, 'color')) : null,
      weight: line ? Number(text(line, 'width')) || null : null,
      fill: poly ? kmlColor(text(poly, 'color')) : null,
    };
  }
  const features = [];
  for (const pm of kids(doc, 'Placemark')) {
    const props = { name: text(pm, 'name') || '', opis: text(pm, 'description') || '' };
    const st = styles[text(pm, 'styleUrl') || ''];
    if (st) props._stil = st;
    for (const g of kmlGeometries(pm)) features.push({ type: 'Feature', geometry: g, properties: props });
  }
  return { type: 'FeatureCollection', features, naziv: text(doc, 'name') };
}

export function parseGpx(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX nije ispravan XML');
  const pt = (e) => [Number(e.getAttribute('lon')), Number(e.getAttribute('lat'))];
  const features = [];
  for (const w of kids(doc, 'wpt')) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: pt(w) }, properties: { name: text(w, 'name') || '' } });
  for (const t of kids(doc, 'trk')) {
    const segs = kids(t, 'trkseg').map((s) => kids(s, 'trkpt').map(pt)).filter((s) => s.length > 1);
    if (segs.length) features.push({ type: 'Feature', geometry: segs.length === 1 ? { type: 'LineString', coordinates: segs[0] } : { type: 'MultiLineString', coordinates: segs }, properties: { name: text(t, 'name') || '' } });
  }
  for (const r of kids(doc, 'rte')) {
    const pts = kids(r, 'rtept').map(pt);
    if (pts.length > 1) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: { name: text(r, 'name') || '' } });
  }
  return { type: 'FeatureCollection', features };
}

// ---------------- pomoćno ----------------
export function bboxOf(gj) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
    } else c.forEach(walk);
  };
  gj.features.forEach((f) => f.geometry && walk(f.geometry.coordinates));
  return b;
}

export function countFeatures(gj) {
  return gj?.features?.length || 0;
}

const ext = (n) => String(n).toLowerCase().split('.').pop();
const baseName = (n) => String(n).replace(/\.[^.]+$/, '').split('/').pop();

async function fromShapefileParts(parts, naziv) {
  const shp = parts.shp && parseShp(await parts.shp());
  if (!shp) throw new Error('U fajlovima nema .shp');
  const cpg = parts.cpg ? new TextDecoder().decode(await parts.cpg()).trim() : '';
  const encoding = /1250/.test(cpg) ? 'windows-1250' : /1252|latin/i.test(cpg) ? 'windows-1252' : 'utf-8';
  const attrs = parts.dbf ? parseDbf(await parts.dbf(), encoding) : [];
  const prj = parts.prj ? new TextDecoder().decode(await parts.prj()) : null;
  return { naziv, geojson: shapefileToGeoJSON(shp, attrs, detectProjection(prj, shp)) };
}

// Jedan ili više izabranih fajlova -> { naziv, geojson }.
export async function importFiles(files) {
  const list = [...files];
  const shpParts = {};
  for (const f of list) if (['shp', 'dbf', 'prj', 'cpg'].includes(ext(f.name))) shpParts[ext(f.name)] = () => f.arrayBuffer();
  if (shpParts.shp) return fromShapefileParts(shpParts, baseName(list.find((f) => ext(f.name) === 'shp').name));
  const f = list[0];
  if (!f) throw new Error('Nije izabran fajl');
  const e = ext(f.name);
  if (e === 'kml') { const gj = parseKml(await f.text()); return { naziv: gj.naziv || baseName(f.name), geojson: gj }; }
  if (e === 'gpx') return { naziv: baseName(f.name), geojson: parseGpx(await f.text()) };
  if (e === 'kmz' || e === 'zip') {
    const zip = readZip(await f.arrayBuffer());
    const names = [...zip.keys()];
    const kml = names.find((n) => /(^|\/)doc\.kml$/i.test(n)) || names.find((n) => /\.kml$/i.test(n));
    if (kml) {
      const gj = parseKml(new TextDecoder().decode(await zip.get(kml)()));
      return { naziv: gj.naziv || baseName(f.name), geojson: gj };
    }
    const parts = {};
    for (const n of names) if (['shp', 'dbf', 'prj', 'cpg'].includes(ext(n))) parts[ext(n)] = zip.get(n);
    if (parts.shp) return fromShapefileParts(parts, baseName(f.name));
    throw new Error('U ZIP-u nema KML ni SHP');
  }
  throw new Error(`Format .${e} nije podržan (KML, KMZ, GPX, SHP/ZIP)`);
}
