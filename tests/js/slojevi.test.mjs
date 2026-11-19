import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { readZip, parseShp, parseDbf, detectProjection, shapefileToGeoJSON, kmlColor, bboxOf, countFeatures } from '../../static/js/slojevi.js';

// Minimalan ZIP (lokalna zaglavlja + centralni direktorij), deflate ili stored.
function makeZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content, method] of files) {
    const raw = Buffer.from(content);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const nameB = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameB.length, 26);
    locals.push(local, nameB, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 6); c.writeUInt16LE(method, 10);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    centrals.push(c, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, cd, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

test('ZIP: deflate i stored unosi (KMZ, zipovan SHP)', async () => {
  const zip = readZip(makeZip([['doc.kml', '<kml>Č</kml>', 8], ['a/b.txt', 'stored', 0]]));
  assert.deepEqual([...zip.keys()], ['doc.kml', 'a/b.txt']);
  assert.equal(new TextDecoder().decode(await zip.get('doc.kml')()), '<kml>Č</kml>');
  assert.equal(new TextDecoder().decode(await zip.get('a/b.txt')()), 'stored');
});

// SHP sa jednim poligonom (tip 5) u GK6 koordinatama.
function makeShpPolygon(ring) {
  const nPoints = ring.length;
  const content = 4 + 32 + 4 + 4 + 4 + nPoints * 16;
  const rec = Buffer.alloc(8 + content);
  rec.writeInt32BE(1, 0); rec.writeInt32BE(content / 2, 4);
  rec.writeInt32LE(5, 8);
  rec.writeInt32LE(1, 44); rec.writeInt32LE(nPoints, 48); rec.writeInt32LE(0, 52);
  ring.forEach(([x, y], i) => { rec.writeDoubleLE(x, 56 + i * 16); rec.writeDoubleLE(y, 64 + i * 16); });
  const head = Buffer.alloc(100);
  head.writeInt32BE(9994, 0); head.writeInt32BE((100 + rec.length) / 2, 24); head.writeInt32LE(1000, 28); head.writeInt32LE(5, 32);
  const all = Buffer.concat([head, rec]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length);
}

function makeDbf(rows) {
  const fields = [['NAZIV', 20]];
  const headerLen = 32 + fields.length * 32 + 1;
  const recLen = 1 + fields.reduce((s, f) => s + f[1], 0);
  const buf = Buffer.alloc(headerLen + rows.length * recLen + 1, 0x20);
  buf.writeUInt8(3, 0); buf.writeUInt32LE(rows.length, 4); buf.writeUInt16LE(headerLen, 8); buf.writeUInt16LE(recLen, 10);
  fields.forEach(([name, len], i) => {
    const o = 32 + i * 32;
    buf.fill(0, o, o + 32); buf.write(name, o, 'latin1'); buf.write('C', o + 11, 'latin1'); buf.writeUInt8(len, o + 16);
  });
  buf.writeUInt8(0x0d, headerLen - 1);
  rows.forEach((r, i) => { const o = headerLen + i * recLen; buf.write(' ', o); buf.write(r, o + 1, 'utf8'); });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

test('SHP + DBF + PRJ (GK zona 6) postaje GeoJSON u WGS84', () => {
  const ring = [[6342176.852, 4963671.602], [6381324.342, 4940596.778], [6342176.852, 4940596.778], [6342176.852, 4963671.602]];
  const shapes = parseShp(makeShpPolygon(ring));
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].type, 'Polygon');
  const attrs = parseDbf(makeDbf(['Revir Grmeč']), 'utf-8');
  assert.deepEqual(attrs, [{ NAZIV: 'Revir Grmeč' }]);
  assert.equal(detectProjection('PROJCS["MGI_Balkans_zone_6",GEOGCS["GCS_MGI"]]', shapes), 'gk6');
  assert.equal(detectProjection('GEOGCS["GCS_WGS_1984"]', [{ type: 'Point', coordinates: [16.1, 44.8] }]), 'wgs84');
  assert.equal(detectProjection(null, shapes), 'gk6', 'bez .prj: koordinate oko 6,3-6,7 mil. su GK6');
  const gj = shapefileToGeoJSON(shapes, attrs, 'gk6');
  const [lon, lat] = gj.features[0].geometry.coordinates[0][0];
  assert.ok(Math.abs(lat - 44.8) < 1e-5 && Math.abs(lon - 16.0) < 1e-5, `${lat},${lon}`);
  assert.equal(gj.features[0].properties.NAZIV, 'Revir Grmeč');
  assert.equal(gj.features[0].properties.name, 'Revir Grmeč');
});

test('KML boja aabbggrr -> CSS', () => {
  assert.deepEqual(kmlColor('ff0000ff'), { color: '#ff0000', opacity: 1 });
  assert.deepEqual(kmlColor('7f00ff00'), { color: '#00ff00', opacity: 0.5 });
  assert.equal(kmlColor('xyz'), null);
});

test('bbox i broj elemenata', () => {
  const gj = { type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [16, 44] }, properties: {} },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[15, 45], [17, 43]] }, properties: {} },
  ] };
  assert.deepEqual(bboxOf(gj), [15, 43, 17, 45]);
  assert.equal(countFeatures(gj), 2);
});
