// Minirana područja (podaci BHMAC): čista logika sloja. Sloj se preuzima u aplikaciji (ne ulazi u APK), pamti u IndexedDB
// store-u "slojevi" pod stalnim id-em i radi bez interneta. Ne dira DOM.

export const MINIRANO_ID = 'bhmac-minirano';
export const MINIRANO_NAZIV = 'Minirana područja (BHMAC)';
// Crvena popuna sa 60 % neprozirnosti (odluka vlasnika), crvena linija; kontrast na svim podlogama daje obrub.
export const MINIRANO_STIL = { boja: '#d40000', debljina: 2, popuna: true, popunaOpacity: 0.6, vidljiv: true };
export const OSVJEZI_NAKON_MS = 7 * 24 * 3600 * 1000; // provjera nove verzije jednom sedmično (fajl je mali)
export const NAPOMENA = 'Podaci BHMAC-a su orijentacioni i ne zamjenjuju oznake na terenu ni upozorenja nadležnih. Ne ulazi u minski sumnjivo područje.';

export function isMinefieldLayer(s) {
  return s?.id === MINIRANO_ID || s?.izvor === 'bhmac';
}

// Treba li ponovo preuzeti: nema sloja ili je stariji od sedmice.
export function needsRefresh(layer, now = Date.now()) {
  if (!layer?.geojson?.features?.length) return true;
  const t = Number(layer.preuzeto);
  return !Number.isFinite(t) || now - t > OSVJEZI_NAKON_MS;
}

// Preuzeti GeoJSON -> zapis za store; stil koji je lovac promijenio (npr. sakrio sloj) se čuva.
export function buildLayer(geojson, now = Date.now(), prev = null) {
  const features = (geojson?.features || []).filter((f) => ['Polygon', 'MultiPolygon'].includes(f.geometry?.type));
  if (!features.length) throw new Error('U fajlu nema minskih područja');
  return {
    id: MINIRANO_ID,
    naziv: MINIRANO_NAZIV,
    izvor: 'bhmac',
    geojson: { type: 'FeatureCollection', features },
    stil: { ...MINIRANO_STIL, ...(prev?.stil ? { vidljiv: prev.stil.vidljiv !== false } : {}) },
    preuzeto: now,
  };
}

export function areaText(m2) {
  const n = Number(m2);
  if (!Number.isFinite(n) || n <= 0) return '';
  return n >= 1e6 ? `${(n / 1e6).toFixed(2).replace('.', ',')} km²` : `${Math.round(n / 100) / 100} ha`.replace('.', ',');
}

export function popupLines(props = {}) {
  const p = props.podaci || {};
  const lines = [];
  const naziv = (p.Naziv || props.name || '').trim();
  if (naziv) lines.push(naziv);
  const a = areaText(p.SHAPE_Area);
  if (a) lines.push(`Površina oko ${a}`);
  return lines;
}

// Stanje za karticu u "Granice lovišta".
export function minefieldStatusText(layer, now = Date.now()) {
  if (!layer) return 'Još nije preuzeto. Preuzmi dok imaš internet, poslije radi bez njega.';
  const days = Math.floor((now - Number(layer.preuzeto || 0)) / 86400000);
  const when = days <= 0 ? 'danas' : days === 1 ? 'jučer' : `prije ${days} dana`;
  return `${layer.geojson?.features?.length || 0} područja · preuzeto ${when}`;
}

// Greške preuzimanja prevedene za lovca (404 = BHMAC fajl još nije objavljen na serveru podataka).
export function downloadErrorText(status, message = '') {
  if (status === 404) return 'Podaci o miniranim područjima još nisu objavljeni. Javi administratoru.';
  if (status) return `Server je vratio grešku ${status}.`;
  return `Nema veze (${message || 'greška mreže'}). Pokušaj ponovo kad imaš internet.`;
}
