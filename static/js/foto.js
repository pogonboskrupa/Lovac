// Fotografije: smanjuju se prije čuvanja (telefon pravi 4-12 MB slike), čuvaju u IndexedDB.

import { idbPut, idbGet, idbDelete } from './db.js';
import { uuid } from './zapisi.js';

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export function fitSize(w, h, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Slika se ne može otvoriti')); };
    img.src = url;
  });
}

export async function resizeImage(file) {
  const img = await loadImage(file);
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Slika nije pretvorena'))), 'image/jpeg', QUALITY);
  });
}

export async function savePhoto(file) {
  const blob = await resizeImage(file);
  const id = uuid();
  await idbPut('fotografije', { id, blob, mime: 'image/jpeg', created_at: Date.now() });
  return id;
}

export async function photoUrl(id) {
  const rec = await idbGet('fotografije', id);
  return rec ? URL.createObjectURL(rec.blob) : null;
}

export const deletePhoto = (id) => idbDelete('fotografije', id);

// Traka sličica za formu/detalje; object URL-ovi se oslobađaju pri ponovnom crtanju i zatvaranju.
export function createPhotoStrip() {
  const urls = [];
  const release = () => { while (urls.length) URL.revokeObjectURL(urls.pop()); };
  return {
    async render(container, ids, removable) {
      release();
      const parts = [];
      for (const id of ids) {
        const url = await photoUrl(id);
        if (!url) continue;
        urls.push(url);
        const safeId = String(id).replace(/[^0-9a-f-]/gi, '');
        parts.push(`<figure class="foto" data-foto="${safeId}"><img src="${url}" alt="Fotografija">`
          + `${removable ? '<button type="button" class="foto-ukloni" aria-label="Ukloni fotografiju">×</button>' : ''}</figure>`);
      }
      container.innerHTML = parts.join('');
    },
    release,
  };
}
