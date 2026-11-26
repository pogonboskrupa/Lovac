// Dijeljenje/izvoz fajla. WebView nema pouzdan navigator.share, pa APK ide kroz AndroidShare most.

export function shareFile(name, mime, content) {
  const bridge = globalThis.AndroidShare;
  if (bridge?.shareFile) {
    bridge.shareFile(name, mime, content);
    return 'android';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'download';
}

// Čuvanje fajla NA TELEFON (Preuzimanja/Lovac). Stara aplikacija bez `sacuvaj` dijeli fajl (lovac bira gdje),
// a preglednik ga preuzima. Vraća 'preuzimanja' | 'dijeljenje' | 'download'.
export function saveFile(name, mime, content) {
  const bridge = globalThis.AndroidShare;
  if (bridge?.sacuvaj) return bridge.sacuvaj(name, mime, content) === 'preuzimanja' ? 'preuzimanja' : 'dijeljenje';
  const r = shareFile(name, mime, content);
  return r === 'android' ? 'dijeljenje' : 'download';
}

export function shareText(text) {
  const bridge = globalThis.AndroidShare;
  if (bridge?.shareText) {
    bridge.shareText(text);
    return 'android';
  }
  if (navigator.share) {
    navigator.share({ text }).catch(() => {});
    return 'web';
  }
  return 'nema';
}

// Čuvanje SLIKE (dataURL) na telefon: Preuzimanja/Lovac (Android 10+, native), u pregledniku običan download.
// Vraća 'preuzimanja' | 'download' | 'greska' (stariji Android / stara aplikacija: pozivalac nudi dijeljenje).
export function saveImage(name, dataUrl) {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return 'greska';
  const bridge = globalThis.AndroidShare;
  if (bridge) return bridge.sacuvajSliku ? (bridge.sacuvajSliku(name, m[1], m[2]) === 'preuzimanja' ? 'preuzimanja' : 'greska') : 'greska';
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return 'download';
}
