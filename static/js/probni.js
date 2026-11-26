// Probni period samoregistrovanog lovca (rok postavlja server: korisnici.probni_do, migracija 026).
// Dok traje, aplikacija radi; stalni pristup daje administrator, lovočuvar revira ili lovovođa sekcije (primanjem u sekciju).

export function trialEndsAt(profile) {
  const t = Date.parse(profile?.probni_do || '');
  return Number.isFinite(t) ? t : null;
}

export function inTrial(profile, now = Date.now()) {
  const end = trialEndsAt(profile);
  return Boolean(profile && !profile.odobren && end && end > now);
}

export function hasAppAccess(profile, now = Date.now()) {
  return Boolean(profile?.odobren) || inTrial(profile, now);
}

export function trialDaysLeft(profile, now = Date.now()) {
  const end = trialEndsAt(profile);
  return end ? Math.max(0, Math.ceil((end - now) / 86400000)) : 0;
}

function daysWord(n) {
  return n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana';
}

// Probni period traje 24 h, pa se pred kraj prikazuje u satima (od 48 h naviše u danima, za starije naloge).
export function trialLeftText(profile, now = Date.now()) {
  const end = trialEndsAt(profile);
  const hours = end ? Math.max(1, Math.ceil((end - now) / 3600000)) : 0;
  if (hours > 48) {
    const n = trialDaysLeft(profile, now);
    return `${n} ${daysWord(n)}`;
  }
  return `${hours} h`;
}

export function trialBannerText(profile, now = Date.now()) {
  return `Probni pristup: još ${trialLeftText(profile, now)}. Za stalni pristup zatraži sekciju — odobrava lovovođa sekcije, lovočuvar ili administrator.`;
}

// Ekran čekanja: istekao probni period ili nalog bez probnog perioda.
export function waitingText(profile) {
  return trialEndsAt(profile)
    ? 'Probni period od 24 sata je istekao. Lovovođa sekcije ili lovočuvar te treba primiti u sekciju, ili administrator odobriti nalog.'
    : 'Vaš nalog je primljen. Administrator društva ili lovovođa sekcije ga treba odobriti prije korištenja.';
}
