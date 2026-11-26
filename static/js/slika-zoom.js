// Zumiranje slike u pregledu: čista matematika (testirana) — dva prsta, dupli dodir i točkić miša.
// Stanje { scale, tx, ty }: transform je translate(tx, ty) scale(scale) oko sredine slike.

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
export const DOUBLE_TAP_SCALE = 2.5;

export const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

// Veličina slike koju stvarno vidimo (object-fit: contain) unutar elementa ew × eh.
export function containedSize(ew, eh, nw, nh) {
  if (!(nw > 0 && nh > 0)) return { w: ew, h: eh };
  return ew / eh > nw / nh ? { w: eh * (nw / nh), h: eh } : { w: ew, h: ew * (nh / nw) };
}

// Pomak ne smije otkriti prazninu: slika uvećana preko ekrana se pomjera do svog ruba, a manja od ekrana stoji u sredini.
export function clampPan(scale, tx, ty, { iw, ih, vw, vh }) {
  const mx = Math.max(0, (iw * scale - vw) / 2);
  const my = Math.max(0, (ih * scale - vh) / 2);
  return { tx: Math.min(mx, Math.max(-mx, tx)), ty: Math.min(my, Math.max(-my, ty)) };
}

// Nova razmjera tako da tačka (fx, fy), mjerena od sredine ekrana, ostane ispod prstiju.
export function zoomAt(state, newScale, fx, fy, box) {
  const s = clampScale(newScale);
  const k = s / state.scale;
  const p = clampPan(s, fx - (fx - state.tx) * k, fy - (fy - state.ty) * k, box);
  return { scale: s, ...p };
}

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// Dupli dodir: uvećaj na tački dodira, ili vrati na cijelu sliku ako je već uvećana.
export function doubleTap(state, fx, fy, box) {
  return state.scale > 1.01 ? { scale: 1, tx: 0, ty: 0 } : zoomAt(state, DOUBLE_TAP_SCALE, fx, fy, box);
}

export const transformCss = (s) => (s.scale === 1 && !s.tx && !s.ty ? '' : `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`);
