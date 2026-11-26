// Pregled slike preko cijelog ekrana (slika na poziciji, opažanje sa fotografijom): velika slika, crveni X,
// dodir na sliku ili dugme "Cijeli ekran" prebacuje na prikaz bez opisa preko cijelog ekrana.
import { registerBackHandler, toast } from './ui.js';
import { clampPan, containedSize, distance, doubleTap, midpoint, transformCss, zoomAt } from './slika-zoom.js';

const $ = (id) => document.getElementById(id);
let ownedUrl = null;
let zs = { scale: 1, tx: 0, ty: 0 }; // zum slike (slika-zoom.js)
let multiTouched = false; // u ovom dodiru su bila dva prsta: nije listanje albuma

export function resetZoom() {
  zs = { scale: 1, tx: 0, ty: 0 };
  const img = $('slika-velika-img');
  if (img) img.style.transform = '';
  $('slika-velika')?.classList.remove('uvecana');
}

export function closeImageViewer() {
  const viewer = $('slika-velika');
  if (!viewer || viewer.hidden) return false;
  viewer.hidden = true;
  viewer.classList.remove('pun');
  gallery = null;
  resetZoom();
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
  renderImage({ src: it.src, caption: it.caption, actions: it.actions ?? gallery.actions, share: it.share ?? {} });
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
  resetZoom();
  $('slika-velika-img').src = src;
  $('slika-velika-opis').textContent = caption;
  const box = $('slika-velika-akcije');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dugme';
    b.textContent = a.label;
    b.addEventListener('click', () => { if (!a.keepOpen) closeImageViewer(); a.onClick(); });
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
  const img = $('slika-velika-img');
  let startX = null;
  let swiped = false;
  const pts = new Map();
  let pinch = null; // { dist, scale }
  let drag = null; // { x, y, tx, ty }
  let moved = false;
  let lastTap = 0;
  let tapTimer = null;
  const box = () => {
    const v = viewer.getBoundingClientRect();
    const c = containedSize(img.offsetWidth, img.offsetHeight, img.naturalWidth, img.naturalHeight);
    return { iw: c.w, ih: c.h, vw: v.width, vh: v.height };
  };
  const centre = () => { const v = viewer.getBoundingClientRect(); return { x: v.left + v.width / 2, y: v.top + v.height / 2 }; };
  const apply = () => { img.style.transform = transformCss(zs); viewer.classList.toggle('uvecana', zs.scale > 1); };
  const zoomTo = (scale, x, y) => { const c = centre(); zs = zoomAt(zs, scale, x - c.x, y - c.y, box()); apply(); };

  $('btn-slika-velika-zatvori').addEventListener('click', closeImageViewer);
  $('btn-slika-pun').addEventListener('click', toggleFull);
  // jedan dodir = cijeli ekran, dupli dodir = zum; uvećanu sliku dodir ne prebacuje
  img.addEventListener('click', (e) => {
    if (swiped || moved) { swiped = false; moved = false; return; }
    const now = Date.now();
    if (now - lastTap < 320) {
      clearTimeout(tapTimer);
      lastTap = 0;
      const c = centre();
      zs = doubleTap(zs, e.clientX - c.x, e.clientY - c.y, box());
      apply();
      return;
    }
    lastTap = now;
    if (zs.scale > 1.01) return;
    tapTimer = setTimeout(() => { if (!viewer.hidden && zs.scale <= 1.01) toggleFull(); }, 330);
  });
  $('btn-slika-prethodna').addEventListener('click', () => stepGallery(-1));
  $('btn-slika-sljedeca').addEventListener('click', () => stepGallery(1));

  viewer.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    if (!pts.size) { multiTouched = false; moved = false; }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { dist: distance(a, b) || 1, scale: zs.scale };
      multiTouched = true;
      drag = null;
    } else if (pts.size === 1) {
      startX = gallery ? e.clientX : null;
      swiped = false;
      drag = { x: e.clientX, y: e.clientY, tx: zs.tx, ty: zs.ty };
    }
  });
  viewer.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const m = midpoint(a, b);
      moved = true;
      zoomTo(pinch.scale * (distance(a, b) / pinch.dist), m.x, m.y);
    } else if (pts.size === 1 && drag && zs.scale > 1.01) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      const p = clampPan(zs.scale, drag.tx + dx, drag.ty + dy, box());
      zs = { ...zs, ...p };
      apply();
    }
  });
  const endPointer = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { const [r] = [...pts.values()]; drag = { x: r.x, y: r.y, tx: zs.tx, ty: zs.ty }; } else drag = null;
    if (zs.scale < 1.02 && !pts.size) { zs = { scale: 1, tx: 0, ty: 0 }; apply(); }
  };
  viewer.addEventListener('pointercancel', endPointer);
  viewer.addEventListener('pointerup', (e) => {
    const start = startX;
    endPointer(e);
    if (start == null || multiTouched || zs.scale > 1.01) return;
    const dx = e.clientX - start;
    startX = null;
    if (Math.abs(dx) > 50) { swiped = true; stepGallery(dx < 0 ? 1 : -1); }
  });
  // točkić miša (računar): zum na mjestu pokazivača
  viewer.addEventListener('wheel', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    zoomTo(zs.scale * (e.deltaY < 0 ? 1.25 : 0.8), e.clientX, e.clientY);
  }, { passive: false });
  viewer.addEventListener('click', (e) => { if (e.target === viewer && !swiped) closeImageViewer(); if (e.target === viewer) swiped = false; });
  // Registruje se zadnji, pa Nazad prvo zatvara sliku.
  registerBackHandler(() => closeImageViewer());
}
