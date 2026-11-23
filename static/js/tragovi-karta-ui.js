// Moji tragovi u "Granice lovišta": prikaz više tragova na karti (klikabilni), redoslijed po blizini sredine karte,
// stil linije (boja, debljina, vrsta) i brisanje. Stil i izbor su lokalni (prikaz), ne mijenjaju zapis traga.
import { allTracks, deleteTrack } from './snimanje.js';
import { trackDistance, formatDistance } from './trag.js';
import { BOJE_TRAGA, DEBLJINE_TRAGA, LINIJE_TRAGA, normalizeStyle, polylineStyle, orderTracks, distanceLabel } from './tragovi-karta.js';
import { gateLayer } from './razmjer-prikaz.js';
import { loadJSON, saveSoft } from './storage.js';
import { toast, escapeHtml, wireTwoTap } from './ui.js';

const $ = (id) => document.getElementById(id);
const PRIKAZ_KEY = 'lovac.tragovi.prikazani';
const STIL_KEY = 'lovac.tragovi.stil';
const PO_STRANI = 15;

const dateText = (t) => { const d = new Date(t); return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}.`; };

export function initTragoviKarta(L, map) {
  const list = $('sl-tragovi');
  if (!list) return;
  const layer = L.layerGroup();
  gateLayer(map, layer, 'tragovi');
  let tracks = [];
  let order = 'blizi';
  let limit = PO_STRANI;
  let openStyle = null;

  const shown = () => new Set(loadJSON(PRIKAZ_KEY, []));
  const styles = () => loadJSON(STIL_KEY, {}) || {};
  const styleOf = (id) => normalizeStyle(styles()[id]);
  const setShown = (id, on) => {
    const s = shown();
    if (on) s.add(id); else s.delete(id);
    saveSoft(PRIKAZ_KEY, [...s]);
  };

  const popupFor = (t) => {
    const el = document.createElement('div');
    el.className = 'tr-popup';
    el.dataset.id = t.id;
    el.innerHTML = `<b>${escapeHtml(t.naziv || 'Trag')}</b>
      <div class="sitno">${escapeHtml(dateText(t.start))} · ${escapeHtml(formatDistance(trackDistance(t.tacke || [])))}${t.vrsta === 'potraga' ? ' · potraga' : ''}</div>
      <div class="red-dugmadi"><button type="button" class="dugme" data-akcija="stil">Stil linije</button>
      <button type="button" class="dugme" data-akcija="sakrij">Sakrij</button>
      ${t.tudji ? '' : '<button type="button" class="dugme" data-akcija="obrisi">Obriši</button>'}</div>`;
    el.querySelector('[data-akcija="stil"]').addEventListener('click', () => { map.closePopup(); openStyleFor(t.id); });
    el.querySelector('[data-akcija="sakrij"]').addEventListener('click', () => { map.closePopup(); setShown(t.id, false); draw(); });
    const del = el.querySelector('[data-akcija="obrisi"]');
    if (del) wireTwoTap(del, 'Dodirni ponovo za brisanje', async () => { map.closePopup(); await remove(t.id); });
    return el;
  };

  const draw = () => {
    layer.clearLayers();
    const on = shown();
    for (const t of tracks.filter((x) => on.has(x.id))) {
      const pts = (t.tacke || []).filter((p) => Number.isFinite(p.lat)).map((p) => [p.lat, p.lon]);
      if (pts.length < 2) continue;
      const st = styleOf(t.id);
      if (st.boja === '#ffffff') L.polyline(pts, { color: '#111827', weight: st.debljina + 2, opacity: 0.6, interactive: false }).addTo(layer);
      L.polyline(pts, { ...polylineStyle(st), interactive: false, className: 'tr-linija' }).addTo(layer);
      // Široka nevidljiva linija: tanka linija se na dodirnom ekranu teško pogodi prstom.
      L.polyline(pts, { color: '#000000', opacity: 0, weight: 22, className: 'tr-dodir' })
        .bindPopup(() => popupFor(t), { minWidth: 220, autoPanPaddingTopLeft: [12, 140] }).addTo(layer);
    }
  };

  const styleEditor = (id) => {
    const st = styleOf(id);
    return `<div class="tr-stil" data-stil-za="${escapeHtml(id)}">
      <div class="tr-boje" role="group" aria-label="Boja linije">${BOJE_TRAGA.map((b) => `<button type="button" class="tr-boja" data-boja="${b}" style="--b:${b}" aria-label="Boja ${b}" aria-pressed="${st.boja === b}"></button>`).join('')}</div>
      <div class="segment" role="group" aria-label="Debljina linije">${DEBLJINE_TRAGA.map((w) => `<button type="button" data-debljina="${w}" aria-pressed="${st.debljina === w}">${w === 2 ? 'Tanka' : w === 4 ? 'Srednja' : 'Debela'}</button>`).join('')}</div>
      <div class="segment" role="group" aria-label="Vrsta linije">${Object.entries(LINIJE_TRAGA).map(([k, v]) => `<button type="button" data-linija="${k}" aria-pressed="${st.linija === k}">${v.naziv}</button>`).join('')}</div>
    </div>`;
  };

  const render = () => {
    const center = map.getCenter();
    const rows = orderTracks(tracks, { lat: center.lat, lon: center.lng }, order);
    const on = shown();
    $('sl-tragovi-broj').textContent = tracks.length ? `(${tracks.length}, na karti ${tracks.filter((t) => on.has(t.id)).length})` : '';
    $('sl-tragovi-prazno').hidden = tracks.length > 0;
    $('sl-tragovi-red').querySelectorAll('[data-red]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.red === order)));
    list.innerHTML = rows.slice(0, limit).map(({ t, d }) => `<li class="trag-red tr-kartica" data-id="${escapeHtml(t.id)}">
      <div class="trag-naslov"><b>${escapeHtml(t.naziv || 'Trag')}</b>
        <span class="sitno">${escapeHtml(dateText(t.start))} · ${escapeHtml(formatDistance(trackDistance(t.tacke || [])))} · ${escapeHtml(distanceLabel(d))}</span></div>
      <span class="tr-uzorak" style="--b:${styleOf(t.id).boja}" data-linija="${styleOf(t.id).linija}" aria-hidden="true"></span>
      <div class="tr-dugmad">
        <button type="button" class="dugme" data-akcija="tr-prikazi" aria-pressed="${on.has(t.id)}">${on.has(t.id) ? 'Na karti ✓' : 'Na karti'}</button>
        <button type="button" class="dugme" data-akcija="tr-stil" aria-expanded="${openStyle === t.id}">Stil</button>
        <button type="button" class="dugme" data-akcija="tr-idi">Pokaži</button>
        ${t.tudji ? '' : '<button type="button" class="dugme" data-akcija="tr-obrisi">Obriši</button>'}
      </div>
      ${openStyle === t.id ? styleEditor(t.id) : ''}
    </li>`).join('');
    $('btn-sl-tragovi-jos').hidden = rows.length <= limit;
    list.querySelectorAll('[data-akcija="tr-obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', () => remove(b.closest('[data-id]').dataset.id));
    });
  };

  const remove = async (id) => {
    try {
      await deleteTrack(id);
      setShown(id, false);
      const st = styles(); delete st[id]; saveSoft(STIL_KEY, st);
      await reload();
      toast('Trag obrisan');
    } catch (err) {
      toast(`Brisanje nije uspjelo: ${err?.message || err}`);
    }
  };

  const reload = async () => {
    tracks = (await allTracks()).filter((t) => t.status === 'gotovo' || t.vrsta === 'potraga');
    const ids = new Set(tracks.map((t) => t.id));
    const on = [...shown()].filter((id) => ids.has(id));
    saveSoft(PRIKAZ_KEY, on);
    draw();
    render();
  };

  const openStyleFor = (id) => {
    openStyle = id;
    if ($('slojevi').hidden) $('btn-slojevi').click();
    render();
    list.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
  };

  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const t = tracks.find((x) => x.id === id);
    const b = e.target.closest('button');
    if (!b || !t) return;
    const patch = b.dataset.boja ? { boja: b.dataset.boja } : b.dataset.debljina ? { debljina: Number(b.dataset.debljina) } : b.dataset.linija ? { linija: b.dataset.linija } : null;
    if (patch) {
      saveSoft(STIL_KEY, { ...styles(), [id]: normalizeStyle({ ...styleOf(id), ...patch }) });
      setShown(id, true);
      draw(); render();
      return;
    }
    switch (b.dataset.akcija) {
      case 'tr-prikazi': setShown(id, !shown().has(id)); draw(); render(); break;
      case 'tr-stil': openStyle = openStyle === id ? null : id; render(); break;
      case 'tr-idi': {
        const pts = (t.tacke || []).filter((p) => Number.isFinite(p.lat)).map((p) => [p.lat, p.lon]);
        if (!pts.length) return;
        setShown(id, true); draw();
        $('slojevi').hidden = true;
        map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
        break;
      }
      default:
    }
  });
  $('sl-tragovi-red').addEventListener('click', (e) => {
    const b = e.target.closest('[data-red]');
    if (b) { order = b.dataset.red; limit = PO_STRANI; render(); }
  });
  $('btn-sl-tragovi-jos').addEventListener('click', () => { limit += PO_STRANI; render(); });
  $('btn-slojevi').addEventListener('click', () => { limit = PO_STRANI; reload(); });
  document.addEventListener('tragovi:promjena', () => reload());
  reload().catch((err) => console.warn('tragovi na karti', err));
}
