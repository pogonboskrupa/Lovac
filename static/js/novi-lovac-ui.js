// Ekran "Novi lovac": admin, lovočuvar i lovovođa sekcije prave nalog i odmah dodaju lovca u sekciju;
// običan član sekcije samo PREDLAŽE — nalog ne radi dok ga lovovođa sekcije (ili admin) ne odobri.

import { cachedProfile, provisionUser, getClient } from './auth.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { myStatus, creationMode } from './sekcije.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';
import { ULOGE_NOVOG, assignRole } from './uloge-dodjela.js';

const $ = (id) => document.getElementById(id);

export function initNoviLovac() {
  const screen = $('lovac-novi');
  const form = $('forma-lovac-novi');
  let allowed = []; // [{ sekcija, mode }]

  const me = () => cachedProfile();

  const open = async (sekcijaId, uloga) => {
    const ctx = await cachedSekcije();
    allowed = ctx.sekcije
      .filter((s) => s.aktivno !== false)
      .map((s) => ({ sekcija: s, mode: creationMode(myStatus(s, ctx.clanovi, me()?.id, Boolean(me()?.is_admin), ctx.lovocuvari)) }))
      .filter((x) => x.mode);
    if (!allowed.length) { toast('Nemaš pravo da praviš naloge'); return; }
    $('ln-sekcija').innerHTML = allowed.map((x) => `<option value="${escapeHtml(x.sekcija.id)}"${x.sekcija.id === sekcijaId ? ' selected' : ''}>${escapeHtml(x.sekcija.naziv)}</option>`).join('');
    // Administrator pri pravljenju naloga odmah bira i ulogu (Korisnici i odobrenja → Novi korisnik)
    const admin = Boolean(me()?.is_admin);
    $('ln-uloga-blok').hidden = !admin;
    $('ln-uloga').innerHTML = ULOGE_NOVOG.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.tekst)}</option>`).join('');
    if (uloga && [...$('ln-uloga').options].some((x) => x.value === uloga)) $('ln-uloga').value = uloga;
    $('ln-gotovo').hidden = true;
    form.hidden = false;
    $('ln-status').textContent = '';
    syncHint();
    screen.hidden = false;
  };

  const modeFor = (sekcijaId) => allowed.find((x) => x.sekcija.id === sekcijaId)?.mode;
  const syncHint = () => {
    $('ln-uputa').textContent = modeFor($('ln-sekcija').value) === 'direct'
      ? 'Nalog je odmah odobren i lovac je odmah član sekcije.'
      : 'Ti predlažeš lovca: nalog će raditi tek kad ga lovovođa sekcije odobri (najviše 5 predloga odjednom).';
    $('btn-ln-posalji').textContent = modeFor($('ln-sekcija').value) === 'direct' ? 'Napravi nalog' : 'Predloži lovca';
  };

  const close = () => { screen.hidden = true; form.reset(); };
  $('btn-ln-zatvori').addEventListener('click', close);
  $('ln-sekcija').addEventListener('change', syncHint);
  registerBackHandler(() => { if (screen.hidden) return false; close(); return true; });
  document.addEventListener('lovac:novi', (e) => open(e.detail?.sekcijaId, e.detail?.uloga));
  $('btn-ln-jos').addEventListener('click', () => { $('ln-gotovo').hidden = true; form.hidden = false; form.reset(); syncHint(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const sekcijaId = fd.get('sekcija');
    const status = $('ln-status');
    const btn = $('btn-ln-posalji');
    status.textContent = 'Šaljem…';
    btn.disabled = true;
    try {
      const r = await provisionUser({ ime: fd.get('ime'), prezime: fd.get('prezime'), nadimak: fd.get('nadimak'), pin: fd.get('pin'), sekcijaId });
      const ime = `${String(fd.get('ime')).trim()} ${String(fd.get('prezime')).trim()}`;
      const direct = r.odobren;
      status.textContent = '';
      let ulogaGreska = '';
      const uloga = $('ln-uloga-blok').hidden ? 'clan' : fd.get('uloga');
      if (direct && uloga !== 'clan') {
        try {
          await assignRole(getClient(), uloga, { userId: r.id, sekcija: allowed.find((x) => x.sekcija.id === sekcijaId).sekcija });
        } catch (err) { ulogaGreska = ` Uloga nije postavljena (${err.message}) — postavi je u Korisnici → Upravljanje → Uloge.`; }
      }
      $('ln-gotovo-tekst').textContent = direct
        ? `${ime} je dodan u sekciju i može se prijaviti imenom, prezimenom i PIN-om.${ulogaGreska}`
        : `${ime} je predložen. Može se prijaviti tek kad lovovođa sekcije odobri.`;
      form.hidden = true;
      $('ln-gotovo').hidden = false;
      downloadSekcije().then(() => $('btn-korisnici-osvjezi')?.click()).catch(() => {});
    } catch (err) {
      status.textContent = /fetch|network|timeout/i.test(err.message) || err.name === 'TimeoutError'
        ? 'Potreban je internet za pravljenje naloga.' : err.message;
    } finally {
      btn.disabled = false;
    }
  });
}
