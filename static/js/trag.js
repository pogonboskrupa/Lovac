// Čista logika traga: prijem tačaka, pauze kao intervali, statistika, uglačavanje, izvoz.
// Nema DOM-a ni pohrane, pa se testira u Node-u.

const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

export const MAX_ACC_M = 30;
// Tačka se pamti kad se pomjeri za "korak" (ovisi o tačnosti GPS-a: 3–10 m) ili kad prođe 15 s.
// Prije je bilo "5 s ili 5 m": stajanje je pravilo tačku svakih 5 s od samog šuma GPS-a (trag "kuca" i duži je nego što je prešlo),
// a polagano kretanje u malom prostoru se gubilo u tom šumu.
export const MIN_DT_MS = 15000;
export const MIN_DIST_M = 3;
export const MAX_STEP_M = 10;
export const AUTO_PAUSE_MS = 120000;
// Auto-pauza samo kad zaista stojiš: sve tačke 2 min unutar kruga koji prati tačnost GPS-a (4–6 m).
// Raniji krug od 15 m je pauzirao i lovca koji se polako kreće oko stana/nalaza, a nastavak je tražio 25 m pomaka.
export const AUTO_PAUSE_MIN_R_M = 4;
export const AUTO_PAUSE_MAX_R_M = 6;
export const AUTO_RESUME_MIN_M = 10;
const AUTO_PAUSE_COVER_MS = 15000;

export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function isPaused(t, pauze) {
  return pauze.some((p) => t >= p.od && (p.do == null || t < p.do));
}

function validPoint(p) {
  return p && Number.isFinite(p.t) && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Najmanji pomak koji se pamti: 0,6 × lošija tačnost dviju tačaka, 3–10 m (šum GPS-a nije kretanje).
export function stepThreshold(prev, p) {
  const acc = Math.max(Number.isFinite(prev?.acc) ? prev.acc : 0, Number.isFinite(p?.acc) ? p.acc : 0);
  return clamp(0.6 * acc, MIN_DIST_M, MAX_STEP_M);
}

export function acceptPoint(prev, p) {
  if (!validPoint(p)) return false;
  if (Number.isFinite(p.acc) && p.acc > MAX_ACC_M) return false;
  if (!prev) return true;
  if (p.t <= prev.t) return false;
  return p.t - prev.t >= MIN_DT_MS || haversine(prev, p) >= stepThreshold(prev, p);
}

// Filter GPS šuma pri snimanju (Kalman sa varijansom iz tačnosti fiksa): mjerenje sa lošom tačnošću slabo povlači položaj,
// pa se trag u malom prostoru ne cik-cakira od šuma, a pri hodu prati stvarni put. Pozicija se računa u metrima
// oko prve tačke (ravna aproksimacija je dovoljna na desetinama metara).
export const FILTER_Q_MS = 2.5; // koliko m/s se pozicija smije "pomjeriti" između fiksova (hod lovca)
export const FILTER_JUMP_MS = 30; // brže od ovoga (m/s) preko tačnosti je skok GPS-a, ne kretanje
const FILTER_MIN_ACC = 3;

export function newFilter() { return null; }

// Vraća { state, point }; point je null kad se fiks odbacuje (skok). Čista funkcija: stanje se vraća, ne mijenja.
// Brzina kretanja (v, m/s) se procjenjuje iz filtriranih pomaka i povećava dozvoljeno pomjeranje (q), pa filter
// ne kasni kad se kreće brže (auto, trčanje), a stoji čvrsto kad se ne kreće.
export function filterStep(state, p) {
  if (!validPoint(p)) return { state, point: null };
  const acc = clamp(Number.isFinite(p.acc) ? p.acc : 10, FILTER_MIN_ACC, MAX_ACC_M);
  if (!state) {
    const st = { t: p.t, lat: p.lat, lon: p.lon, v2: acc * acc, v: 0 };
    return { state: st, point: { ...p, acc } };
  }
  if (p.t <= state.t) return { state, point: null };
  const dt = Math.max(1, (p.t - state.t) / 1000); // fiksevi su najčešće na 1 s; razmaci kraći od toga se računaju kao 1 s
  if (haversine(state, p) > 4 * acc + 20 + dt * FILTER_JUMP_MS) return { state, point: null };
  const q = Math.max(FILTER_Q_MS, 2 * state.v);
  const v2 = state.v2 + dt * q * q;
  const k = v2 / (v2 + acc * acc);
  const lat = state.lat + k * (p.lat - state.lat);
  const lon = state.lon + k * (p.lon - state.lon);
  const v = 0.7 * state.v + 0.3 * Math.min(FILTER_JUMP_MS, haversine(state, { lat, lon }) / dt);
  const st = { t: p.t, lat, lon, v2: (1 - k) * v2, v };
  const out = { t: p.t, lat, lon, acc: Math.max(FILTER_MIN_ACC, Math.sqrt(st.v2)) };
  if (Number.isFinite(p.alt)) out.alt = p.alt;
  return { state: st, point: out };
}

// Cijeli niz (sortiran po vremenu) kroz filter; vraća { points, state }.
export function filterFixes(points, state = null) {
  let st = state;
  const out = [];
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    const r = filterStep(st, p);
    st = r.state;
    if (r.point) out.push(r.point);
  }
  return { points: out, state: st };
}

