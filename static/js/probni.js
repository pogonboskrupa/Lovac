// Probni period samoregistrovanog lovca (rok postavlja server: korisnici.probni_do, migracija 026).
// Dok traje, aplikacija radi; stalni pristup daje administrator ili grupovođa (primanjem u sekciju).

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

export function trialBannerText(profile, now = Date.now()) {
  const n = trialDaysLeft(profile, now);
  return `Probni pristup: još ${n} ${daysWord(n)}. Za stalni pristup zatraži sekciju — odobrava grupovođa ili administrator.`;
}

// Ekran čekanja: istekao probni period ili nalog bez probnog perioda.
export function waitingText(profile) {
  return trialEndsAt(profile)
    ? 'Probni period od 7 dana je istekao. Grupovođa te treba primiti u sekciju ili administrator odobriti nalog.'
    : 'Vaš nalog je primljen. Administrator društva ili grupovođa ga treba odobriti prije korištenja.';
}
