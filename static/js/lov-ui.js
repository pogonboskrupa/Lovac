// Zajednički lov: spisak (keš za offline), organizacija (admin / vođa revira), raspored na karti
// sa zabranjenim pravcima i kompasom. SIGURNOSNA funkcija: ne zamjenjuje pravila lova ni vođu lova.

import { getClient, cachedProfile } from './auth.js';
import { idbPut, idbAll, idbGet, idbDelete } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { myAssignment, sectorsForStand, nextStandNumber, todaysHunts, headingCheck, KOMPAS_TOLERANCIJA, huntGroups, huntDateText, huntsNeedingDetails, chunks, rankByActivity } from './lov.js';
import { collectPages } from './pregled.js';
import { standWarnings, sectorWedge } from './sektori.js';
import { onGpsUpdate, currentHeading, currentFix } from './gps.js';
import { rangeLabel } from './istrazivac.js';
import { logoStyle } from './sekcija-logo.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import { printHuntReport } from './uzivo-ui.js';
import { canManageHunt } from './lov-traje.js';
import { canDeleteHunt, deleteHunt } from './lov-brisanje.js';
import { MOJE_SEKCIJE_KEY, cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { mySectionsAsLeader } from './sekcije.js';

const STORE = 'lovovi';
const $ = (id) => document.getElementById(id);
const ULOGE = { strijelac: 'Strijelac', pogonic: 'Pogonič', vodja: 'Vođa lova' };
const STATUS = { planiran: 'Planiran', u_toku: 'U toku', zavrsen: 'Završen' };
export const NAPOMENA_SIGURNOST = 'Ne zamjenjuje pravila lova ni vođu lova. Kompas telefona može griješiti — uvijek provjeri pogledom.';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

// Preuzima sve lovove koje server dozvoli, sa rasporedom, u keš (radi offline poslije).
// Raspored se vuče skupno (`in`) i samo za lovove koji se mogu mijenjati ili ih nema u kešu — štedi besplatni server.
// Keširani podaci koje ne daje ovaj upit (telefoni za SMS) se čuvaju.
const LOVOVI_KURSOR = 'lovac.kursor.lovovi';
const LOVOVI_PUNO_MS = 10 * 60000;

export async function downloadHunts({ full: force = false } = {}) {
  const sb = getClient();
  const cached = new Map((await idbAll(STORE).catch(() => [])).map((r) => [r.id, r]));
  // Puni spisak lovova jednom u LOVOVI_PUNO_MS; između toga samo izmijenjeni (promijenjeno postavlja server)
  // + keširani lovovi koji još nisu završeni (prijava prisustva mijenja učesnike, ne red lova).
  const cur = loadJSON(LOVOVI_KURSOR, null);
  const full = force || !cur || Date.now() - cur.puno > LOVOVI_PUNO_MS;
  let lovovi; let reviri; let sekcije;
  if (full) {
    [lovovi, reviri, sekcije] = await Promise.all([
      collectPages((a, z) => q(sb.from('lovovi').select('*').order('id').range(a, z))),
      q(sb.from('reviri').select('*')),
      q(sb.from('sekcije').select('*')),
    ]);
  } else {
    const changed = await collectPages((a, z) => q(sb.from('lovovi').select('*').gt('promijenjeno', cur.v).order('id').range(a, z)));
    const byId = new Map([...cached.values()].filter((r) => r.lov && r.lov.status !== 'zavrsen').map((r) => [r.id, r.lov]));
    for (const l of changed) byId.set(l.id, l);
    lovovi = [...byId.values()];
    reviri = (await idbGet('spiskovi', 'reviri').catch(() => null))?.rows || [];
    sekcije = (await cachedSekcije()).sekcije || [];
  }
  const maxP = Math.max(...lovovi.map((l) => Date.parse(l.promijenjeno)).filter(Number.isFinite), Date.parse(cur?.v || 0) + 15000);
  saveSoft(LOVOVI_KURSOR, { v: new Date(maxP - 15000).toISOString(), puno: full ? Date.now() : cur.puno });
  const need = huntsNeedingDetails(lovovi, cached);
  const ucesnici = [];
  const stanovi = [];
  for (const part of chunks(need.map((l) => l.id), 60)) {
    ucesnici.push(...await collectPages((a, z) => q(sb.from('lov_ucesnici').select('*').in('lov_id', part).order('lov_id').order('korisnik_id').range(a, z))));
    stanovi.push(...await collectPages((a, z) => q(sb.from('stanovi').select('*').in('lov_id', part).order('id').range(a, z))));
  }
  const sektori = [];
  for (const part of chunks(stanovi.map((s) => s.id), 60)) {
    sektori.push(...await collectPages((a, z) => q(sb.from('sektori').select('*').in('stan_id', part).order('id').range(a, z))));
  }
  for (const lov of lovovi) {
    const prev = cached.get(lov.id) || {};
    const fresh = need.some((l) => l.id === lov.id);
    const st = fresh ? stanovi.filter((s) => s.lov_id === lov.id) : prev.stanovi || [];
    const ids = new Set(st.map((s) => s.id));
    await idbPut(STORE, {
      ...prev, id: lov.id, lov,
      ucesnici: fresh ? ucesnici.filter((u) => u.lov_id === lov.id) : prev.ucesnici || [],
      stanovi: st,
      sektori: fresh ? sektori.filter((x) => ids.has(x.stan_id)) : prev.sektori || [],
      revir: reviri.find((r) => r.id === lov.revir_id) || null, sekcija: sekcije.find((s) => s.id === lov.sekcija_id) || null,
      preuzeto: fresh ? Date.now() : prev.preuzeto || Date.now(),
    });
  }
  if (full) {
    await idbPut('spiskovi', { id: 'reviri', rows: reviri, preuzeto: Date.now() });
    // Lov koji server više ne daje (obrisan, izbačen iz sekcije) se uklanja iz keša — inače bi "u toku" lov
    // zauvijek držao traku uživo i slanje pozicije.
    const live = new Set(lovovi.map((l) => l.id));
    for (const id of cached.keys()) if (!live.has(id)) await idbDelete(STORE, id).catch(() => {});
  }
  // novi lov sekcije → pitanje "Dolaziš?" (odaziv-ui)
  document.dispatchEvent(new CustomEvent('lovovi:preuzeti'));
  return lovovi.length;
}

function standIcon(L, s, mine) {
  return L.divIcon({
    className: 'stan-marker',
    html: `<div class="stan-ikona${mine ? ' moj' : ''}" data-broj="${s.broj}">${s.broj}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function initLov(L, map) {
  const list = $('lovovi');
  const editor = $('lov-uredi');
  const panel = $('lov-panel');
  const layer = L.layerGroup();
  let shown = null; // keširan lov koji je na karti
  let selectedStand = null;
  let editing = null;
  let placing = false;

  const me = () => cachedProfile();

  // ---------------- raspored na karti ----------------
  const drawSchedule = () => {
    layer.clearLayers();
    if (!shown) return;
    const mine = myAssignment(shown, me()?.id);
    const focus = selectedStand || mine?.stan;
    for (const s of shown.stanovi) {
      if (!Number.isFinite(s.lat)) continue;
      L.marker([s.lat, s.lon], { icon: standIcon(L, s, s.id === mine?.stan?.id), keyboard: false })
        .on('click', () => { selectedStand = s; drawSchedule(); updatePanel(); })
        .bindTooltip(() => `Stan ${s.broj}${currentFix() ? ` · ${rangeLabel(currentFix(), s)}` : ''}`)
        .addTo(layer);
    }
    if (focus && Number.isFinite(focus.lat)) {
      for (const arc of sectorsForStand(focus, shown).lukovi) {
        L.polygon(sectorWedge(focus, arc, 600), { interactive: false, color: '#c1121f', weight: 2, fillColor: '#c1121f', fillOpacity: 0.28, className: 'sektor-zabranjen' }).addTo(layer);
      }
    }
  };

  const updatePanel = () => {
    if (!shown) { panel.hidden = true; return; }
    const mine = myAssignment(shown, me()?.id);
    const focus = selectedStand || mine?.stan;
    $('lov-panel-naziv').textContent = `${shown.lov.naziv} · ${STATUS[shown.lov.status]}`;
    $('lov-panel-uloga').textContent = mine
      ? `${ULOGE[mine.uloga]}${mine.stan ? ` · stan ${mine.stan.broj}` : ''}${selectedStand && selectedStand !== mine.stan ? ` · prikazan stan ${selectedStand.broj}` : ''}`
      : (focus ? `Prikazan stan ${focus.broj}` : 'Nisi učesnik ovog lova');
    $('btn-lov-stan').hidden = !(focus && Number.isFinite(focus.lat));
    const bezStanova = !shown.stanovi.some((s) => Number.isFinite(s.lat));
    $('lov-panel-prazno').hidden = !bezStanova;
    $('lov-kompas').hidden = bezStanova; // bez stanova nema šta provjeravati; ostaje samo poruka o rasporedu
    $('btn-lov-panel-uredi').textContent = bezStanova ? 'Postavi stanove' : 'Uredi raspored';
    // Ko upravlja lovom (admin, organizator, grupovođa sekcije) mora odavde moći postaviti raspored —
    // lov napravljen iz taba sekcije nema stanova, a spisak "Organizuj" nije na putu do karte.
    cachedSekcije().catch(() => ({})).then((ctx) => {
      if (shown) $('btn-lov-panel-uredi').hidden = shown.lov.status === 'zavrsen' || !canManageHunt(shown, ctx, me());
    });
    const k = $('lov-kompas');
    if (!focus) { k.dataset.stanje = 'nepoznato'; k.textContent = 'Nema stana za provjeru pravca'; return; }
    const st = headingCheck(currentHeading(), sectorsForStand(focus, shown).lukovi);
    k.dataset.stanje = st;
    k.textContent = st === 'zabranjeno' ? 'NE PUCAJ u ovom pravcu (zabranjeni sektor)'
      : st === 'dozvoljeno' ? `Telefon ne pokazuje u zabranjeni sektor (±${KOMPAS_TOLERANCIJA}°)`
        : 'Kompas nije dostupan — gledaj crvene sektore na karti';
  };
  onGpsUpdate(() => { if (shown) updatePanel(); });
  $('btn-lov-stan').addEventListener('click', () => {
    const focus = selectedStand || myAssignment(shown, me()?.id)?.stan;
    if (shown && focus) document.dispatchEvent(new CustomEvent('stan:otvori', { detail: { data: shown, stand: focus } }));
  });

  const showSchedule = async (id) => {
    shown = await idbGet(STORE, id);
    selectedStand = null;
    layer.addTo(map);
    drawSchedule();
    updatePanel();
    panel.hidden = false;
    list.hidden = true;
    const mine = myAssignment(shown, me()?.id);
    const s = mine?.stan || shown.stanovi.find((x) => Number.isFinite(x.lat));
    if (s) map.setView([s.lat, s.lon], Math.max(map.getZoom(), 15));
    document.dispatchEvent(new CustomEvent('lov:prikazan', { detail: { lov: shown } }));
    // Status (npr. vođa je pokrenuo lov) se osvježava u pozadini dok ima veze.
    const before = shown.lov.status;
    downloadHunts().then(async () => {
      const fresh = await idbGet(STORE, id);
      if (shown?.id === id && fresh && fresh.lov.status !== before) await showSchedule(id);
    }).catch(() => {});
  };
  const hideSchedule = () => {
    shown = null;
    layer.clearLayers();
    map.removeLayer(layer);
    panel.hidden = true;
    document.dispatchEvent(new CustomEvent('lov:prikazan', { detail: { lov: null } }));
  };
  $('btn-lov-panel-zatvori').addEventListener('click', hideSchedule);
  $('btn-lov-panel-uredi').addEventListener('click', () => { if (shown) openEditor(shown.id).catch((err) => console.warn('lov', err)); });

  // ---------------- spisak ----------------
  const canOrganizeAny = () => Boolean(me()?.is_admin) || loadJSON('lovac.vodja_revira', []).length > 0
    || loadJSON(MOJE_SEKCIJE_KEY, []).length > 0;

  const renderList = async () => {
    const all = (await idbAll(STORE)).sort((a, b) => String(b.lov.datum).localeCompare(String(a.lov.datum)));
    const today = new Set(todaysHunts(all.map((x) => x.lov)).map((l) => l.id));
    $('lovovi-prazno').hidden = all.length > 0;
    $('btn-lov-novi').hidden = !canOrganizeAny();
    $('btn-lov-reviri').hidden = !me()?.is_admin;
    const card = (x) => {
      const mine = myAssignment(x, me()?.id);
      const isToday = today.has(x.id);
      const chip = x.lov.status === 'u_toku' ? ['U TOKU', 'u_toku'] : isToday ? ['DANAS', 'danas'] : x.lov.status === 'zavrsen' ? ['Završen', 'zavrsen'] : ['Planiran', 'planiran'];
      return `<li class="trag-red lov-kartica" data-id="${escapeHtml(x.id)}" data-status="${x.lov.status}">
        <div class="lk-glava">
          ${x.sekcija ? `<span class="sek-logo" style="${logoStyle(x.sekcija)}" role="img" aria-label="Logo sekcije ${escapeHtml(x.sekcija.naziv)}"></span>` : ''}
          <div class="trag-naslov"><b>${escapeHtml(x.lov.naziv)}</b>
            <span class="lk-datum">${escapeHtml(huntDateText(x.lov.datum))}</span>
            <span class="sitno">${escapeHtml(x.revir?.naziv || '')}${x.sekcija ? ` · ${escapeHtml(x.sekcija.naziv)}` : ''}${mine?.stan ? ` · stan ${mine.stan.broj}` : ''}</span></div>
          <span class="lk-chip" data-chip="${chip[1]}">${chip[0]}</span>
        </div>
        <div class="sk-statovi lk-statovi"><div><b>${x.ucesnici.length}</b><span>učesnika</span></div><div><b>${x.stanovi.length}</b><span>stanova</span></div>
          ${mine ? `<div><b>${escapeHtml(ULOGE[mine.uloga])}</b><span>moja uloga</span></div>` : ''}</div>
        <div class="lk-dugmad"><button type="button" class="dugme glavno" data-akcija="prikazi">Raspored na karti</button>
        <div class="lk-sporedna">${x.lov.status !== 'planiran' ? '<button type="button" class="dugme" data-akcija="izvjestaj">Izvještaj (PDF)</button>' : ''}
        ${canOrganizeAny() ? '<button type="button" class="dugme" data-akcija="uredi">Organizuj</button>' : ''}
        ${canDeleteHunt(x, me()) ? '<button type="button" class="dugme" data-akcija="obrisi">Obriši lov</button>' : ''}</div></div>
      </li>`;
    };
    const groups = huntGroups(all, [...today]);
    $('lovh-danas').textContent = groups[0][1].length;
    $('lovh-plan').textContent = groups[1][1].length;
    $('lovh-zavrsen').textContent = groups[2][1].length;
    $('lovovi-spisak').innerHTML = groups.filter(([, l]) => l.length).map(([naslov, l]) => `<li class="lk-grupa" aria-hidden="true">${naslov} (${l.length})</li>${l.map(card).join('')}`).join('');
  };

  const refresh = async () => {
    $('lovovi-status').textContent = 'Preuzimam sa servera…';
    try {
      await refreshMembers().catch(() => {});
      const n = await downloadHunts({ full: true });
      await downloadSekcije().catch((err) => console.warn('sekcije', err.message));
      const vodje = await q(getClient().from('revir_vodje').select('*'));
      saveSoft('lovac.vodja_revira', vodje.filter((v) => v.korisnik_id === me()?.id).map((v) => v.revir_id));
      $('lovovi-status').textContent = `Preuzeto lovova: ${n}. Raspored radi i bez interneta.`;
    } catch (err) {
      $('lovovi-status').textContent = `Nema veze sa serverom — prikazan je keš (${err.message})`;
    }
    await renderList();
  };

  $('lovovi-spisak').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-akcija]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    if (b.dataset.akcija === 'prikazi') await showSchedule(id);
    if (b.dataset.akcija === 'uredi') await openEditor(id);
    if (b.dataset.akcija === 'izvjestaj') await printHuntReport(id);
    if (b.dataset.akcija === 'obrisi') {
      // brisanje je za sve i nepovratno: drugi dodir na isto dugme
      if (b.dataset.potvrda !== '1') {
        b.dataset.potvrda = '1';
        b.textContent = 'Dodirni ponovo — briše lov za sve';
        setTimeout(() => { if (b.isConnected) { delete b.dataset.potvrda; b.textContent = 'Obriši lov'; } }, 4000);
        return;
      }
      try {
        await deleteHunt(id);
        toast('Lov je obrisan');
        await renderList();
      } catch (err) {
        $('lovovi-status').textContent = err.message;
      }
    }
  });
  $('btn-lovovi').addEventListener('click', async () => {
    $('meni-spiskovi').hidden = true;
    list.hidden = false;
    await renderList();
    refresh();
  });
  $('btn-lovovi-zatvori').addEventListener('click', () => { list.hidden = true; });
  $('btn-lovovi-osvjezi').addEventListener('click', refresh);

  // ---------------- organizacija ----------------
  const reviriCache = async () => (await idbGet('spiskovi', 'reviri'))?.rows || [];

  // Sekcije u kojima smijem organizovati lov: admin sve, grupovođa svoje.
  const organizableSections = async () => {
    const all = (await cachedSekcije()).sekcije.filter((s) => s.aktivno !== false);
    return me()?.is_admin ? all : mySectionsAsLeader(all, me()?.id);
  };
  // Bez prava na revir (samo grupovođa) lov MORA imati sekciju; server to provodi, ovdje se samo vodi lovca.
  let sectionRequired = false;

  $('btn-lov-novi').addEventListener('click', async () => {
    const mojiReviri = loadJSON('lovac.vodja_revira', []);
    const sections = await organizableSections();
    const reviri = (await reviriCache()).filter((r) => r.aktivno !== false
      && (me()?.is_admin || mojiReviri.includes(r.id) || sections.some((s) => s.revir_id === r.id)));
    $('lov-novi-revir').innerHTML = reviri.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.naziv)}</option>`).join('');
    sectionRequired = !me()?.is_admin && !mojiReviri.length;
    $('lov-novi-sekcija').innerHTML = (sectionRequired ? '' : '<option value="">— bez sekcije —</option>')
      + sections.map((s) => `<option value="${escapeHtml(s.id)}" data-revir="${escapeHtml(s.revir_id)}">${escapeHtml(s.naziv)}</option>`).join('');
    const sync = () => {
      const o = $('lov-novi-sekcija').selectedOptions[0];
      if (o?.dataset.revir) $('lov-novi-revir').value = o.dataset.revir;
      $('lov-novi-revir').disabled = Boolean(o?.dataset.revir);
    };
    $('lov-novi-sekcija').onchange = sync;
    sync();
    $('lov-novi').hidden = false;
  });
  $('btn-lov-novi-odustani').addEventListener('click', () => { $('lov-novi').hidden = true; });
  $('forma-lov-novi').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const rows = await q(getClient().from('lovovi').insert({
        revir_id: f.revir.value, sekcija_id: f.sekcija.value || null, naziv: f.naziv.value.trim(), datum: f.datum.value,
        napomena: f.napomena.value.trim() || null, organizator_id: me().id,
      }).select('*'));
      $('lov-novi').hidden = true;
      await refresh();
      await openEditor(rows[0].id);
    } catch (err) {
      $('lovovi-status').textContent = `Server odbio: ${err.message}`;
    }
  });

  const run = async (fn, ok) => {
    $('lov-uredi-status').textContent = 'Šaljem…';
    try {
      await fn();
      $('lov-uredi-status').textContent = '';
      if (ok) toast(ok);
      await downloadHunts();
      await openEditor(editing);
      if (shown?.id === editing) await showSchedule(editing).then(() => { list.hidden = true; });
    } catch (err) {
      $('lov-uredi-status').textContent = `Nije uspjelo (potreban je internet): ${err.message}`;
    }
  };

  const openEditor = async (id) => {
    editing = id;
    const x = await idbGet(STORE, id);
    const members = loadJSON('lovac.clanovi', []);
    $('lov-uredi-naslov').textContent = `${x.lov.naziv} (${x.lov.datum})`;
    $('lov-uredi-stanje').textContent = `Status: ${STATUS[x.lov.status]}`;
    $('btn-lov-pokreni').hidden = x.lov.status !== 'planiran';
    $('btn-lov-zavrsi').hidden = x.lov.status !== 'u_toku';
    $('lov-upozorenja').innerHTML = standWarnings(x.stanovi).map((w) => `<li>${escapeHtml(w)}</li>`).join('');
    $('lov-ucesnici').innerHTML = x.ucesnici.map((u) => `<li class="trag-red" data-id="${escapeHtml(u.korisnik_id)}">
      <b>${escapeHtml(memberName(u.korisnik_id))}</b> <span class="sitno">${ULOGE[u.uloga]}</span>
      <button type="button" class="dugme" data-akcija="ukloni-ucesnika">Ukloni</button></li>`).join('') || '<li class="sitno">Nema učesnika.</li>';
    const notIn = members.filter((m) => !x.ucesnici.some((u) => u.korisnik_id === m.id));
    const ranked = rankByActivity(notIn.map((m) => m.id), await idbAll(STORE), memberName);
    $('lov-dodaj-clan').innerHTML = ranked.map((r) => `<label class="lov-dodaj-red"><input type="checkbox" value="${escapeHtml(r.id)}"> <span>${escapeHtml(memberName(r.id))}</span> <span class="sitno">${r.broj ? `${r.broj} ${r.broj === 1 ? 'lov' : 'lovova'}` : 'bez lovova'}</span></label>`).join('') || '<p class="sitno">Svi članovi su već u lovu.</p>';
    const opts = (sel) => `<option value="">— niko —</option>${x.ucesnici.filter((u) => u.uloga !== 'pogonic')
      .map((u) => `<option value="${escapeHtml(u.korisnik_id)}" ${u.korisnik_id === sel ? 'selected' : ''}>${escapeHtml(memberName(u.korisnik_id))}</option>`).join('')}`;
    $('lov-stanovi').innerHTML = x.stanovi.sort((a, b) => a.broj - b.broj).map((s) => `<li class="trag-red" data-id="${escapeHtml(s.id)}">
      <b>Stan ${s.broj}</b> <select data-akcija="dodijeli" aria-label="Strijelac na stanu ${s.broj}">${opts(s.korisnik_id)}</select>
      <div class="sitno">${x.sektori.filter((k) => k.stan_id === s.id).map((k) => `${escapeHtml(k.razlog)} ${Math.round(k.od_azimut)}°–${Math.round(k.do_azimut)}°`).join('; ') || 'Nema ručnih sektora'}</div>
      <div class="red-dugmadi">
        <input name="od" inputmode="numeric" placeholder="od °" aria-label="Od azimuta">
        <input name="do" inputmode="numeric" placeholder="do °" aria-label="Do azimuta">
        <input name="razlog" placeholder="razlog (put, kuća…)" aria-label="Razlog">
        <button type="button" class="dugme" data-akcija="sektor">Dodaj zabranjen pravac</button>
        <button type="button" class="dugme" data-akcija="ukloni-stan">Ukloni stan</button>
      </div></li>`).join('') || '<li class="sitno">Nema stanova.</li>';
    $('lov-uredi-status').textContent = '';
    list.hidden = true;
    editor.hidden = false;
  };

  $('btn-lov-dodaj-clan').addEventListener('click', () => {
    const ids = [...$('lov-dodaj-clan').querySelectorAll('input:checked')].map((i) => i.value);
    if (!ids.length) { toast('Označi bar jednog lovca'); return; }
    const uloga = $('lov-dodaj-uloga').value;
    run(() => q(getClient().from('lov_ucesnici').insert(ids.map((korisnik_id) => ({ lov_id: editing, korisnik_id, uloga })))), ids.length > 1 ? `Dodano učesnika: ${ids.length}` : 'Učesnik dodan');
  });
  $('lov-ucesnici').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="ukloni-ucesnika"]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    run(() => q(getClient().from('lov_ucesnici').delete().eq('lov_id', editing).eq('korisnik_id', id)), 'Učesnik uklonjen');
  });
  $('lov-stanovi').addEventListener('change', (e) => {
    if (e.target.dataset.akcija !== 'dodijeli') return;
    const id = e.target.closest('[data-id]').dataset.id;
    run(() => q(getClient().from('stanovi').update({ korisnik_id: e.target.value || null }).eq('id', id)), 'Stan dodijeljen');
  });
  $('lov-stanovi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija]');
    if (!b || b.tagName !== 'BUTTON') return;
    const row = b.closest('[data-id]');
    const id = row.dataset.id;
    if (b.dataset.akcija === 'ukloni-stan') run(() => q(getClient().from('stanovi').delete().eq('id', id)), 'Stan uklonjen');
    if (b.dataset.akcija === 'sektor') {
      const od = Number(row.querySelector('[name=od]').value);
      const doA = Number(row.querySelector('[name=do]').value);
      const razlog = row.querySelector('[name=razlog]').value.trim();
      if (!Number.isFinite(od) || !Number.isFinite(doA) || od < 0 || od >= 360 || doA < 0 || doA > 360 || !razlog) {
        $('lov-uredi-status').textContent = 'Zabranjen pravac: od i do u stepenima (0–360, u smjeru kazaljke) i razlog';
        return;
      }
      run(() => q(getClient().from('sektori').insert({ stan_id: id, od_azimut: od, do_azimut: doA, razlog })), 'Zabranjen pravac dodan');
    }
  });

  // Postavljanje stana: editor se skloni, lovac pomjeri kartu, nišan označi mjesto.
  $('btn-lov-dodaj-stan').addEventListener('click', () => {
    editor.hidden = true;
    placing = true;
    $('lov-postavi').hidden = false;
  });
  $('btn-lov-postavi-odustani').addEventListener('click', () => { placing = false; $('lov-postavi').hidden = true; editor.hidden = false; });
  $('btn-lov-postavi').addEventListener('click', async () => {
    const x = await idbGet(STORE, editing);
    const c = map.getCenter();
    placing = false;
    $('lov-postavi').hidden = true;
    await run(() => q(getClient().from('stanovi').insert({ lov_id: editing, broj: nextStandNumber(x.stanovi), lat: c.lat, lon: c.lng })), 'Stan postavljen');
  });
  $('btn-lov-pokreni').addEventListener('click', () => run(() => q(getClient().from('lovovi').update({ status: 'u_toku' }).eq('id', editing)), 'Lov je pokrenut'));
  wireTwoTap($('btn-lov-zavrsi'), 'Dodirni ponovo za kraj lova', () => run(() => q(getClient().from('lovovi').update({ status: 'zavrsen' }).eq('id', editing)), 'Lov je završen'));
  $('btn-lov-uredi-zatvori').addEventListener('click', () => { editor.hidden = true; list.hidden = false; renderList(); });
  $('btn-lov-uredi-karta').addEventListener('click', () => showSchedule(editing).then(() => { editor.hidden = true; }));

  // ---------------- reviri i vođe (admin) ----------------
  const renderReviri = async () => {
    const sb = getClient();
    try {
      const reviri = await q(sb.from('reviri').select('*'));
      const vodje = await q(sb.from('revir_vodje').select('*'));
      const members = loadJSON('lovac.clanovi', []);
      $('reviri-spisak').innerHTML = reviri.map((r) => `<li class="trag-red" data-id="${escapeHtml(r.id)}"><b>${escapeHtml(r.naziv)}</b>
        <span class="sitno">Vođe: ${vodje.filter((v) => v.revir_id === r.id).map((v) => escapeHtml(memberName(v.korisnik_id))).join(', ') || 'nema'}</span>
        <div class="red-dugmadi"><select data-akcija="vodja">${members.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(memberName(m.id))}</option>`).join('')}</select>
        <button type="button" class="dugme" data-akcija="postavi-vodju">Postavi za vođu</button>
        <button type="button" class="dugme" data-akcija="ukloni-vodju">Ukloni vođu</button></div></li>`).join('') || '<li class="sitno">Nema revira.</li>';
    } catch (err) {
      $('reviri-status').textContent = `Nema veze sa serverom (${err.message})`;
    }
  };
  $('btn-lov-reviri').addEventListener('click', async () => { $('reviri').hidden = false; await renderReviri(); });
  $('btn-reviri-zatvori').addEventListener('click', () => { $('reviri').hidden = true; });
  $('btn-revir-dodaj').addEventListener('click', async () => {
    const naziv = $('revir-novi').value.trim();
    if (!naziv) return;
    try { await q(getClient().from('reviri').insert({ naziv })); $('revir-novi').value = ''; } catch (err) { $('reviri-status').textContent = err.message; }
    await renderReviri();
  });
  $('reviri-spisak').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-akcija]');
    if (!b) return;
    const row = b.closest('[data-id]');
    const kid = row.querySelector('[data-akcija="vodja"]').value;
    try {
      if (b.dataset.akcija === 'postavi-vodju') await q(getClient().from('revir_vodje').insert({ revir_id: row.dataset.id, korisnik_id: kid }));
      if (b.dataset.akcija === 'ukloni-vodju') await q(getClient().from('revir_vodje').delete().eq('revir_id', row.dataset.id).eq('korisnik_id', kid));
    } catch (err) { $('reviri-status').textContent = err.message; }
    await renderReviri();
  });

  registerBackHandler(() => {
    if (!$('reviri').hidden) { $('reviri').hidden = true; return true; }
    if (!$('lov-novi').hidden) { $('lov-novi').hidden = true; return true; }
    if (placing) { $('btn-lov-postavi-odustani').click(); return true; }
    if (!editor.hidden) { editor.hidden = true; return true; }
    if (!list.hidden) { list.hidden = true; return true; }
    return false;
  });

  document.addEventListener('lov:otvori', (e) => showSchedule(e.detail.id).then(() => { list.hidden = true; }).catch((err) => console.warn('lov', err)));

  return { showSchedule, current: () => shown };
}
