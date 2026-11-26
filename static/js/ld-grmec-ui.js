// Tab "LD Grmeč" u Postavkama: struktura vodstva udruženja iz keša sekcija (radi i bez interneta).
import { getClient, cachedProfile } from './auth.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { escapeHtml } from './ui.js';
import { canSeeLd, ldTree } from './ld-grmec.js';

const $ = (id) => document.getElementById(id);

const cvor = (c) => {
  const naslov = c.ulogaOznaka ? `${c.ulogaOznaka} · ${c.uloga}` : c.uloga;
  const prazno = c.prazno || 'Nije postavljen';
  return `<li class="ld-cvor" data-nivo="${c.nivo}"><div class="ld-kartica-cvora"><span class="ld-uloga">${escapeHtml(naslov)}</span>
    <b${c.ime ? '' : ' class="ld-prazno"'}>${escapeHtml(c.ime || prazno)}</b>${c.napomena ? `<span class="sitno">${escapeHtml(c.napomena)}</span>` : ''}</div>
    ${c.djeca.length ? `<ul>${c.djeca.map(cvor).join('')}</ul>` : ''}</li>`;
};

export function ldHtml(tree) {
  const z = tree.sazetak;
  return `<p class="sitno ld-sazetak">${z.reviri} revira · ${z.sekcija} sekcija · ${z.grupa} grupa</p>
    <ul class="ld-stablo" role="tree">${cvor(tree.korijen)}</ul>`;
}

export function initLdGrmec() {
  const tab = document.querySelector('#p-tabovi [data-ptab="ld"]');
  if (!tab) return;
  let ctx = null;
  const draw = () => { if (ctx) $('ldg-sadrzaj').innerHTML = ldHtml(ldTree(ctx, memberName)); };
  const load = async () => {
    ctx = await cachedSekcije();
    tab.hidden = !canSeeLd(cachedProfile(), ctx);
    draw();
  };
  // Prikaz iz keša odmah; osvježavanje sa servera u pozadini (ekran se ne smije čekati na mrežu).
  const refresh = async () => {
    await load();
    if (!isServerConfigured() || connectionQuality() === 'nema' || !getClient() || tab.hidden) return;
    try { await downloadSekcije({ grupe: true }); await refreshMembers().catch(() => {}); await load(); } catch { /* ostaje keš */ }
  };
  document.addEventListener('postavke:ld', refresh);
  document.addEventListener('sekcije:promjena', load);
  document.getElementById('btn-postavke').addEventListener('click', load);
  load();
}
