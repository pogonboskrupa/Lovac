// Pregled slike preko cijelog ekrana (slika na poziciji, opažanje sa fotografijom): velika slika, crveni X,
// dodir na sliku ili dugme "Cijeli ekran" prebacuje na prikaz bez opisa preko cijelog ekrana.
import { registerBackHandler, toast } from './ui.js';

const $ = (id) => document.getElementById(id);
let ownedUrl = null;

export function closeImageViewer() {
  const viewer = $('slika-velika');
  if (!viewer || viewer.hidden) return false;
  viewer.hidden = true;
  viewer.classList.remove('pun');
  gallery = null;
  for (const id of ['btn-slika-prethodna', 'btn-slika-sljedeca', 'slika-velika-broj']) { const el = $(id); if (el) el.hidden = true; }
  $('slika-velika-img').removeAttribute('src');
  if (ownedUrl) { URL.revokeObjectURL(ownedUrl); ownedUrl = null; }
  try { if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* nije bitno */ }
  return true;
}

// Galerija: niz slika istog albuma; strelice, prevlačenje prstom i brojač "2 / 5".
let gallery = null; // { items: [{ src, caption, share }], index }

export function galleryStep(index, delta, length) {
  if (!length) return 0;
  return (((index + delta) % length) + length) % length;
}

function showGalleryItem() {
  const it = gallery.items[gallery.index];
  renderImage({ src: it.src, caption: it.caption, actions: gallery.actions, share: it.share ?? {} });
  $('slika-velika-broj').textContent = `${gallery.index + 1} / ${gallery.items.length}`;
}

// items: [{ src, caption, share }] — sve slike albuma (dataURL ili trajni URL; blob URL-ove oslobađa pozivalac).
export function openGallery(items, index = 0, { actions = [] } = {}) {
  const list = (items || []).filter((x) => x?.src);
  if (!list.length) return;
  openImageViewer({ src: list[0].src }); // zatvara prethodni prikaz i oslobađa njegov blob URL
  gallery = { items: list, index: Math.min(Math.max(index, 0), list.length - 1), actions };
  const multi = list.length > 1;
  for (const id of ['btn-slika-prethodna', 'btn-slika-sljedeca', 'slika-velika-broj']) $(id).hidden = !multi;
  showGalleryItem();
}

function stepGallery(delta) {
  if (!gallery || gallery.items.length < 2) return;
  gallery.index = galleryStep(gallery.index, delta, gallery.items.length);
  showGalleryItem();
}

// src: URL slike; revoke: true kad je blob URL napravljen samo za ovaj pregled (oslobađa se pri zatvaranju).
// actions: [{ label, onClick }] — dugmad ispod slike (npr. "Detalji").
// share: { lat, lon, opis } za "Pošalji lovcu" (uvijek prisutno osim share: false).
export function openImageViewer({ src, revoke = false, caption = '', actions = [], share = {} }) {
  const viewer = $('slika-velika');
  if (!viewer || !src) return;
  closeImageViewer();
  if (revoke) ownedUrl = src;
  renderImage({ src, caption, actions, share });
  viewer.hidden = false;
}

function renderImage({ src, caption = '', actions = [], share = {} }) {
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
  if (share !== false) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dugme';
    b.id = 'btn-slika-posalji';
    b.textContent = 'Pošalji lovcu';
    // slika se pročita PRIJE zatvaranja (zatvaranje oslobađa blob URL)
    b.addEventListener('click', async () => {
      try {
        const blob = await (await fetch(src)).blob();
        closeImageViewer();
        document.dispatchEvent(new CustomEvent('slika:posalji', { detail: { blob, opis: share.opis ?? caption, lat: share.lat, lon: share.lon } }));
      } catch (err) {
        console.warn('slika za slanje', err.message);
        toast('Slika se ne može pripremiti za slanje');
      }
    });
    box.append(b);
  }
  box.hidden = !box.children.length;
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
  let startX = null;
  let swiped = false;
  $('btn-slika-velika-zatvori').addEventListener('click', closeImageViewer);
  $('btn-slika-pun').addEventListener('click', toggleFull);
  $('slika-velika-img').addEventListener('click', () => { if (!swiped) toggleFull(); swiped = false; });
  $('btn-slika-prethodna').addEventListener('click', () => stepGallery(-1));
  $('btn-slika-sljedeca').addEventListener('click', () => stepGallery(1));
  // prevlačenje prstom lijevo/desno lista album
  viewer.addEventListener('pointerdown', (e) => { startX = gallery ? e.clientX : null; swiped = false; });
  viewer.addEventListener('pointerup', (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) { swiped = true; stepGallery(dx < 0 ? 1 : -1); }
  });
  viewer.addEventListener('click', (e) => { if (e.target === viewer && !swiped) closeImageViewer(); if (e.target === viewer) swiped = false; });
  // Registruje se zadnji, pa Nazad prvo zatvara sliku.
  registerBackHandler(() => closeImageViewer());
}