// Spaja nove tačke (i ponovno pročitan native bafer) bez duplikata, bez tačaka iz pauza
// i bez tačaka prije starta ili poslije kraja traga.
export function mergePoints(existing, incoming, trag) {
  const out = existing.slice();
  let last = out.length ? out[out.length - 1] : null;
  const sorted = incoming.filter(validPoint).sort((a, b) => a.t - b.t);
  for (const p of sorted) {
    if (p.t < trag.start) continue;
    if (trag.kraj != null && p.t > trag.kraj) continue;
    if (last && p.t <= last.t) continue;
    if (isPaused(p.t, trag.pauze)) continue;
    if (!acceptPoint(last, p)) continue;
    const clean = { t: p.t, lat: p.lat, lon: p.lon, acc: p.acc };
    if (Number.isFinite(p.alt)) clean.alt = p.alt;
    out.push(clean);
    last = clean;
  }
  return out;
}

export function newTrack({ id, start, naziv, vrsta = 'obilazak', autoPauza = true }) {
  return { id, naziv, vrsta, start, kraj: null, status: 'snima', pauze: [], autoPauza, tacke: [], uglacan: false };
}

function openPause(trag) {
  return trag.pauze.find((p) => p.do == null);
}

export function pauseTrack(trag, t, auto = false) {
  if (trag.status === 'gotovo' || openPause(trag)) return trag;
  return { ...trag, status: 'pauza', pauze: [...trag.pauze, { od: t, do: null, auto }] };
}

export function resumeTrack(trag, t) {
  if (trag.status === 'gotovo') return trag;
  return { ...trag, status: 'snima', pauze: trag.pauze.map((p) => (p.do == null ? { ...p, do: t } : p)) };
}

// Stop zatvara otvoren interval pauze, inače bi se sve poslije pauze smatralo pauzom.
export function stopTrack(trag, t) {
  if (trag.status === 'gotovo') return trag;
  return { ...resumeTrack(trag, t), status: 'gotovo', kraj: t };
}

export function movingTime(trag, now = Date.now()) {
  const end = trag.kraj ?? now;
  const paused = trag.pauze.reduce((sum, p) => {
    const a = Math.max(p.od, trag.start);
    const b = Math.min(p.do ?? end, end);
    return sum + Math.max(0, b - a);
  }, 0);
  return Math.max(0, end - trag.start - paused);
}

// Trag kraći od ovoga se ne čuva u Moji tragovi (šetnja oko auta, slučajan start). Potraga je izuzeta: dokaz je i kratka.
export const MIN_TRACK_M = 50;

// Trag sa tačkom usput ili znakom nije slučajan start: i kratak se čuva.
export function isTrackTooShort(tr) {
  if (tr.vrsta === 'potraga' || (tr.tackeInteresa || []).length || (tr.krv || []).length) return false;
  return trackDistance(tr.tacke) < MIN_TRACK_M;
}

