// Pregled offline karata i slojeva (čista logika): brojke za hero i tekstovi.

import { formatBytes } from './postavke-pregled.js';

// tiles = broj pločica u kešu; terenInfo = info o teren.mbtiles ili null; maps = ostale offline karte.
export function offlineHero({ tiles = 0, terenInfo = null, maps = [], hasBridge = false }) {
  const velicina = maps.reduce((s, m) => s + (m.velicina || 0), 0) + (terenInfo?.velicina || 0);
  return [
    { id: 'plocice', v: String(tiles), l: 'pločica u kešu' },
    { id: 'karte', v: hasBridge ? String(maps.length + (terenInfo ? 1 : 0)) : '—', l: 'offline karata' },
    { id: 'velicina', v: hasBridge ? formatBytes(velicina) : '—', l: 'fajlova na telefonu' },
  ];
}

// Spremnost: šta još fali da karta radi bez interneta.
export function offlineAdvice({ tiles = 0, terenInfo = null, maps = [], hasBridge = false }) {
  if (hasBridge && (terenInfo || maps.length)) return { stanje: 'ok', tekst: 'Offline karta je na telefonu i radi bez interneta.' };
  if (tiles >= 50) return { stanje: 'djelimicno', tekst: 'Radi samo za dijelove koje si već pregledao. Preuzmi područje lova dok imaš internet.' };
  return { stanje: 'nema', tekst: 'Bez interneta karta neće imati pločica. Preuzmi područje lova ili teren dok imaš dobar signal.' };
}

export function layersSummary(layers, countFn = () => 0) {
  return {
    broj: layers.length,
    prikazanih: layers.filter((s) => s.stil?.vidljiv !== false).length,
    elemenata: layers.reduce((s, l) => s + countFn(l.geojson), 0),
  };
}

export function layerSource(s, now = Date.now()) {
  const kad = s.preuzeto || s.uvezeno;
  const dana = Number.isFinite(kad) ? Math.floor((now - kad) / 86400000) : null;
  const kad_t = dana === null ? '' : dana < 1 ? ' · danas' : ` · prije ${dana} d`;
  return `${s.izvor === 'server' ? `sa servera, verzija ${s.verzija}` : 'uvezen fajl'}${kad_t}`;
}
