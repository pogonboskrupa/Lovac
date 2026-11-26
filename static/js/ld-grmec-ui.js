// Tab "LD Grmeč" u Postavkama: struktura vodstva udruženja iz keša sekcija (radi i bez interneta).
import { getClient, cachedProfile } from './auth.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { canSeeLd, ldTree, ldCandidates } from './ld-grmec.js';
import { loadJSON } from './storage.js';
import { toast, escapeHtml } from './ui.js';
import { assignRole, removeRole } from './uloge-dodjela.js';

const $ = (id) => document.getElementById(id);

const dataMeta = (m) => `data-uloga="${escapeHtml(m.uloga)}" data-korisnik="${escapeHtml(m.korisnikId || '')}" data-revir="${escapeHtml(m.revirId || '')}" data-sekcija="${escapeHtml(m.sekcijaId || '')}" data-grupa="${escapeHtml(m.grupaId || '')}"`;
const opcije = (lista, prazno) => `<option value="">${escapeHtml(prazno)}</option>${lista.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.ime)}</option>`).join('')}`;

// Uređivanje (samo admin): dodijeli postojećeg, skini, napravi nalog za prazno mjesto, dodaj grupu.
function uredi(c, o) {
  if (!c.meta) return '';
  const m = c.meta;
  if (m.uloga === 'grupovodja_grupe') {
    return `<div class="ld-uredi" ${dataMeta(m)}><button type="button" class="dugme" data-ld-akcija="skini" data-dvaput="Dodirni ponovo — uklanja grupu (lovci ostaju bez grupe)">Ukloni grupu</button></div>`;
  }
  const kand = o.candidates(m, '');
  const zauzeto = Boolean(m.korisnikId) && m.uloga !== 'lovocuvar' || (m.uloga === 'lovocuvar' && Boolean(m.korisnikId));
  let h = `<div class="ld-uredi" ${dataMeta(m)}>`;
  if (kand.length) h += `<select class="ld-izbor" aria-label="Izaberi člana za ulogu">${opcije(kand, zauzeto ? 'Zamijeni sa…' : 'Dodijeli člana…')}</select><button type="button" class="dugme" data-ld-akcija="dodijeli">Dodijeli</button>`;
  if (zauzeto) h += '<button type="button" class="dugme" data-ld-akcija="skini" data-dvaput="Dodirni ponovo — skida ulogu">Skini</button>';
  else h += '<button type="button" class="dugme" data-ld-akcija="nalog">Napravi nalog</button>';
  if (m.dodajGrupu) {
    const clanovi = o.candidates(m, 'grupa');
    if (clanovi.length) h += `<select class="ld-izbor-grupa" aria-label="Grupovođa nove grupe">${opcije(clanovi, 'Nova grupa — grupovođa…')}</select><button type="button" class="dugme" data-ld-akcija="grupa-nova">Dodaj grupu</button>`;
  }
  return `${h}</div>`;
}

const cvor = (c, o) => {
  const naslov = c.ulogaOznaka ? `${c.ulogaOznaka} · ${c.uloga}` : c.uloga;
  const prazno = c.prazno || 'Nije postavljen';
  return `<li class="ld-cvor" data-nivo="${c.nivo}"><div class="ld-kartica-cvora"><span class="ld-uloga">${escapeHtml(naslov)}</span>
    <b${c.ime ? '' : ' class="ld-prazno"'}>${escapeHtml(c.ime || prazno)}</b>${c.napomena ? `<span class="sitno">${escapeHtml(c.napomena)}</span>` : ''}${o.edit ? uredi(c, o) : ''}</div>
    ${c.djeca.length ? `<ul>${c.djeca.map((d) => cvor(d, o)).join('')}</ul>` : ''}</li>`;
};

// opcije: { edit, candidates(meta, popuna) -> [{ id, ime }] }
export function ldHtml(tree, opcijeUredi = {}) {
  const o = { edit: false, candidates: () => [], ...opcijeUredi };
  const z = tree.sazetak;
  return `<p class="sitno ld-sazetak">${z.reviri} revira · ${z.sekcija} sekcija · ${z.grupa} grupa</p>
    <ul class="ld-stablo" role="tree">${cvor(tree.korijen, o)}</ul>`;
}

const DRUSTVO = ['predsjednik', 'lovocuvar', 'lovovodja_drustva'];

export function initLdGrmec() {
  const tab = document.querySelector('#p-tabovi [data-ptab="ld"]');
  if (!tab) return;
  let ctx = null;
  let armed = null; // dvaput: "Skini" traži drugi dodir
  const me = () => cachedProfile();
  const edit = () => Boolean(me()?.is_admin);
  const draw = () => {
    if (!ctx) return;
    const users = loadJSON('lovac.clanovi', []);
    // Osvježavanje sa servera ponovo crta stablo: izbor koji je admin već napravio ne smije nestati (isto pravilo kao u Sekcijama).
    const kljuc = (el) => Object.values(el.dataset).join('|');
    const izabrano = new Map([...$('ldg-sadrzaj').querySelectorAll('.ld-uredi')].map((el) => [kljuc(el),
      [el.querySelector('.ld-izbor')?.value || '', el.querySelector('.ld-izbor-grupa')?.value || '']]));
    $('ldg-sadrzaj').innerHTML = ldHtml(ldTree(ctx, memberName), {
      edit: edit(), candidates: (meta, popuna) => ldCandidates(meta, ctx, users, memberName, popuna),
    });
    for (const el of $('ldg-sadrzaj').querySelectorAll('.ld-uredi')) {
      const [a, g] = izabrano.get(kljuc(el)) || ['', ''];
      if (a && el.querySelector('.ld-izbor')) el.querySelector('.ld-izbor').value = a;
      if (g && el.querySelector('.ld-izbor-grupa')) el.querySelector('.ld-izbor-grupa').value = g;
    }
    $('ldg-uputa').textContent = edit()
      ? 'Ovdje uređuješ vodstvo: dodijeli ulogu postojećem članu, skini je ili napravi nalog za prazno mjesto. Lovci se sami registruju i biraju grupu, a ti ih odobravaš.'
      : 'Ko vodi udruženje: predsjednik, lovočuvari, lovovođe i grupovođe. Uređuje administrator.';
  };
  const load = async () => {
    ctx = await cachedSekcije();
    tab.hidden = !canSeeLd(me(), ctx);
    draw();
  };
  // Prikaz iz keša odmah; osvježavanje sa servera u pozadini (ekran se ne smije čekati na mrežu).
  const refresh = async () => {
    await load();
    if (!isServerConfigured() || connectionQuality() === 'nema' || !getClient() || tab.hidden) return;
    try { await downloadSekcije({ grupe: true }); await refreshMembers().catch(() => {}); await load(); } catch { /* ostaje keš */ }
  };

  const metaOf = (el) => {
    const d = el.closest('.ld-uredi').dataset;
    return { uloga: d.uloga, korisnikId: d.korisnik || null, revirId: d.revir || null, sekcijaId: d.sekcija || null, grupaId: d.grupa || null };
  };
  const sekcijaZa = (m) => (m.sekcijaId ? ctx.sekcije.find((x) => x.id === m.sekcijaId) : null) || { id: m.sekcijaId, revir_id: m.revirId };

  $('ldg-sadrzaj').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-ld-akcija]');
    if (!b || !edit()) return;
    const m = metaOf(b);
    const akcija = b.dataset.ldAkcija;
    if (akcija === 'nalog') {
      const sek = m.sekcijaId || ctx.sekcije.find((x) => x.revir_id === m.revirId && x.aktivno !== false)?.id;
      document.dispatchEvent(new CustomEvent('lovac:novi', { detail: { sekcijaId: sek, uloga: m.uloga === 'grupovodja_grupe' ? 'grupovodja_grupe' : m.uloga } }));
      return;
    }
    if (!connectionOk()) { toast('Za uređivanje vodstva potreban je internet'); return; }
    const sb = getClient();
    try {
      if (akcija === 'skini') {
        const key = `${m.uloga}:${m.korisnikId}:${m.revirId}:${m.sekcijaId}:${m.grupaId}`;
        if (armed !== key) {
          armed = key;
          const staro = b.textContent;
          b.textContent = b.dataset.dvaput;
          setTimeout(() => { if (armed === key) { armed = null; if (b.isConnected) b.textContent = staro; } }, 4000);
          return;
        }
        armed = null;
        await removeRole(sb, m.uloga, { userId: m.korisnikId, sekcija: sekcijaZa(m), grupaId: m.grupaId });
        toast('Uloga je skinuta');
      } else if (akcija === 'dodijeli') {
        const id = b.closest('.ld-uredi').querySelector('.ld-izbor')?.value;
        if (!id) { toast('Izaberi člana'); return; }
        if (m.korisnikId && DRUSTVO.includes(m.uloga)) await removeRole(sb, m.uloga, { userId: m.korisnikId });
        await assignRole(sb, m.uloga, { userId: id, sekcija: sekcijaZa(m) });
        toast('Uloga je dodijeljena');
      } else if (akcija === 'grupa-nova') {
        const id = b.closest('.ld-uredi').querySelector('.ld-izbor-grupa')?.value;
        if (!id) { toast('Izaberi grupovođu'); return; }
        await assignRole(sb, 'grupovodja_grupe', { userId: id, sekcija: sekcijaZa(m) });
        toast('Grupa je napravljena');
      }
      await downloadSekcije({ grupe: true });
      await load();
    } catch (err) {
      toast(/row-level security|permission|42501/i.test(err.message) ? 'Server nije dozvolio ovu radnju' : `Greška: ${err.message}`);
    }
  });

  document.addEventListener('postavke:ld', refresh);
  document.addEventListener('sekcije:promjena', load);
  document.getElementById('btn-postavke').addEventListener('click', load);
  load();
}

const connectionOk = () => isServerConfigured() && connectionQuality() !== 'nema' && Boolean(getClient());
