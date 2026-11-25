// Stanje preuzimanja nove verzije: native most (UpdateBridge) zove globalne funkcije `__update*`, a ovdje se one pretvaraju u
// događaj `azur:stanje`, pa i traka "Nova verzija" na mapi i ekran Postavke prikazuju isti napredak (prije je napredak
// stizao samo u Postavke, pa dodir na traku nije pokazivao da se išta događa).
export const AZUR_EVENT = 'azur:stanje';

export function initUpdateBridge(target = globalThis) {
  const emit = (detail) => target.document?.dispatchEvent(new CustomEvent(AZUR_EVENT, { detail }));
  target.__updateStatus = (text) => emit({ vrsta: 'status', text: String(text ?? '') });
  target.__updateNapredak = (pct) => emit({ vrsta: 'napredak', pct: Math.max(0, Math.min(100, Number(pct) || 0)) });
  target.__updatePreuzeto = () => emit({ vrsta: 'preuzeto' });
  target.__updateGreska = (msg) => emit({ vrsta: 'greska', text: String(msg ?? 'Preuzimanje nije uspjelo') });
}

// Šta traka pokazuje poslije događaja. dugme: 'azuriraj' (kreće preuzimanje) | 'instaliraj' (preuzeto, potvrdi) | 'ponovo' | 'zauzeto'.
export function barView(ev, ver = '') {
  switch (ev?.vrsta) {
    case 'napredak': return { tekst: `Preuzimam ${ver} … ${Math.round(ev.pct)} %`, napredak: ev.pct, dugme: 'zauzeto' };
    case 'status': return { tekst: ev.text || `Preuzimam ${ver}…`, napredak: null, dugme: 'zauzeto' };
    case 'preuzeto': return { tekst: `${ver} je preuzeta. Potvrdi instalaciju (podaci ostaju).`, napredak: null, dugme: 'instaliraj' };
    case 'greska': return { tekst: ev.text || 'Preuzimanje nije uspjelo', napredak: null, dugme: 'ponovo' };
    default: return { tekst: `Nova verzija ${ver}`, napredak: null, dugme: 'azuriraj' };
  }
}

// Tekst dok preuzimanje tek kreće (prije prvog napretka), prema načinu koji je installUpdate() izabrao.
export function startView(mode, ver = '') {
  if (mode === 'preuzimanje') return { tekst: `Preuzimam ${ver} … 0 %`, napredak: 0, dugme: 'zauzeto' };
  if (mode === 'apk') return { tekst: 'Preuzimanje je pokrenuto (obavijest na telefonu). Kad završi, otvara se instalacija.', napredak: null, dugme: 'ponovo' };
  return { tekst: 'APK je preuzet na uređaj. Otvori ga iz preuzimanja da instaliraš aplikaciju.', napredak: null, dugme: 'ponovo' };
}
