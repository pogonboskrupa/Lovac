// Veličina i grupisanje markera lovaca na karti (čista logika). Marker prati razmjeru (manji kad je karta manje uvećana),
// smanjuje se kad je lovaca puno, a lovci koji bi se prekrili skupljaju se u jedan znak sa brojem.

export const BASE_PX = 34;
export const MIN_PX = 16;
export const MAX_PX = 38;
export const INITIALS_MIN_PX = 22; // ispod ovoga inicijali se ne čitaju, ostaje samo obojen krug

// zoomFactor: 10 % po nivou zooma oko "radnog" zooma 15; countFactor: do 8 lovaca puna veličina, do 30 lovaca 70 %.
export function markerDiameter(zoom, count = 1) {
  const zf = Math.min(1.15, Math.max(0.55, 1.10 ** ((Number.isFinite(zoom) ? zoom : 15) - 15)));
  const cf = 1 - Math.min(0.3, Math.max(0, (count - 8) * 0.0136));
  return Math.round(Math.min(MAX_PX, Math.max(MIN_PX, BASE_PX * zf * cf)));
}

export const showInitials = (d) => d >= INITIALS_MIN_PX;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Grupisanje: članovi čiji su krugovi bliži od ~85 % prečnika idu u istu grupu. Po "sjemenu" (prvi neraspoređen),
// ne tranzitivno — lanac blizih lovaca ne sliva se u jedan veliki znak. `project(m)` daje piksele ekrana.
export function clusterMembers(members = [], project, diameter) {
  const limit = diameter * 0.85;
  const pts = members.map((m) => ({ m, p: project(m) }));
  const used = new Set();
  const groups = [];
  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue;
    const grp = [pts[i]];
    used.add(i);
    for (let j = i + 1; j < pts.length; j++) {
      if (!used.has(j) && dist(pts[i].p, pts[j].p) < limit) { grp.push(pts[j]); used.add(j); }
    }
    const n = grp.length;
    groups.push({
      members: grp.map((g) => g.m),
      lat: grp.reduce((s, g) => s + g.m.lat, 0) / n,
      lon: grp.reduce((s, g) => s + g.m.lon, 0) / n,
    });
  }
  return groups;
}

// Znak grupe je malo veći od običnog markera da broj stane.
export const groupDiameter = (d) => Math.max(22, Math.round(d * 1.15));
