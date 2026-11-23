// Pregled slike preko cijelog ekrana (slika na poziciji, opažanje sa fotografijom): velika slika, crveni X,
// dodir na sliku ili dugme "Cijeli ekran" prebacuje na prikaz bez opisa preko cijelog ekrana.
import { registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);
let ownedUrl = null;

export function closeImageViewer() {
  const viewer = $('slika-velika');
  if (!viewer || viewer.hidden) return false;
  viewer.hidden = true;
  viewer.classList.remove('pun');
  $('slika-velika-img').removeAttribute('src');
  if (ownedUrl) { URL.revokeObjectURL(ownedUrl); ownedUrl = null; }
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* nije bitno */ }
  return true;
}

// src: URL slike; revoke: true kad je blob URL napravljen samo za ovaj pregled (oslobađa se pri zatvaranju).
// actions: [{ label, onClick }] — dugmad ispod slike (npr. "Detalji").
export function openImageViewer({ src, revoke = false, caption = '', actions = [] }) {
  const viewer = $('slika-velika');
  if (!viewer || !src) return;
  closeImageViewer();
  if (revoke) ownedUrl = src;
  $('slika-velika-img').src = src;
  $('slika-velika-opis').textContent = caption;
  const box = $('slika-velika-akcije');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dugme';
    b.textContent = a.label;
    b.addEventListener('click', () => { closeImageViewer(); a.onClick(); });
    box.append(b);
  }
  box.hidden = !actions.length;
  viewer.hidden = false;
}

function toggleFull() {
  const viewer = $('slika-velika');
  const full = viewer.classList.toggle('pun');
  $('btn-slika-pun').setAttribute('aria-pressed', String(full));
  // Preglednik može i pravi cijeli ekran; u aplikaciji su sistemske trake ionako sakrivene.
  try {
    if (full) viewer.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch { /* nije podržano */ }
}

export function initImageViewer() {
  const viewer = $('slika-velika');
  if (!viewer) return;
  $('btn-slika-velika-zatvori').addEventListener('click', closeImageViewer);
  $('btn-slika-pun').addEventListener('click', toggleFull);
  $('slika-velika-img').addEventListener('click', toggleFull);
  viewer.addEventListener('click', (e) => { if (e.target === viewer) closeImageViewer(); });
  // Registruje se zadnji, pa Nazad prvo zatvara sliku.
  registerBackHandler(() => closeImageViewer());
}
