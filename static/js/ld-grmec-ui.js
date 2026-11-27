// Tab "Struktura LD Grmeč" u Postavkama: struktura vodstva udruženja iz keša sekcija (radi i bez interneta).
import { getClient, cachedProfile } from './auth.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { canSeeLd, ldTree, ldCandidates, canAddToGroup, groupAddable, groupLeaderChoices } from './ld-grmec.js';
import { loadJSON } from './storage.js';
import { toast, escapeHtml } from './ui.js';
import { assignRole, removeRole } from './uloge-dodjela.js';

const $ = (id) => document.getElementById(id);

const dataMeta = (m) => `data-uloga="${escapeHtml(m.uloga)}" data-korisnik="${escapeHtml(m.korisnikId || '')}" data-revir="${escapeHtml(m.revirId || '')}" data-sekcija="${escapeHtml(m.sekcijaId || '')}" data-grupa="${escapeHtml(m.grupaId || '')}"`;
const opcije = (lista, prazno) => `<option value="">${escapeHtml(prazno)}</option>${lista.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.ime)}</option>`).join('')}`;

const inicijali = (ime) => String(ime || '').split(/\s+/).filter(Boolean).slice(0, 2).map((r) => r[0].toUpperCase()).join('') || '?';

// Uređivanje (admin): dodijeli postojećeg, skini, napravi nalog za prazno mjesto, dodaj grupu.
function uredi(c, o) {
  const m = c.meta;
  const kand = o.candidates(m, '');
  const zauzeto = Boolean(m.korisnikId);
  let h = '';
  if (kand.length) h += `<select class="ld-izbor" aria-label="Izaberi člana za ulogu">${opcije(kand, zauzeto ? 'Zamijeni sa…' : 'Dodijeli člana…')}</select><button type="button" class="dugme" data-ld-akcija="dodijeli">Dodijeli</button>`;
  if (zauzeto) h += '<button type="button" class="dugme" data-ld-akcija="skini" data-dvaput="Dodirni ponovo — skida ulogu">Skini</button>';
  else h += '<button type="button" class="dugme" data-ld-akcija="nalog">Napravi nalog</button>';
  if (m.dodajGrupu) {
    const clanovi = o.candidates(m, 'grupa');
    h += clanovi.length
      ? `<select class="ld-izbor-grupa" aria-label="Grupovođa nove grupe">${opcije(clanovi, 'Nova grupa — grupovođa…')}</select><button type="button" class="dugme" data-ld-akcija="grupa-nova">Dodaj grupu</button>`
      : '<p class="sitno ld-napomena">Grupa se pravi tek kad postoji član koji će biti grupovođa.</p>';
  }
  return h;
}

// Grupa: lovce u nju dodaje ko smije (nalog ili postojeći član bez grupe); uklanja samo admin.
function urediGrupu(c, o) {
  const m = c.meta;
  let h = '';
  if (o.canAdd(m.sekcijaId)) {
    const kand = o.addable(m.sekcijaId);
    h += '<button type="button" class="dugme glavno" data-ld-akcija="lovac-u-grupi">Napravi lovca u ovoj grupi</button>';
    if (kand.length) h += `<select class="ld-izbor" aria-label="Postojeći član bez grupe">${opcije(kand, 'Postojeći član bez grupe…')}</select><button type="button" class="dugme" data-ld-akcija="u-grupu">Dodaj u grupu</button>`;
  }
  if (o.canAdd(m.sekcijaId)) {
    const gv = o.leaders(m.sekcijaId, m.grupaId);
    if (gv.length) h += `<select class="ld-izbor-gv" aria-label="Nova grupovođa">${opcije(gv, 'Nova grupovođa…')}</select><button type="button" class="dugme" data-ld-akcija="promijeni-gv">Postavi za grupovođu</button>`;
  }
  if (o.edit) h += '<button type="button" class="dugme" data-ld-akcija="skini" data-dvaput="Dodirni ponovo — uklanja grupu (lovci ostaju bez grupe)">Ukloni grupu</button>';
  return h;
}

// Grupe i "Članovi bez grupe" su zadano SKLOPLJENI (spisak lovaca je dug); revir i sekcija zadano rasklopljeni.
// `sklopljeno` pamti samo odstupanja od zadanog (obrnuto stanje po ključu).
const zadanoSklopljen = (kljuc) => /^[gb]:/.test(kljuc || '');
export const jeSklopljen = (kljuc, obrnuto) => Boolean(kljuc) && zadanoSklopljen(kljuc) !== obrnuto.has(kljuc);
const kljuceviLovaca = (c, out = []) => { if (c.kljuc && zadanoSklopljen(c.kljuc) && c.djeca.length) out.push(c.kljuc); c.djeca.forEach((d) => kljuceviLovaca(d, out)); return out; };

const cvor = (c, o) => {
  const naslov = c.ulogaOznaka ? `${c.ulogaOznaka} · ${c.uloga}` : c.uloga;
  const prazno = c.prazno || 'Nije postavljen';
  const sklopljen = jeSklopljen(c.kljuc, o.sklopljeno);
  const kontrole = c.meta ? (c.nivo === 'grupa' ? urediGrupu(c, o) : o.edit ? uredi(c, o) : '') : '';
  // bez korisnikId: ključ se ne smije promijeniti kad se uloga dodijeli, inače se "Uredi" zatvori usred rada
  const kljucU = c.meta ? `${c.meta.uloga}|${c.meta.revirId || ''}|${c.meta.sekcijaId || ''}|${c.meta.grupaId || ''}` : '';
  return `<li class="ld-cvor" data-nivo="${c.nivo}"><div class="ld-kartica-cvora" data-prazno="${!c.ime && c.nivo !== 'grupa'}">
    <div class="ld-glava"><span class="ld-lice" aria-hidden="true">${c.ime ? escapeHtml(inicijali(c.ime)) : '+'}</span>
      <div class="ld-tekst"><span class="ld-uloga">${escapeHtml(naslov)}</span><b${c.ime ? '' : ' class="ld-prazno"'}>${escapeHtml(c.ime || prazno)}</b>${c.napomena ? `<span class="sitno">${escapeHtml(c.napomena)}</span>` : ''}</div>
      ${c.kljuc && c.djeca.length ? `<button type="button" class="ld-sklopi" data-ld-sklopi="${escapeHtml(c.kljuc)}" aria-expanded="${!sklopljen}" aria-label="${sklopljen ? 'Rasklopi' : 'Sklopi'} ${escapeHtml(c.uloga)}">${sklopljen ? '▸' : '▾'} <span class="sitno">${c.djeca.length}${c.nivo === 'grupa' || c.nivo === 'bez-grupe' ? ' lovaca' : ''}</span></button>` : ''}</div>
    ${kontrole ? `<details class="ld-uredi-okvir" data-ld-otv="${escapeHtml(kljucU)}"${o.urediOtvoreno.has(kljucU) ? ' open' : ''}><summary>Uredi</summary><div class="ld-uredi" ${dataMeta(c.meta)}>${kontrole}</div></details>` : ''}</div>
    ${c.djeca.length && !sklopljen ? `<ul>${c.djeca.map((d) => cvor(d, o)).join('')}</ul>` : ''}</li>`;
};

// opcije: { edit, sklopljeno:Set, urediOtvoreno:Set, candidates(meta, popuna), canAdd(sekcijaId), addable(sekcijaId) }
export function ldHtml(tree, opcijeUredi = {}) {
  const o = { edit: false, sklopljeno: new Set(), urediOtvoreno: new Set(), candidates: () => [], canAdd: () => false, addable: () => [], leaders: () => [], ...opcijeUredi };
  const z = tree.sazetak;
  const pct = z.mjesta ? Math.round((z.popunjeno / z.mjesta) * 100) : 0;
  return `<div class="ld-plocice">
      <div class="ld-ploca" data-ld-p="popunjeno"><b>${z.popunjeno}/${z.mjesta}</b><span>mjesta popunjeno</span></div>
      <div class="ld-ploca" data-ld-p="slobodno" data-ima="${z.slobodno > 0}"><b>${z.slobodno}</b><span>slobodnih mjesta</span></div>
      <div class="ld-ploca"><b>${z.reviri}</b><span>revira</span></div>
      <div class="ld-ploca"><b>${z.sekcija}</b><span>sekcija</span></div>
      <div class="ld-ploca"><b>${z.grupa}</b><span>grupa</span></div>
    </div>
    <div class="ld-traka" role="img" aria-label="Popunjeno ${pct} %"><span style="width:${pct}%"></span></div>
    <div class="ld-alati"><button type="button" class="dugme" data-ld-svi="otvori">Prikaži sve lovce</button><button type="button" class="dugme" data-ld-svi="sklopi">Sklopi lovce</button></div>
    <ul class="ld-stablo" role="tree">${cvor(tree.korijen, o)}</ul>`;
}

const DRUSTVO = ['predsjednik', 'lovocuvar', 'lovovodja_drustva'];

export function initLdGrmec() {
  const tab = document.querySelector('#p-tabovi [data-ptab="ld"]');
  if (!tab) return;
  let ctx = null;
  let armed = null; // dvaput: "Skini" traži drugi dodir
  const sklopljeno = new Set(); // odstupanja od zadanog (grupe sklopljene, revir/sekcija rasklopljeni), u memoriji
  let zadnjeStablo = null;
  const urediOtvoreno = new Set(); // koje su kartice "Uredi" otvorene (preživi ponovno crtanje)
  const me = () => cachedProfile();
  const edit = () => Boolean(me()?.is_admin);
  const draw = () => {
    if (!ctx) return;
    const users = loadJSON('lovac.clanovi', []);
    // Koje su kartice "Uredi" otvorene čita se iz DOM-a PRIJE crtanja (toggle događaj stiže kasno, pa bi ponovno crtanje zatvorilo karticu)
    for (const d of $('ldg-sadrzaj').querySelectorAll('details[data-ld-otv]')) {
      if (d.open) urediOtvoreno.add(d.dataset.ldOtv); else urediOtvoreno.delete(d.dataset.ldOtv);
    }
    // Osvježavanje sa servera ponovo crta stablo: izbor koji je admin već napravio ne smije nestati (isto pravilo kao u Sekcijama).
    const kljuc = (el) => Object.values(el.dataset).join('|');
    const izabrano = new Map([...$('ldg-sadrzaj').querySelectorAll('.ld-uredi')].map((el) => [kljuc(el),
      [el.querySelector('.ld-izbor')?.value || '', el.querySelector('.ld-izbor-grupa')?.value || '', el.querySelector('.ld-izbor-gv')?.value || '']]));
    zadnjeStablo = ldTree(ctx, memberName);
    $('ldg-sadrzaj').innerHTML = ldHtml(zadnjeStablo, {
      edit: edit(), sklopljeno, urediOtvoreno,
      candidates: (meta, popuna) => ldCandidates(meta, ctx, users, memberName, popuna),
      canAdd: (sekcijaId) => canAddToGroup(me(), ctx, sekcijaId),
      addable: (sekcijaId) => groupAddable(sekcijaId, ctx, memberName),
      leaders: (sekcijaId, grupaId) => groupLeaderChoices(sekcijaId, grupaId, ctx, memberName),
    });
    drawKorisnici();
    for (const el of $('ldg-sadrzaj').querySelectorAll('.ld-uredi')) {
      const [a, g, gv] = izabrano.get(kljuc(el)) || ['', '', ''];
      if (gv && el.querySelector('.ld-izbor-gv')) el.querySelector('.ld-izbor-gv').value = gv;
      if (a && el.querySelector('.ld-izbor')) el.querySelector('.ld-izbor').value = a;
      if (g && el.querySelector('.ld-izbor-grupa')) el.querySelector('.ld-izbor-grupa').value = g;
    }
    $('ldg-uputa').textContent = edit()
      ? 'Pod "Uredi" uz svako mjesto: dodijeli postojećeg člana, skini ulogu ili napravi nalog za prazno mjesto. U grupi možeš napraviti novog lovca ili dodati postojećeg. Lovci se sami registruju i biraju grupu, a ti ih odobravaš.'
      : 'Ko vodi udruženje: predsjednik, lovočuvari, lovovođe i grupovođe. Vodstvo uređuje administrator; lovce u grupe dodaju lovovođe.';
  };
  // Korisnici i odobrenja odmah ispod strukture: sažetak (zadnje stanje sa ekrana) i dugme koje ga otvara.
  const drawKorisnici = () => {
    $('ldg-korisnici').hidden = !edit();
    if (!edit()) return;
    const z = loadJSON('lovac.korisnici.sazetak', null);
    $('ldg-kor-brojke').innerHTML = z
      ? `<div class="ld-ploca" data-ima="${z.ceka > 0}"><b>${z.ceka}</b><span>čeka odobrenje</span></div><div class="ld-ploca"><b>${z.probni}</b><span>u probnom periodu</span></div><div class="ld-ploca"><b>${z.odobreni}</b><span>odobreno</span></div><div class="ld-ploca"><b>${z.admini}</b><span>administratora</span></div>`
      : '<p class="sitno">Brojke se pojave kad se jednom otvori Korisnici i odobrenja.</p>';
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
    const svi = e.target.closest('[data-ld-svi]');
    if (svi && zadnjeStablo) {
      const kljuc = kljuceviLovaca(zadnjeStablo.korijen);
      for (const k of kljuc) { if (svi.dataset.ldSvi === 'otvori') sklopljeno.add(k); else sklopljeno.delete(k); }
      draw(); return;
    }
    const sk = e.target.closest('[data-ld-sklopi]');
    if (sk) { const k = sk.dataset.ldSklopi; if (sklopljeno.has(k)) sklopljeno.delete(k); else sklopljeno.add(k); draw(); return; }
    const b = e.target.closest('[data-ld-akcija]');
    if (!b) return;
    const m = metaOf(b);
    const akcija = b.dataset.ldAkcija;
    const grupaAkcija = akcija === 'lovac-u-grupi' || akcija === 'u-grupu' || akcija === 'promijeni-gv';
    if (grupaAkcija ? !canAddToGroup(me(), ctx, m.sekcijaId) : !edit()) return;
    if (akcija === 'lovac-u-grupi') {
      const grupa = (ctx.grupe || []).find((x) => x.id === m.grupaId);
      document.dispatchEvent(new CustomEvent('lovac:novi', { detail: { sekcijaId: m.sekcijaId, grupaId: m.grupaId, grupaTekst: grupa ? `grupovođa ${memberName(grupa.grupovodja_id)}` : '' } }));
      return;
    }
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
      } else if (akcija === 'u-grupu') {
        const id = b.closest('.ld-uredi').querySelector('.ld-izbor')?.value;
        if (!id) { toast('Izaberi člana'); return; }
        const { error } = await sb.rpc('dodijeli_grupu', { p_sekcija: m.sekcijaId, p_korisnik: id, p_grupa: m.grupaId });
        if (error) throw new Error(error.message);
        toast('Lovac je dodan u grupu');
      } else if (akcija === 'promijeni-gv') {
        const id = b.closest('.ld-uredi').querySelector('.ld-izbor-gv')?.value;
        if (!id) { toast('Izaberi novu grupovođu'); return; }
        // novi grupovođa mora biti u toj grupi (prvo se stavi u nju, pa postane vođa); raniji ostaje član grupe
        const red = (ctx.clanovi || []).find((c) => c.sekcija_id === m.sekcijaId && c.korisnik_id === id);
        if (red?.grupa_id !== m.grupaId) {
          const r = await sb.rpc('dodijeli_grupu', { p_sekcija: m.sekcijaId, p_korisnik: id, p_grupa: m.grupaId });
          if (r.error) throw new Error(r.error.message);
        }
        const stari = (ctx.grupe || []).find((x) => x.id === m.grupaId)?.grupovodja_id;
        const u = await sb.from('grupe').update({ grupovodja_id: id }).eq('id', m.grupaId);
        if (u.error) throw new Error(u.error.message);
        if (stari && stari !== id) {
          const r2 = await sb.rpc('dodijeli_grupu', { p_sekcija: m.sekcijaId, p_korisnik: stari, p_grupa: m.grupaId });
          if (r2.error) console.warn('raniji grupovođa ostaje bez grupe', r2.error.message);
        }
        toast('Grupovođa je promijenjen');
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

  $('ldg-sadrzaj').addEventListener('toggle', (e) => {
    const k = e.target.dataset?.ldOtv;
    if (k === undefined) return;
    if (e.target.open) urediOtvoreno.add(k); else urediOtvoreno.delete(k);
  }, true);
  $('btn-ldg-korisnici').addEventListener('click', () => $('btn-korisnici').click());
  document.addEventListener('postavke:ld', refresh);
  document.addEventListener('sekcije:promjena', load);
  document.getElementById('btn-postavke').addEventListener('click', load);
  load();
}

const connectionOk = () => isServerConfigured() && connectionQuality() !== 'nema' && Boolean(getClient());
