// "Prijavi lovočuvaru": forma iz ploče "+", izlazna kutija (radi bez interneta), ekran prijava (lovočuvar obrađuje,
// lovac vidi status svojih), obavijest dok je app otvorena i markeri neriješenih dojava na karti (samo lovočuvar).
import { getClient, cachedProfile } from './auth.js';
import { cachedSekcije } from './sekcije-ui.js';
import { idbGet, idbPut } from './db.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { uuid } from './zapisi.js';
import { resizeToDataUrl } from './foto.js';
import { memberName } from './dijeljenje-ui.js';
import { fetchNew, nextCursor } from './inkrement.js';
import { isPolicyRejection } from './sync.js';
import { openImageViewer } from './slika-pregled.js';
import { rangeLabel } from './istrazivac.js';
import { formatMessageTime } from './poruke.js';
import {
  DOJAVA_VRSTE, DOJAVA_STATUS, vrstaNaziv, validateDojava, newDojava, defaultRevir, keeperRevirs, sortForKeeper, mergeDojave, dojavaAlerts,
} from './dojave.js';
import { toast, escapeHtml, registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);
const KES = 'dojave';
const RED = 'dojave-red';
const POLL_MS = 60000;
const MAX_SLIKA = 400000;

export function initDojave(L, map) {
  const sheet = $('dojava-forma');
  const form = $('forma-dojava');
  const screen = $('dojave');
  if (!sheet || !screen) return;
  const layer = L.layerGroup().addTo(map);
  let rows = [];
  let kursor = null;
  let ctx = { reviri: [], sekcije: [], clanovi: [], lovocuvari: [] };
  let draft = null;
  let filter = null;
  let tempMarker = null;
  let busy = false;
  const odgovori = new Map(); // upisan, još nesačuvan odgovor: spisak se ponovo crta dok lovočuvar kuca
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());
  const revirs = () => keeperRevirs(ctx, me());
  const isKeeper = () => revirs().length > 0;
  const revirNaziv = (id) => ctx.reviri.find((r) => r.id === id)?.naziv || '';

  const loadLocal = async () => {
    const c = await idbGet('arhiva', KES).catch(() => null);
    rows = c?.rows || [];
    kursor = c?.kursor || null;
    ctx = await cachedSekcije().catch(() => ctx);
  };
  const saveLocal = () => idbPut('arhiva', { id: KES, rows, kursor });
  const outbox = async () => (await idbGet('arhiva', RED).catch(() => null))?.rows || [];

  // ---------- forma ----------
  const setPos = (p, izvor) => {
    if (!draft || !p) return;
    draft.lat = p.lat;
    draft.lon = p.lon;
    draft.izvor = izvor;
    $('dojava-pozicija').textContent = `${izvor}: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
  };
  const renderVrste = () => {
    $('dojava-vrste').innerHTML = DOJAVA_VRSTE.map((v) => `<button type="button" data-vrsta="${v.kod}" aria-pressed="${draft?.vrsta === v.kod}">
      <b>${escapeHtml(v.naziv)}</b><small>${escapeHtml(v.opis)}</small></button>`).join('');
  };
  const openForm = async () => {
    await loadLocal();
    $('meni-dodaj').hidden = true;
    draft = { vrsta: null, slika: null };
    form.reset();
    renderVrste();
    const def = defaultRevir(ctx, me()?.id);
    $('dojava-revir').innerHTML = (def ? '' : '<option value="">— izaberi revir —</option>')
      + ctx.reviri.map((r) => `<option value="${escapeHtml(r.id)}" ${r.id === def ? 'selected' : ''}>${escapeHtml(r.naziv)}</option>`).join('');
    const fix = currentFix();
    if (fix) setPos(fix, `GPS ±${Math.round(fix.acc || 0)} m`);
    else setPos(map.getCenter() && { lat: map.getCenter().lat, lon: map.getCenter().lng }, 'Nišan karte');
    $('dojava-slika-pregled').innerHTML = '';
    $('dojava-status').textContent = '';
    sheet.hidden = false;
  };
  const closeForm = () => { sheet.hidden = true; draft = null; };

  $('dojava-vrste').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vrsta]');
    if (!b || !draft) return;
    draft.vrsta = b.dataset.vrsta;
    renderVrste();
  });
  $('btn-dojava-gps').addEventListener('click', () => {
    const fix = currentFix();
    if (fix) setPos(fix, `GPS ±${Math.round(fix.acc || 0)} m`); else toast('GPS još nema poziciju');
  });
  $('btn-dojava-nisan').addEventListener('click', () => { const c = map.getCenter(); setPos({ lat: c.lat, lon: c.lng }, 'Nišan karte'); });
  // polje za sliku je statično (forma se ne crta ponovo)
  $('dojava-slika-ulaz').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !draft) return;
    try {
      let s = await resizeToDataUrl(file, 800, 0.6);
      if (s.length > MAX_SLIKA) s = await resizeToDataUrl(file, 560, 0.5);
      draft.slika = s.length > MAX_SLIKA ? null : s;
      $('dojava-slika-pregled').innerHTML = draft.slika ? `<img src="${escapeHtml(draft.slika)}" alt="Slika uz dojavu">` : '<p class="sitno">Slika je prevelika.</p>';
    } catch (err) {
      $('dojava-status').textContent = `Slika nije dodana: ${err.message}`;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!draft || !me()) return;
    const err = validateDojava({ vrsta: draft.vrsta, revir_id: $('dojava-revir').value, lat: draft.lat, lon: draft.lon });
    if (err) { $('dojava-status').textContent = err; return; }
    const d = newDojava({ id: uuid(), autorId: me().id, vrsta: draft.vrsta, revirId: $('dojava-revir').value, opis: form.opis.value,
      lat: draft.lat, lon: draft.lon, slika: draft.slika });
    try {
      // kritičan upis: ako ne uspije, forma ostaje otvorena sa porukom
      await idbPut('arhiva', { id: RED, rows: [...await outbox(), d] });
      rows = [...rows.filter((x) => x.id !== d.id), d];
      await saveLocal();
    } catch (er) {
      $('dojava-status').textContent = `Dojava nije sačuvana: ${er.message}`;
      return;
    }
    closeForm();
    const sent = await flush();
    toast(sent ? 'Dojava je poslana lovočuvaru' : 'Dojava je sačuvana i šalje se čim bude interneta', 5000);
    render();
  });
  $('btn-dojava-odustani').addEventListener('click', closeForm);
  $('btn-dojava-zatvori').addEventListener('click', closeForm);
  $('btn-dodaj-dojavu').addEventListener('click', openForm);

  // ---------- slanje i preuzimanje ----------
  async function flush() {
    if (!online()) return false;
    let left = await outbox();
    let sent = false;
    for (const d of [...left]) {
      const { sinhronizovano, ...row } = d;
      void sinhronizovano;
      const { error } = await getClient().from('dojave').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
      if (error) {
        if (!isPolicyRejection(error)) break; // mreža: ostaje u redu
        toast('Server nije prihvatio dojavu (nalog bez odobrenja?)');
      } else {
        sent = true;
        rows = rows.map((x) => (x.id === d.id ? { ...x, sinhronizovano: true } : x));
      }
      left = left.filter((x) => x.id !== d.id);
    }
    await idbPut('arhiva', { id: RED, rows: left }).catch(() => {});
    await saveLocal().catch(() => {});
    return sent;
  }
  const pull = async () => {
    if (!online()) return;
    try {
      const fresh = await fetchNew(() => getClient().from('dojave').select('*'), kursor, { initial: 200 });
      const prev = rows;
      rows = mergeDojave(rows, fresh);
      kursor = nextCursor(fresh, kursor);
      await saveLocal();
      if (prev.length || kursor) notify(dojavaAlerts(prev, rows, { myId: me()?.id, revirs: revirs() }));
    } catch (err) {
      console.warn('dojave', err.message);
    }
  };
  const notify = (list) => {
    for (const d of list.slice(0, 3)) {
      const mine = d.autor_id === me()?.id;
      const title = mine ? `Tvoja dojava: ${DOJAVA_STATUS[d.status]}` : `Nova dojava: ${vrstaNaziv(d.vrsta)}`;
      const text = mine ? (d.odgovor || vrstaNaziv(d.vrsta)) : `${memberName(d.autor_id)} · ${revirNaziv(d.revir_id)}${d.opis ? ` · ${d.opis}` : ''}`;
      toast(`${title} — ${text}`, 6000);
      if (globalThis.AndroidNotif?.poruka) globalThis.AndroidNotif.poruka(title, text, list.length);
      else globalThis.AndroidNotif?.prikazi?.(title, text);
    }
  };
  const tick = async () => {
    if (busy || !me()?.id) return;
    busy = true;
    try {
      await loadLocal();
      await flush();
      await pull();
      render();
    } finally {
      busy = false;
    }
  };

  // ---------- ekran ----------
  const visibleRows = () => {
    const mine = rows.filter((d) => d.autor_id === me()?.id);
    if (!isKeeper()) return { list: mine.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), mode: 'moje' };
    const f = filter || 'otvorene';
    const revir = rows.filter((d) => revirs().includes(d.revir_id));
    const list = f === 'otvorene' ? revir.filter((d) => d.status !== 'rijesena') : f === 'moje' ? mine : revir;
    return { list: sortForKeeper(list), mode: f };
  };
  const cardHtml = (d) => {
    const keeper = isKeeper() && revirs().includes(d.revir_id);
    const fix = currentFix();
    const dist = fix && Number.isFinite(d.lat) ? ` · ${rangeLabel(fix, { lat: d.lat, lon: d.lon })} od tebe` : '';
    return `<li class="tr-kartica ev-kartica dojava-kartica" data-id="${escapeHtml(d.id)}" data-status="${escapeHtml(d.status)}" data-vrsta="${escapeHtml(d.vrsta)}">
      <div class="dojava-glava"><span class="dojava-ikona"><svg class="ic"><use href="#ic-stit"/></svg></span>
        <span class="dojava-naslov"><b>${escapeHtml(vrstaNaziv(d.vrsta))}</b>
          <span class="sitno">${escapeHtml(formatMessageTime(d.created_at))} · Revir ${escapeHtml(revirNaziv(d.revir_id))}${d.autor_id !== me()?.id ? ` · ${escapeHtml(memberName(d.autor_id))}` : ''}${escapeHtml(dist)}</span></span>
        <span class="dojava-status" data-status="${escapeHtml(d.status)}">${d.sinhronizovano === false ? 'čeka slanje' : escapeHtml(DOJAVA_STATUS[d.status] || '')}</span></div>
      ${d.opis ? `<p class="dojava-opis">${escapeHtml(d.opis)}</p>` : ''}
      ${d.slika ? `<button type="button" class="dojava-slika-mala" data-akcija="slika"><img src="${escapeHtml(d.slika)}" alt="Slika uz dojavu"></button>` : ''}
      ${d.odgovor ? `<p class="dojava-odgovor"><b>Lovočuvar:</b> ${escapeHtml(d.odgovor)}${d.rijesio ? ` <span class="sitno">(${escapeHtml(memberName(d.rijesio))})</span>` : ''}</p>` : ''}
      <div class="red-dugmadi">
        <button type="button" class="dugme" data-akcija="karta">Na karti</button>
        ${keeper && d.status === 'nova' ? '<button type="button" class="dugme glavno" data-akcija="preuzmi">Preuzimam</button>' : ''}
        ${keeper && d.status !== 'rijesena' ? '<button type="button" class="dugme" data-akcija="rijesi">Riješeno</button>' : ''}
      </div>
      ${keeper ? `<div class="dojava-odgovor-forma"><input type="text" maxlength="1000" data-odgovor placeholder="Odgovor lovcu (neobavezno)" value="${escapeHtml(odgovori.get(d.id) ?? d.odgovor ?? '')}" aria-label="Odgovor lovcu">
        <button type="button" class="dugme" data-akcija="odgovor">Sačuvaj</button></div>` : ''}
    </li>`;
  };
  function render() {
    const keeper = isKeeper();
    const revirRows = rows.filter((d) => keeper ? revirs().includes(d.revir_id) : d.autor_id === me()?.id);
    $('dojh-nove').textContent = String(revirRows.filter((d) => d.status === 'nova').length);
    $('dojh-preuzete').textContent = String(revirRows.filter((d) => d.status === 'preuzeta').length);
    $('dojh-rijesene').textContent = String(revirRows.filter((d) => d.status === 'rijesena').length);
    const nove = revirRows.filter((d) => d.status === 'nova' && d.autor_id !== me()?.id).length;
    const opis = $('btn-dojave-opis');
    if (opis) opis.textContent = keeper ? (nove ? `${nove} nov${nove === 1 ? 'a dojava' : 'ih dojava'} u reviru` : 'Nema novih dojava')
      : (revirRows.length ? `Moje prijave: ${revirRows.length}` : 'Krivolov, divljač, zamke');
    $('dojave-filter').hidden = !keeper;
    const { list, mode } = visibleRows();
    if (keeper) {
      $('dojave-filter').innerHTML = [['otvorene', 'Otvorene'], ['sve', 'Sve u reviru'], ['moje', 'Moje']]
        .map(([k, n]) => `<button type="button" data-filter="${k}" aria-pressed="${k === mode}">${n}</button>`).join('');
    }
    $('dojave-naslov').textContent = keeper ? 'Dojave lovočuvaru' : 'Moje prijave lovočuvaru';
    if (!screen.hidden) {
      $('dojave-spisak').innerHTML = list.map(cardHtml).join('')
        || `<li class="sitno">${keeper ? 'Nema dojava za ovaj prikaz.' : 'Još nisi slao dojave. "Nova dojava" ili ploča + → Prijavi lovočuvaru.'}</li>`;
    }
    drawMarkers();
  }
  function drawMarkers() {
    layer.clearLayers();
    if (!isKeeper()) return;
    for (const d of rows.filter((x) => revirs().includes(x.revir_id) && x.status !== 'rijesena' && Number.isFinite(x.lat))) {
      const icon = L.divIcon({ className: 'dojava-marker-wrap', html: `<span class="dojava-marker" data-status="${escapeHtml(d.status)}"><svg class="ic"><use href="#ic-stit"/></svg></span>`, iconSize: [36, 36], iconAnchor: [18, 18] });
      L.marker([d.lat, d.lon], { icon, keyboard: false })
        .bindPopup(`<b>${escapeHtml(vrstaNaziv(d.vrsta))}</b><br>${escapeHtml(DOJAVA_STATUS[d.status])} · ${escapeHtml(memberName(d.autor_id))}${d.opis ? `<br>${escapeHtml(d.opis)}` : ''}`)
        .addTo(layer);
    }
  }

  const update = async (id, patch, ok) => {
    if (!online()) { toast('Za obradu dojave potreban je internet'); return; }
    const { error } = await getClient().from('dojave').update(patch).eq('id', id);
    if (error) { toast(`Nije sačuvano: ${error.message}`); return; }
    rows = rows.map((d) => (d.id === id ? { ...d, ...patch, rijesio: me().id } : d));
    await saveLocal().catch(() => {});
    toast(ok);
    render();
  };
  $('dojave-spisak').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-akcija]');
    const card = e.target.closest('[data-id]');
    if (!b || !card) return;
    const d = rows.find((x) => x.id === card.dataset.id);
    if (!d) return;
    const a = b.dataset.akcija;
    if (a === 'slika') { openImageViewer({ src: d.slika, caption: `${vrstaNaziv(d.vrsta)} · ${formatMessageTime(d.created_at)}` }); return; }
    if (a === 'karta') {
      closeDojave();
      if (tempMarker) map.removeLayer(tempMarker);
      tempMarker = L.circleMarker([d.lat, d.lon], { radius: 14, color: '#dc2626', weight: 3, fillOpacity: 0.15 }).addTo(map);
      map.setView([d.lat, d.lon], Math.max(map.getZoom(), 16), { animate: false });
      setTimeout(() => { if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; } }, 60000);
      return;
    }
    const odgovor = (odgovori.get(d.id) ?? card.querySelector('[data-odgovor]')?.value ?? '').trim() || null;
    odgovori.delete(d.id);
    if (a === 'preuzmi') await update(d.id, { status: 'preuzeta', odgovor }, 'Dojava je preuzeta');
    if (a === 'rijesi') await update(d.id, { status: 'rijesena', odgovor }, 'Dojava je riješena');
    if (a === 'odgovor') await update(d.id, { odgovor }, 'Odgovor je sačuvan');
  });
  $('dojave-spisak').addEventListener('input', (e) => {
    const card = e.target.closest('[data-id]');
    if (card && e.target.matches('[data-odgovor]')) odgovori.set(card.dataset.id, e.target.value);
  });
  $('dojave-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (b) { filter = b.dataset.filter; render(); }
  });
  const open = async () => {
    $('meni-spiskovi').hidden = true;
    await loadLocal();
    screen.hidden = false;
    render();
    tick();
  };
  function closeDojave() { screen.hidden = true; }
  $('btn-dojave').addEventListener('click', open);
  $('btn-dojave-zatvori').addEventListener('click', closeDojave);
  $('btn-dojave-nova').addEventListener('click', () => { closeDojave(); openForm(); });
  registerBackHandler(() => {
    if (!sheet.hidden) { closeForm(); return true; }
    if (!screen.hidden) { closeDojave(); return true; }
    return false;
  });
  document.addEventListener('sekcije:promjena', () => loadLocal().then(render));
  loadLocal().then(render);
  setInterval(tick, POLL_MS);
  setTimeout(tick, 6000);
}
