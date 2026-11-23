// Sloj "Nagib terena" (čista logika): nagib iz Terrarium DEM pločica (zoom 13), boje iznad praga i izbor pločice.
// Procjena iz modela terena (ćelija ~14 m): orijentaciona, ne zamjenjuje procjenu na terenu.

export const NAGIB_PRAGOVI = [20, 25, 30, 35, 40];
export const NAGIB_ZADANI = 30;
export const NAGIB_MIN_ZOOM = 13; // DEM pločice su zoom 13: ispod toga bi jedna pločica karte tražila desetine DEM pločica
export const DEM_Z = 13;

// Boje po klasama iznad praga: prag…+5° žuta, +5…+10° narandžasta, +10…+15° crvena, +15° i više ljubičasta (RGBA).
export const NAGIB_KLASE = [
  null,
  [250, 204, 21, 150],
  [249, 115, 22, 170],
  [220, 38, 38, 190],
  [126, 34, 206, 205],
];

export function normalizeSlopeSettings(v) {
  const s = v && typeof v === 'object' ? v : {};
  return { on: s.on === true, prag: NAGIB_PRAGOVI.includes(s.prag) ? s.prag : NAGIB_ZADANI };
}

// Veličina DEM ćelije u metrima na geografskoj širini (Web Mercator: metri po pikselu opadaju sa cos(lat)).
export function cellSizeM(lat, z = DEM_Z) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

export function tileCenterLat(y, z = DEM_Z) {
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

// Terrarium: visina = R·256 + G + B/256 − 32768.
export function elevationsFromRgba(rgba) {
  const out = new Float32Array(256 * 256);
  for (let i = 0; i < out.length; i++) out[i] = rgba[i * 4] * 256 + rgba[i * 4 + 1] + rgba[i * 4 + 2] / 256 - 32768;
  return out;
}

// Nagib u stepenima (0–90) po Hornovoj metodi (3×3, ista kao u GIS alatima; ublažava šum). Rubovi pločice se kopiraju.
export function slopeGrid(elev, cell) {
  const out = new Uint8Array(256 * 256);
  const at = (x, y) => elev[Math.min(255, Math.max(0, y)) * 256 + Math.min(255, Math.max(0, x))];
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const a = at(x - 1, y - 1); const b = at(x, y - 1); const c = at(x + 1, y - 1);
      const d = at(x - 1, y); const f = at(x + 1, y);
      const g = at(x - 1, y + 1); const h = at(x, y + 1); const i = at(x + 1, y + 1);
      const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * cell);
      const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * cell);
      out[y * 256 + x] = Math.min(90, Math.round((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI));
    }
  }
  return out;
}

export function slopeClass(deg, prag) {
  if (!(deg >= prag)) return 0;
  return Math.min(4, 1 + Math.floor((deg - prag) / 5));
}

// Koji dio koje DEM pločice (zoom 13) pokriva pločica karte (Z ≥ 13): obje su Web Mercator, pa je to čisto skaliranje.
export function demRegion(z, tx, ty) {
  const n = 2 ** (z - DEM_Z);
  const sw = 256 / n;
  return { dx: Math.floor(tx / n), dy: Math.floor(ty / n), sx: (tx % n) * sw, sy: (ty % n) * sw, sw };
}

export function legendRows(prag) {
  return NAGIB_KLASE.slice(1).map((c, i) => ({
    od: prag + i * 5,
    do: i < 3 ? prag + (i + 1) * 5 : null,
    boja: `rgba(${c[0]}, ${c[1]}, ${c[2]}, 1)`,
  }));
}

export function legendText(prag) {
  return legendRows(prag).map((r) => (r.do == null ? `${r.od}° i više` : `${r.od}–${r.do}°`)).join(' · ');
}
