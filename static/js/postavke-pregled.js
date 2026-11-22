// Spremnost za rad bez interneta (čista logika): pohrana telefona, zadnje slanje, rezervna kopija.

const KB = 1024;

export function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  const f = (v) => v.toFixed(v < 10 ? 1 : 0).replace('.', ',');
  if (n < KB) return `${Math.round(n)} B`;
  if (n < KB ** 2) return `${f(n / KB)} KB`;
  if (n < KB ** 3) return `${f(n / KB ** 2)} MB`;
  return `${f(n / KB ** 3)} GB`;
}

// est = navigator.storage.estimate() ({usage, quota}); persisted = navigator.storage.persisted().
export function storageSummary(est, persisted = null) {
  if (!est || !Number.isFinite(est.usage) || !Number.isFinite(est.quota) || est.quota <= 0) {
    return { tekst: 'Pohrana: nije dostupno na ovom uređaju', postotak: null, upozorenje: false, zasticena: persisted };
  }
  const postotak = Math.min(100, Math.round((est.usage / est.quota) * 1000) / 10);
  return {
    tekst: `Zauzeto ${formatBytes(est.usage)} od ${formatBytes(est.quota)} (${String(postotak).replace('.', ',')} %)`,
    postotak,
    upozorenje: postotak >= 80,
    zasticena: persisted,
  };
}

export function syncAgeText(ts, now = Date.now()) {
  if (!Number.isFinite(ts)) return 'još nikad';
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return 'upravo';
  if (min < 60) return `prije ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `prije ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'prije 1 dan' : `prije ${d} dana`;
}

export function syncText(count, lastTs, now = Date.now()) {
  const stanje = count > 0 ? `čeka slanje: ${count}` : 'sve je poslano';
  return `${stanje} · zadnje slanje ${syncAgeText(lastTs, now)}`;
}

export const BACKUP_STALE_DAYS = 30;

// Savjet o rezervnoj kopiji: bez podataka nema šta čuvati; nikad ili 30+ dana = podsjetnik.
export function backupAdvice(lastTs, hasData, now = Date.now()) {
  if (!hasData) return { stanje: 'ok', tekst: 'Nema podataka za kopiranje' };
  if (!Number.isFinite(lastTs)) return { stanje: 'nema', tekst: 'Rezervna kopija još nije pravljena' };
  const days = Math.floor((now - lastTs) / 86400000);
  return days >= BACKUP_STALE_DAYS
    ? { stanje: 'stara', tekst: `Zadnja rezervna kopija ${syncAgeText(lastTs, now)} — napravi novu` }
    : { stanje: 'ok', tekst: `Zadnja rezervna kopija ${syncAgeText(lastTs, now)}` };
}