export function trackDistance(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

function centroid(points) {
  const n = points.length;
  return { lat: points.reduce((s, p) => s + p.lat, 0) / n, lon: points.reduce((s, p) => s + p.lon, 0) / n };
}

function medianAcc(points) {
  const a = points.map((p) => p.acc).filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 5;
}

// Krug u kojem se tačke 2 min smatraju stajanjem: prati tačnost GPS-a, ali nikad preko 6 m.
export function pauseRadius(points) {
  return clamp(1.2 * medianAcc(points), AUTO_PAUSE_MIN_R_M, AUTO_PAUSE_MAX_R_M);
}

export function resumeDistance(points) {
  return Math.max(AUTO_RESUME_MIN_M, 2 * medianAcc(points));
}

// Prva tačka poslije auto-pauze koja je dalje od sidra od praga (i tačka prije nje, da se trag nastavi bez rupe).
// Vraća vrijeme od kojeg treba nastaviti trag, ili null kad pokreta nema.
export function resumeFrom(trag, recent) {
  const pause = openPause(trag);
  if (!pause?.auto) return null;
  const good = recent.filter((p) => validPoint(p) && !(p.acc > MAX_ACC_M)).sort((a, b) => a.t - b.t);
  const before = good.filter((p) => p.t <= pause.od);
  const anchor = before.length ? before[before.length - 1] : trag.tacke[trag.tacke.length - 1];
  if (!anchor) return null;
  const limit = resumeDistance(good.filter((p) => p.t > pause.od - 60000));
  const after = good.filter((p) => p.t > pause.od);
  const i = after.findIndex((p) => haversine(anchor, p) > limit);
  if (i < 0) return null;
  return i > 0 ? after[i - 1].t : Math.max(pause.od, after[i].t - 1);
}

// recent = sirove tačke posljednjih minuta (i iz pauze), jer se pokret otkriva i tokom pauze.
export function autoPauseCheck(trag, recent, now) {
  if (!trag.autoPauza || trag.status === 'gotovo') return null;
  const good = recent.filter((p) => validPoint(p) && !(p.acc > MAX_ACC_M));
  if (trag.status === 'snima') {
    if (now - trag.start < AUTO_PAUSE_MS) return null;
    const win = good.filter((p) => p.t >= now - AUTO_PAUSE_MS);
    if (win.length < 3 || win[0].t > now - AUTO_PAUSE_MS + AUTO_PAUSE_COVER_MS) return null;
    const c = centroid(win);
    const r = pauseRadius(win);
    return win.every((p) => haversine(c, p) <= r) ? 'pauza' : null;
  }
  return resumeFrom(trag, recent) != null ? 'nastavi' : null;
}

// Pomični prosjek (centriran, do 2 tačke sa svake strane). Original se čuva u tragu.
export function smoothPoints(points, radius = 2) {
  const n = points.length;
  return points.map((p, i) => {
    const r = Math.min(radius, i, n - 1 - i);
    if (r === 0) return { ...p };
    let lat = 0;
    let lon = 0;
    for (let j = i - r; j <= i + r; j++) { lat += points[j].lat; lon += points[j].lon; }
    return { ...p, lat: lat / (2 * r + 1), lon: lon / (2 * r + 1) };
  });
}

export function segmentsByPauses(points, pauze) {
  const segs = [];
  let cur = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = points[i - 1];
    if (prev && pauze.some((ps) => ps.od > prev.t && ps.od <= p.t)) {
      if (cur.length) segs.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

export function escapeXml(s) {
  return String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

function gpxWaypoints(wpts) {
  return wpts.map((w) => `  <wpt lat="${w.lat.toFixed(7)}" lon="${w.lon.toFixed(7)}"><time>${new Date(w.t).toISOString()}</time><name>${escapeXml(w.naziv)}</name></wpt>\n`).join('');
}

export function toGpx(trag, points, wpts = []) {
  const segs = segmentsByPauses(points, trag.pauze).map((seg) => {
    const pts = seg.map((p) => {
      const ele = Number.isFinite(p.alt) ? `<ele>${p.alt.toFixed(1)}</ele>` : '';
      return `<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`;
    }).join('\n      ');
    return `    <trkseg>\n      ${pts}\n    </trkseg>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LD Grmec" xmlns="http://www.topografix.com/GPX/1/1">
${gpxWaypoints(wpts)}  <trk>
    <name>${escapeXml(trag.naziv)}</name>
${segs}
  </trk>
</gpx>
`;
}

export function toKml(trag, points, wpts = []) {
  const lines = segmentsByPauses(points, trag.pauze).map((seg) => {
    const coords = seg.map((p) => `${p.lon.toFixed(7)},${p.lat.toFixed(7)}${Number.isFinite(p.alt) ? `,${p.alt.toFixed(1)}` : ''}`).join(' ');
    return `<LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>`;
  });
  const geom = lines.length > 1 ? `<MultiGeometry>${lines.join('')}</MultiGeometry>` : (lines[0] || '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(trag.naziv)}</name>
    <Style id="trag"><LineStyle><color>ff1f5aff</color><width>4</width></LineStyle></Style>
    <Placemark><name>${escapeXml(trag.naziv)}</name><styleUrl>#trag</styleUrl>${geom}</Placemark>
${wpts.map((w) => `    <Placemark><name>${escapeXml(w.naziv)}</name><Point><coordinates>${w.lon.toFixed(7)},${w.lat.toFixed(7)}</coordinates></Point></Placemark>`).join('\n')}
  </Document>
</kml>
`;
}

const pad = (n) => String(n).padStart(2, '0');

export function trackFileName(trag, ext) {
  const d = new Date(trag.start);
  return `trag-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${ext}`;
}

export function defaultTrackName(t = Date.now()) {
  const d = new Date(t);
  return `Obilazak ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2).replace('.', ',')} km`;
}

export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${pad(m)} min` : `${m} min ${pad(s % 60)} s`;
}

// Jedan tajmer za crash-snimak svih snimanja (trag, potraga...). Gasi se tek kad nijedno ne traje.
export function createSnapshotTimer(save, ms = 30000, timers = globalThis) {
  const active = new Set();
  let handle = null;
  return {
    start(id) {
      active.add(id);
      if (handle == null) handle = timers.setInterval(() => save([...active]), ms);
    },
    stop(id) {
      active.delete(id);
      if (!active.size && handle != null) {
        timers.clearInterval(handle);
        handle = null;
      }
    },
    isRunning: () => handle != null,
  };
}

// Ciljevi za "Vodi me nazad" u potrazi: tačka nastrijela, najbliža čeka, najbliže vozilo, početak traga.
export function nearestReturnTargets(from, objekti, potraga) {
  const out = [];
  if (potraga?.nastrijel) out.push({ vrsta: 'nastrijel', naziv: 'Tačka nastrijela', ...potraga.nastrijel });
  const nearest = (pred) => objekti.filter(pred)
    .map((o) => ({ ...o, d: haversine(from, o) }))
    .sort((a, b) => a.d - b.d)[0];
  const ceka = nearest((o) => /^ceka/.test(o.vrsta));
  if (ceka) out.push({ vrsta: 'ceka', naziv: ceka.naziv, lat: ceka.lat, lon: ceka.lon });
  const auto = nearest((o) => o.vrsta === 'parking');
  if (auto) out.push({ vrsta: 'auto', naziv: auto.naziv, lat: auto.lat, lon: auto.lon });
  const first = potraga?.tacke?.[0];
  if (first) out.push({ vrsta: 'pocetak', naziv: 'Početak traga potrage', lat: first.lat, lon: first.lon });
  return out;
}

export function trackWaypoints(trag) {
  const w = [];
  if (trag.nastrijel) w.push({ ...trag.nastrijel, naziv: 'Nastrijel' });
  const ZNAK = { krv: 'Krv', dlaka: 'Dlaka', kost: 'Kost', lezaj: 'Ležaj', drugo: 'Znak' };
  for (const k of trag.krv || []) { const n = ZNAK[k.tip] || 'Krv'; w.push({ ...k, naziv: k.napomena ? `${n}: ${k.napomena}` : n }); }
  return w;
}
