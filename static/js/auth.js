// Prijava imenom, prezimenom i PIN-om preko Supabase Auth.
// Odluka o ekranu nikad ne čeka mrežu: keširan profil ulazi odmah.

import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN, isServerConfigured } from './config.js';
import { fetchWithTimeout } from './net.js';
import { saveCritical, loadJSON, removeKey } from './storage.js';

export const PROFILE_KEY = 'lovac.profil';
const PIN_RE = /^\d{6,8}$/;

const TRANSLIT = { č: 'c', ć: 'c', š: 's', ž: 'z', đ: 'dj' };

export function normalizeNamePart(s) {
  return String(s ?? '').trim().toLowerCase()
    .replace(/[čćšžđ]/g, (ch) => TRANSLIT[ch])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Nadimak / broj člana je dio internog emaila, pa razlikuje lovce istog imena.
export function syntheticEmail(ime, prezime, nadimak = '') {
  const a = normalizeNamePart(ime);
  const b = normalizeNamePart(prezime);
  if (!a || !b) throw new Error('Ime i prezime su obavezni');
  const n = normalizeNamePart(nadimak);
  return `${a}.${b}${n ? `.${n}` : ''}@${EMAIL_DOMAIN}`;
}

export function validatePin(pin) {
  return PIN_RE.test(String(pin ?? '')) ? null : 'PIN mora imati 6 do 8 cifara';
}

export function validateNadimak(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  if (t.length > 20) return 'Nadimak / broj člana je predug';
  if (!normalizeNamePart(t)) return 'Nadimak / broj člana ima neispravne znakove';
  return null;
}

export function validateName(s) {
  const t = String(s ?? '').trim();
  if (t.length < 2) return 'Prekratko';
  if (t.length > 40) return 'Predugo';
  if (!normalizeNamePart(t)) return 'Neispravni znakovi';
  return null;
}

// Čista odluka o početnom ekranu iz lokalnog stanja.
export function decideStartScreen(profile, serverConfigured) {
  if (!serverConfigured) return 'mapa';
  if (!profile) return 'prijava';
  return profile.odobren ? 'mapa' : 'cekanje';
}

// Auth greška (odbijena sesija) vodi na prijavu; mrežna greška nikad.
const REJECTION_CODES = new Set([
  'PGRST301', 'refresh_token_not_found', 'refresh_token_already_used', 'session_not_found',
  'session_expired', 'user_not_found', 'user_banned', 'bad_jwt',
]);

export function isAuthRejection(err) {
  if (!err) return false;
  const status = Number(err.status ?? err.statusCode);
  if (status === 401 || status === 403) return true;
  return REJECTION_CODES.has(err.code) || err.name === 'AuthSessionMissingError';
}

let client = null;

export function getClient() {
  if (!isServerConfigured()) return null;
  if (client) return client;
  const lib = globalThis.supabase;
  if (!lib?.createClient) throw new Error('Biblioteka za server nije učitana');
  client = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: (url, opts) => fetchWithTimeout(url, opts) },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export function cachedProfile() {
  return loadJSON(PROFILE_KEY, null);
}

function friendlyAuthError(err) {
  const msg = String(err?.message || err);
  if (/already registered|already exists/i.test(msg)) return 'Korisnik s tim imenom i prezimenom već postoji. Upišite nadimak ili broj člana.';
  if (/invalid login credentials/i.test(msg)) return 'Pogrešno ime, prezime ili PIN.';
  if (/rate limit|too many/i.test(msg)) return 'Previše pokušaja. Pokušajte ponovo za nekoliko minuta.';
  if (err?.name === 'TimeoutError' || /fetch|network/i.test(msg)) return 'Nema veze sa serverom. Pokušajte kad bude signala.';
  return msg;
}

async function fetchProfile(sb, userId) {
  const { data, error } = await sb.from('korisnici').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

function storeProfile(p) {
  saveCritical(PROFILE_KEY, p);
  return p;
}

function validateCredentials({ ime, prezime, nadimak, pin }) {
  const err = validateName(ime) || validateName(prezime) || validateNadimak(nadimak) || validatePin(pin);
  if (err) throw new Error(err);
}

export async function register({ ime, prezime, nadimak, pin }) {
  validateCredentials({ ime, prezime, nadimak, pin });
  const sb = getClient();
  const nad = String(nadimak ?? '').trim();
  const { data, error } = await sb.auth.signUp({
    email: syntheticEmail(ime, prezime, nad),
    password: String(pin),
    options: { data: { ime: ime.trim(), prezime: prezime.trim(), nadimak: nad } },
  });
  if (error) throw new Error(friendlyAuthError(error));
  const user = data.user;
  const profile = (data.session && await fetchProfile(sb, user.id).catch(() => null))
    || { id: user.id, ime: ime.trim(), prezime: prezime.trim(), nadimak: nad || null, odobren: false, is_admin: false };
  return storeProfile(profile);
}

export async function login({ ime, prezime, nadimak, pin }) {
  validateCredentials({ ime, prezime, nadimak, pin });
  const sb = getClient();
  const { data, error } = await sb.auth.signInWithPassword({
    email: syntheticEmail(ime, prezime, nadimak),
    password: String(pin),
  });
  if (error) throw new Error(friendlyAuthError(error));
  const profile = await fetchProfile(sb, data.user.id);
  if (!profile) throw new Error('Profil nije pronađen na serveru.');
  return storeProfile(profile);
}

// Tiho osvježavanje u pozadini. Vraća novi profil, null ako je sesija odbijena,
// ili baca grešku za mrežni problem (pozivalac tada ostaje na keširanom stanju).
export async function refreshProfileInBackground() {
  const sb = getClient();
  if (!sb) return cachedProfile();
  // Pad osvježavanja tokena na mrtvoj vezi vraća session=null UZ mrežnu grešku —
  // to nije odjava.
  const { data, error } = await sb.auth.getSession();
  if (error) {
    if (isAuthRejection(error)) return null;
    throw error;
  }
  const session = data?.session;
  if (!session) return null;
  try {
    const profile = await fetchProfile(sb, session.user.id);
    if (!profile) return null;
    return storeProfile(profile);
  } catch (err) {
    if (isAuthRejection(err)) return null;
    throw err;
  }
}

const SIGNOUT_GRACE_MS = 3000;

// Lokalne sesije servera (sb-*) se brišu uvijek, i kad server ne odgovara.
// Inače bi se lovac po ponovnom pokretanju tiho vratio u app.
export function clearServerSession() {
  try {
    for (const k of Object.keys(globalThis.localStorage)) {
      if (k.startsWith('sb-')) globalThis.localStorage.removeItem(k);
    }
  } catch (err) {
    console.warn('clearServerSession', err);
  }
}

export async function logout() {
  removeKey(PROFILE_KEY);
  const sb = getClient();
  try {
    // Server se pita najviše nekoliko sekundi: na mrtvoj vezi poziv visi, ne pada.
    if (sb) await Promise.race([sb.auth.signOut({ scope: 'local' }), new Promise((r) => { setTimeout(r, SIGNOUT_GRACE_MS); })]);
  } catch (err) {
    console.warn('signOut', err);
  }
  clearServerSession();
}
