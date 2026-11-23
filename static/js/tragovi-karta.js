// Moji tragovi u "Granice lovišta" (čista logika): koji su najbliži sredini karte i stil linije na karti.

export const BOJE_TRAGA = ['#e11d48', '#2f7dff', '#f59e0b', '#16a34a', '#9333ea', '#0f172a', '#ffffff'];
export const DEBLJINE_TRAGA = [2, 4, 6];
export const LINIJE_TRAGA = { puna: { naziv: 'Puna', dash: null }, isprekidana: { naziv: 'Isprekidana', dash: '12 8' }, tackasta: { naziv: 'Tačkasta', dash: '1 8' } };
export const STIL_ZADANI = { boja: '#e11d48', debljina: 4, linija: 'puna' };

export function normalizeStyle(s) {
  const x = s && typeof s === 'object' ? s : {};
  return {
    boja: BOJE_TRAGA.includes(x.boja) ? x.boja : STIL_ZADANI.boja,
    debljina: DEBLJINE_TRAGA.includes(x.debljina) ? x.debljina : STIL_ZADANI.debljina,
    linija: LINIJE_TRAGA[x.linija] ? x.linija : STIL_ZADANI.linija,
  };
}

// Opcije Leaflet linije; bijela linija dobija tanak tamni rub drugom linijom (vidi tragovi-karta-ui).
export function polylineStyle(stil) {
  const s = normalizeStyle(stil);
  const dash = LINIJE_TRAGA[s.linija].dash;
  return { color: s.boja, weight: s.debljina, opacity: 0.9, lineCap: s.linija === 'tackasta' ? 'round' : 'butt', ...(dash ? { dashArray: dash } : {}) };
}

const R = 6371000;
const DEG = Math.PI / 180;

// Udaljenost tačke od DUŽI (ravna projekcija oko tačke; za udaljenosti u lovištu greška je zanemariva).
function pointSegmentM(p, a, b) {
  const kx = Math.cos(p.lat * DEG) * DEG * R;
  const ky = DEG * R;
  const ax = (a.lon - p.lon) * kx; const ay = (a.lat - p.lat) * ky;
  const bx = (b.lon - p.lon) * kx; const by = (b.lat - p.lat) * ky;
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function distanceToTrack(points, center) {
  const pts = (points || []).filter((q) => Number.isFinite(q?.lat) && Number.isFinite(q?.lon));
  if (!pts.length || !center) return Infinity;
  if (pts.length === 1) return pointSegmentM(center, pts[0], pts[0]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, pointSegmentM(center, pts[i - 1], pts[i]));
  return best;
}

// Redoslijed: 'blizi' (najbliži sredini karte; zadano) ili 'novije'. Tragovi bez tačaka idu na kraj.
export function orderTracks(tracks, center, mode = 'blizi') {
  const rows = tracks.map((t) => ({ t, d: distanceToTrack(t.tacke, center) }));
  if (mode === 'novije') return rows.sort((a, b) => (b.t.start || 0) - (a.t.start || 0));
  return rows.sort((a, b) => a.d - b.d || (b.t.start || 0) - (a.t.start || 0));
}

export function distanceLabel(m) {
  if (!Number.isFinite(m)) return 'bez tačaka';
  if (m < 50) return 'u sredini karte';
  return m < 1000 ? `${Math.round(m / 10) * 10} m od sredine karte` : `${(m / 1000).toFixed(1).replace('.', ',')} km od sredine karte`;
}
