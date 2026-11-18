// Podešavanje servera. Anon key je javan po dizajnu (pristup čuva RLS na serveru).
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Lovac se prijavljuje imenom, prezimenom i PIN-om; email je interni i lovac ga ne vidi.
export const EMAIL_DOMAIN = 'lovci.grmec.app';

// CI pri buildu upisuje stvarno ime repozitorija (repo će se seliti na drugi nalog).
export const GITHUB_REPO = 'pogonboskrupa/lovac';
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/app-debug.apk`;

export function isServerConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
