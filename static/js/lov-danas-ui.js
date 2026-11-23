// Dugme "Lov danas" u ploči "+" (samo dok je lov u toku) i ekran sa svim podacima o današnjem lovu iz keša.
import { todayHuntSummary } from './lov-danas.js';
import { cachedProfile } from './auth.js';
import { memberName } from './dijeljenje-ui.js';
import { escapeHtml, registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);

export function initLovDanas() {
  const btn = $('btn-lov-danas');
  const screen = $('lov-danas');
  if (!btn || !screen) return;
  let rec = null;

  const show = () => {
    const active = rec?.lov?.status === 'u_toku';
    btn.hidden = !active;
    if (active) $('lov-danas-opis').textContent = rec.lov.naziv;
    if (!active && !screen.hidden) screen.hidden = true;
  };

  const render = () => {
    const s = todayHuntSummary(rec, cachedProfile()?.id, memberName);
    if (!s) { $('ld-sadrzaj').innerHTML = '<p>Nema lova u toku.</p>'; return; }
    const uc = s.ucesnici.map((u) => `<li class="clan-red" data-uid="${escapeHtml(u.id)}"><span class="clan-tekst"><b>${escapeHtml(u.ime)}${u.ja ? ' (ti)' : ''}</b>
      <span class="sitno">${escapeHtml(u.ulogaTekst)}${u.stan != null ? ` · stan ${u.stan}` : ''}</span></span></li>`).join('') || '<li class="sitno">Nema upisanih učesnika.</li>';
    $('ld-sadrzaj').innerHTML = `
      <div class="p-kartica ld-hero">
        <span class="lk-chip" data-chip="u_toku">U TOKU</span>
        <h3>${escapeHtml(s.naziv)}</h3>
        ${s.mjesto ? `<p class="sitno">${escapeHtml(s.mjesto)}</p>` : ''}
        <div class="ld-brojke">
          <span><b>${escapeHtml(s.pocetak || '—')}</b> početak</span>
          <span><b>${escapeHtml(s.trajanje || '—')}</b> traje</span>
          <span><b>${s.brojevi.ucesnika}</b> učesnika</span>
          <span><b>${s.brojevi.stanova}</b> stanova</span>
        </div>
      </div>
      <div class="p-kartica">
        <h3>Ja u lovu</h3>
        <p>${s.moj ? `${escapeHtml(s.moj.ulogaTekst)}${s.moj.stan != null ? ` · stan ${s.moj.stan}` : ' · stan nije dodijeljen'}` : 'Nisi upisan kao učesnik.'}</p>
        ${s.vodje.length ? `<p class="sitno">Vođa lova: ${escapeHtml(s.vodje.join(', '))}</p>` : ''}
        ${s.napomena ? `<p class="ld-napomena">${escapeHtml(s.napomena)}</p>` : ''}
      </div>
      <div class="ld-akcije">
        <button type="button" class="dugme glavno" data-akcija="raspored">Raspored na karti</button>
        <button type="button" class="dugme" data-akcija="tok">Tok lova</button>
        <button type="button" class="dugme" data-akcija="lokacija">Lokacija</button>
      </div>
      <div class="p-kartica"><h3>Učesnici (${s.brojevi.ucesnika})</h3><ul class="spisak">${uc}</ul></div>`;
  };

  const open = () => {
    $('meni-dodaj').hidden = true;
    render();
    screen.hidden = false;
  };
  const close = () => { screen.hidden = true; };

  btn.addEventListener('click', open);
  $('btn-ld-zatvori').addEventListener('click', close);
  $('ld-sadrzaj').addEventListener('click', (e) => {
    const a = e.target.closest('[data-akcija]')?.dataset.akcija;
    if (!a || !rec) return;
    close();
    if (a === 'raspored') document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: rec.id } }));
    if (a === 'tok') $('btn-tok')?.click();
    if (a === 'lokacija') $('btn-lokacija')?.click();
  });
  document.addEventListener('lov:aktivan', (e) => { rec = e.detail.lov; show(); if (!screen.hidden) render(); });
  registerBackHandler(() => {
    if (screen.hidden) return false;
    close();
    return true;
  });
  show();
}
