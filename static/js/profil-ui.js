// Postavke → Profil lovca (avatar, pas, oprema, telefon) i Statistika. Čuva se lokalno, a šalje na server kad ima veze
// (avatar i pas vide svi odobreni, oprema samo vlasnik). Statistika se računa iz podataka na telefonu.

import { getClient, cachedProfile } from './auth.js';
import { idbAll, idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { loadJSON, saveSoft } from './storage.js';
import { listRecords } from './zapisi.js';
import { makeThumbnail } from './foto.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { formatDecimalBs } from './odstrel.js';
import { OPREMA_VRSTE, normalizeProfile, normalizeOprema, validatePasIme, validateDozvola } from './profil-lovca.js';
import { hunterStats, statYears } from './statistika.js';
import { toast, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const KEY = 'lovac.profil.lovac';
const TAB_KEY = 'lovac.postavke.tab';
const AVATARI = 'avatari';

// Avatari svih članova (mali, iz servera) za liste članova; učitava se iz keša, osvježava periodično.
let avatars = {};
export const LOGO_AVATAR = 'static/img/logo-192.png';
export const avatarOf = (id) => avatars[id]?.avatar || null;
export const dogNameOf = (id) => avatars[id]?.pas_ime || '';

async function loadAvatarCache() {
  const c = await idbGet('arhiva', AVATARI).catch(() => null);
  avatars = c?.map || {};
}

const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

async function pullAvatars() {
  if (!online()) return;
  const { data, error } = await getClient().from('profili').select('korisnik_id,avatar,pas_ime,updated_at');
  if (error) return;
  avatars = Object.fromEntries(data.map((r) => [r.korisnik_id, { avatar: r.avatar, pas_ime: r.pas_ime }]));
  await idbPut('arhiva', { id: AVATARI, map: avatars, preuzeto: Date.now() });
  document.dispatchEvent(new CustomEvent('avatari:promjena'));
}

export function initProfilLovca() {
  let profile = normalizeProfile(loadJSON(KEY, null));
  const me = () => cachedProfile();

  const persist = () => saveSoft(KEY, profile);

  const imgStyle = (el, data, fallback) => {
    el.style.backgroundImage = data ? `url("${data}")` : '';
    el.textContent = data ? '' : fallback;
    el.classList.toggle('ima-sliku', Boolean(data));
  };

  const render = () => {
    const initials = `${(me()?.ime || '?')[0]}${(me()?.prezime || '')[0] || ''}`.toUpperCase();
    // Dok lovac ne izabere svoju sliku, avatar je logo društva (ne inicijali).
    for (const id of ['pf-avatar', 'p-avatar']) {
      imgStyle($(id), profile.avatar || LOGO_AVATAR, initials);
      $(id).classList.toggle('logo-avatar', !profile.avatar);
    }
    imgStyle($('pf-pas-slika'), profile.pas_slika, 'P');
    if (document.activeElement !== $('pf-pas-ime')) $('pf-pas-ime').value = profile.pas_ime;
    if (document.activeElement !== $('pf-dozvola')) $('pf-dozvola').value = profile.dozvola;
    $('pf-oprema').innerHTML = profile.oprema.map((x, i) => `<li class="clan-red" data-i="${i}"><span class="clan-tekst"><b>${escapeHtml(x.opis)}</b>
      <span class="sitno">${escapeHtml(OPREMA_VRSTE[x.vrsta])}</span></span><button type="button" class="dugme" data-akcija="ukloni">Ukloni</button></li>`).join('')
      || '<li class="sitno">Još nema unesene opreme.</li>';
    $('pf-status').textContent = profile.neposlano ? 'Sačuvano na telefonu — šalje se kad bude interneta.' : '';
  };

  // ---------- server ----------
  // Slanje je serijsko; ako se profil promijenio dok je slanje trajalo, ide još jedan krug (inače bi izmjena ostala označena kao poslana).
  let rev = 0;
  let pushing = false;
  const push = async () => {
    if (pushing || !profile.neposlano || !online() || !me()) return;
    pushing = true;
    try {
      while (profile.neposlano && online()) {
        const sent = rev;
        const snap = profile;
        const sb = getClient();
        const a = await sb.from('profili').upsert({ korisnik_id: me().id, avatar: snap.avatar, pas_ime: snap.pas_ime || null, pas_slika: snap.pas_slika }, { onConflict: 'korisnik_id' });
        if (a.error) throw new Error(a.error.message);
        let b = await sb.from('profili_oprema').upsert({ korisnik_id: me().id, oprema: snap.oprema, dozvola: snap.dozvola || null }, { onConflict: 'korisnik_id' });
        // server bez migracije 044 (nema kolone): oprema se šalje bez dozvole, dozvola ostaje na telefonu
        if (b.error && ['42703', 'PGRST204'].includes(b.error.code)) b = await sb.from('profili_oprema').upsert({ korisnik_id: me().id, oprema: snap.oprema }, { onConflict: 'korisnik_id' });
        if (b.error) throw new Error(b.error.message);
        if (sent === rev) { profile = { ...profile, neposlano: false }; persist(); render(); pullAvatars(); }
      }
    } catch (err) {
      console.warn('profil čeka slanje', err.message);
    } finally {
      pushing = false;
    }
  };

  // Novi telefon: ako lokalno nema ničega, uzmi svoj profil sa servera.
  const hydrate = async () => {
    if (!online() || !me() || profile.avatar || profile.pas_ime || profile.pas_slika || profile.dozvola || profile.oprema.length || profile.neposlano) return;
    const sb = getClient();
    const [p, o] = await Promise.all([sb.from('profili').select('*').eq('korisnik_id', me().id).maybeSingle(), sb.from('profili_oprema').select('*').eq('korisnik_id', me().id).maybeSingle()]);
    if (p.data || o.data) {
      profile = normalizeProfile({ avatar: p.data?.avatar, pas_ime: p.data?.pas_ime, pas_slika: p.data?.pas_slika, oprema: o.data?.oprema, dozvola: o.data?.dozvola });
      persist();
      render();
    }
  };

  const change = (patch) => { rev += 1; profile = { ...profile, ...patch, neposlano: true }; persist(); render(); };

  // ---------- slike ----------
  const pickImage = (inputId, key, size) => $(inputId).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      change({ [key]: await makeThumbnail(file, size) });
      push();
    } catch (err) {
      toast(err.message);
    }
  });
  pickImage('pf-avatar-ulaz', 'avatar', 96);
  pickImage('pf-pas-ulaz', 'pas_slika', 192);
  $('btn-pf-avatar-ukloni').addEventListener('click', () => { change({ avatar: null }); push(); });
  $('btn-pf-pas-ukloni').addEventListener('click', () => { change({ pas_slika: null }); push(); });

  // ---------- oprema ----------
  $('pf-oprema-vrsta').innerHTML = Object.entries(OPREMA_VRSTE).map(([k, v]) => `<option value="${k}">${escapeHtml(v)}</option>`).join('');
  $('btn-pf-oprema-dodaj').addEventListener('click', () => {
    const opis = $('pf-oprema-opis').value.trim();
    if (!opis) { toast('Upiši šta je oprema'); return; }
    change({ oprema: normalizeOprema([...profile.oprema, { vrsta: $('pf-oprema-vrsta').value, opis }]) });
    $('pf-oprema-opis').value = '';
    push();
  });
  $('pf-oprema').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="ukloni"]');
    if (!b) return;
    const i = Number(b.closest('[data-i]').dataset.i);
    change({ oprema: profile.oprema.filter((_, j) => j !== i) });
    push();
  });

  // Ime psa se pamti čim se kuca (bez crtanja), da ga dodavanje opreme ili slike ne pregazi.
  $('pf-pas-ime').addEventListener('input', (e) => {
    rev += 1;
    profile = { ...profile, pas_ime: e.target.value.slice(0, 40), neposlano: true };
    persist();
  });

  $('pf-dozvola').addEventListener('input', (e) => {
    rev += 1;
    profile = { ...profile, dozvola: e.target.value.slice(0, 40), neposlano: true };
    persist();
  });

  $('btn-pf-sacuvaj').addEventListener('click', async () => {
    const err = validatePasIme($('pf-pas-ime').value) || validateDozvola($('pf-dozvola').value);
    if (err) { $('pf-status').textContent = err; return; }
    change({ pas_ime: $('pf-pas-ime').value.trim(), dozvola: $('pf-dozvola').value.trim() });
    await push();
    toast(profile.neposlano ? 'Profil sačuvan na telefonu' : 'Profil sačuvan');
  });

  // ---------- statistika ----------
  let statYear = null;
  const renderStats = async () => {
    const data = {
      lovovi: await idbAll('lovovi').catch(() => []), myId: me()?.id,
      odstrel: await listRecords('odstrel'), tragovi: await listRecords('tragovi'), opazanja: await listRecords('opazanja'), objekti: await listRecords('objekti'),
    };
    const years = statYears(data);
    if (statYear != null && !years.includes(statYear)) statYear = null;
    $('pf-stat-godina').innerHTML = `<option value="">Sve godine</option>${years.map((y) => `<option value="${y}"${y === statYear ? ' selected' : ''}>${y}</option>`).join('')}`;
    const s = hunterStats({ ...data, godina: statYear });
    const vrste = await getSpisakAll('vrste');
    const kg = (n) => `${formatDecimalBs(Math.round(n * 10) / 10)} kg`;
    const tiles = [
      [s.lovova, 'lovova'], [`${formatDecimalBs(Math.round(s.sati * 10) / 10)} h`, 'u lovu'], [s.ulov, 'ulova'], [kg(s.tezina), 'ukupna težina'],
      [s.najveci ? `${kg(s.najveci.tezina)}` : '—', s.najveci ? `najveći (${lookupNaziv(vrste, s.najveci.vrsta)})` : 'najveći komad'],
      [`${formatDecimalBs(Math.round(s.km * 10) / 10)} km`, `${s.tragova} tragova`], [s.opazanja, `opažanja (${s.grla} grla)`], [s.potraga, 'potraga'], [s.objekata, 'mojih objekata'],
    ];
    $('pf-stat-tiles').innerHTML = tiles.map(([v, l]) => `<div class="pf-tile"><b>${escapeHtml(String(v))}</b><span>${escapeHtml(l)}</span></div>`).join('');
    $('pf-stat-vrste').innerHTML = s.poVrstama.map((x) => `<li>${escapeHtml(lookupNaziv(vrste, x.vrsta))}: <b>${x.komada}</b></li>`).join('') || '<li class="sitno">Nema upisanog ulova.</li>';
  };
  $('pf-stat-godina').addEventListener('change', (e) => { statYear = e.target.value ? Number(e.target.value) : null; renderStats(); });

  // ---------- tabovi ----------
  const setTab = (tab) => {
    if (!['opste', 'podaci', 'nalog', 'profil'].includes(tab)) tab = 'opste';
    for (const t of ['opste', 'podaci', 'nalog', 'profil']) $(`p-${t}`).hidden = tab !== t;
    if (tab === 'podaci') document.dispatchEvent(new CustomEvent('postavke:podaci'));
    $('p-tabovi').querySelectorAll('[data-ptab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ptab === tab)));
    saveSoft(TAB_KEY, tab);
    if (tab === 'profil') { render(); hydrate().catch(() => {}); if (!$('pf-statistika').hidden) renderStats(); }
  };
  const setSub = (sub) => {
    $('pf-profil').hidden = sub !== 'profil';
    $('pf-statistika').hidden = sub !== 'statistika';
    $('pf-podtabovi').querySelectorAll('[data-pftab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pftab === sub)));
    if (sub === 'statistika') renderStats();
  };
  $('p-tabovi').addEventListener('click', (e) => { const b = e.target.closest('[data-ptab]'); if (b) setTab(b.dataset.ptab); });
  $('pf-podtabovi').addEventListener('click', (e) => { const b = e.target.closest('[data-pftab]'); if (b) setSub(b.dataset.pftab); });
  $('btn-postavke').addEventListener('click', () => { setTab('opste'); render(); });

  render();
  loadAvatarCache();
  setInterval(() => { push(); pullAvatars(); }, 300000);
  setTimeout(() => { push(); pullAvatars(); }, 6000);
}
