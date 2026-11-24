// Ploča "+" na mapi: zatvaranje i tekst o tome gdje se upisuje (GPS ili odabir na karti) — računa se pri otvaranju.
import { currentFix } from './gps.js';

export function addPositionText(fix, now = Date.now()) {
  if (!fix || !Number.isFinite(fix.lat)) return 'Nema GPS-a: upisuje se na mjestu odabranom na karti (sredina).';
  const age = fix.t ? Math.round((now - fix.t) / 60000) : 0;
  const acc = Number.isFinite(fix.acc) ? ` ±${Math.round(fix.acc)} m` : '';
  if (age >= 2) return `Zadnji GPS${acc} prije ${age} min — provjeri poziciju u formi.`;
  return `Na tvojoj GPS poziciji${acc}.`;
}

export function initDodaj() {
  const menu = document.getElementById('meni-dodaj');
  const text = document.getElementById('dodaj-pozicija');
  if (!menu) return;
  document.getElementById('btn-dodaj-zatvori')?.addEventListener('click', () => { menu.hidden = true; });
  document.getElementById('btn-dodaj')?.addEventListener('click', () => {
    if (!menu.hidden && text) text.textContent = addPositionText(currentFix());
  });
}
