// Rezervna kopija mojih zapisa (objekti, opažanja, odstrel, tragovi) u jedan JSON fajl i uvoz nazad.
// Uvoz samo DODAJE zapise kojih nema na telefonu (nikad ne prepisuje postojeće). Fotografije nisu u kopiji.

export const BACKUP_FORMAT = 'lovac-rezerva';
export const BACKUP_VERSION = 1;
export const BACKUP_STORES = ['objekti', 'opazanja', 'odstrel', 'tragovi'];

export function buildBackup(data, profile, appVer, now = new Date()) {
  const podaci = {};
  for (const store of BACKUP_STORES) {
    podaci[store] = (data[store] || []).filter((r) => !r.obrisan && !r.tudji).map(({ fotografije, ...rest }) => rest);
  }
  return JSON.stringify({
    format: BACKUP_FORMAT, verzija: BACKUP_VERSION, aplikacija: appVer, kreirano: now.toISOString(),
    korisnik: profile ? { id: profile.id, ime: `${profile.ime} ${profile.prezime}` } : null, podaci,
  });
}

export function parseBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch { return { ok: false, greska: 'Fajl nije ispravan (nije JSON).' }; }
  if (d?.format !== BACKUP_FORMAT) return { ok: false, greska: 'Ovo nije rezervna kopija ove aplikacije.' };
  if (d.verzija > BACKUP_VERSION) return { ok: false, greska: 'Kopija je iz novije verzije aplikacije — ažuriraj aplikaciju.' };
  if (!d.podaci || typeof d.podaci !== 'object') return { ok: false, greska: 'Kopija nema podataka.' };
  return { ok: true, podaci: d.podaci, kreirano: d.kreirano, korisnik: d.korisnik };
}

const valid = (r) => r && typeof r.id === 'string' && r.id.length >= 8;

// existingIds: { store: Set }. Vraća zapise za dodavanje (sinhronizovano:false, da ih red pošalje) i broj preskočenih.
export function recordsToImport(podaci, existingIds) {
  const dodaj = [];
  let preskoceno = 0;
  for (const store of BACKUP_STORES) {
    for (const r of podaci[store] || []) {
      if (!valid(r) || r.obrisan || existingIds[store]?.has(r.id)) { preskoceno += 1; continue; }
      dodaj.push({ store, rec: { ...r, tudji: undefined, sinhronizovano: false } });
    }
  }
  return { dodaj, preskoceno };
}

export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `lovac-rezerva-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}
