// Logo sekcije: učitana slika ili automatski crtan znak (štit sa inicijalima, boja iz naziva) — uvijek isti za isti naziv.

export function hashString(s) {
  let h = 2166136261;
  for (const ch of String(s ?? '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Do dva slova: početna slova prve dvije riječi ("Krupa 1" → "K1", "Jezerski" → "JE").
export function logoInitials(naziv) {
  const words = String(naziv ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const pick = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return pick.toUpperCase();
}

const esc = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

export function autoLogoSvg(naziv, size = 128) {
  const h = hashString(naziv);
  const hue1 = h % 360;
  const hue2 = (hue1 + 40 + (h >> 9) % 60) % 360;
  const txt = esc(logoInitials(naziv));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue1} 55% 32%)"/><stop offset="1" stop-color="hsl(${hue2} 60% 22%)"/></linearGradient></defs>`
    + '<path d="M64 6 112 22v42c0 30-20 49-48 58C36 113 16 94 16 64V22Z" fill="url(#g)" stroke="#f1f5f9" stroke-width="5" stroke-linejoin="round"/>'
    + '<path d="M64 20 100 32v32c0 22-14 36-36 44C42 100 28 86 28 64V32Z" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>'
    + `<text x="64" y="76" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="${txt.length > 1 ? 44 : 56}" fill="#ffffff">${txt}</text></svg>`;
}

export function autoLogoDataUrl(naziv) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(autoLogoSvg(naziv))}`;
}

export const logoOf = (sekcija) => sekcija?.logo || autoLogoDataUrl(sekcija?.naziv);
export const logoStyle = (sekcija) => `background-image:url('${logoOf(sekcija)}')`;
