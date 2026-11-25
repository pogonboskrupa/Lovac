// Podešavanje servera. Anon key je javan po dizajnu (pristup čuva RLS na serveru).
export const SUPABASE_URL = 'https://aeioslmkfymhktikzuny.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_nXQ_q9kHsQQ5fzytjVkCPg_f9GrrGm9';

// Lovac se prijavljuje imenom, prezimenom i PIN-om; email je interni i lovac ga ne vidi.
export const EMAIL_DOMAIN = 'lovci.grmec.app';

// CI pri buildu upisuje stvarno ime repozitorija (repo će se seliti na drugi nalog).
export const GITHUB_REPO = 'pogonboskrupa/lovac';
export const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
// version.json objavljuje CI na granu "verzija" nakon uspješnog Release-a. raw.githubusercontent
// nema limit od 60 zahtjeva/sat po IP adresi kao GitHub API (mobilni operateri dijele IP).
export const VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/verzija/version.json`;
// Minirana područja (BHMAC) se NE pakuju u APK: skidaju se u aplikaciji sa grane "podaci" (raw.githubusercontent šalje
// CORS zaglavlja, za razliku od Release linkova), pa radi i bez novog APK-a kad BHMAC objavi nove podatke.
export const MINIRANO_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/podaci/minirano.kml`;
export const APK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/app-debug.apk`;

export function isServerConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
