// UI snimanja: panel na karti, živa linija, spisak tragova, oporavak nakon pada i izvoz.

import { addWaypoint,
  startRecording, pauseRecording, resumeRecording, stopRecording, onRecordingChange, activeRecordings,
  allTracks, unfinishedTracks, continueRecovered, finishRecovered, deleteTrack, setSmoothed,
} from './snimanje.js';
import {
  movingTime, trackDistance, formatDistance, formatDuration, smoothPoints, toGpx, toKml, trackFileName, MIN_TRACK_M,
} from './trag.js';
import { matchesQuery } from './pretraga.js';
import { routePath, trackStats, PERIODI, SORTIRANJA, filterPeriod, sortTracks, groupByMonth, lastDaysKm } from './tragovi-pregled.js';
import { formatDecimalBs } from './odstrel.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import { shareFile } from './dijeljenje.js';
import { shareDialog, memberName } from './dijeljenje-ui.js';
import { VIDLJIVOST, listRecords } from './zapisi.js';
import { currentFix } from './gps.js';
import { startNavigation } from './navigacija.js';
import { nearestReturnTargets, trackWaypoints } from './trag.js';
import { addBloodMark } from './snimanje.js';

const LIVE_STYLE = { color: '#ff5a1f', weight: 4, opacity: 0.9, interactive: false };
const SHOWN_STYLE = { color: '#2f7dff', weight: 4, opacity: 0.85, interactive: false };

const $ = (id) => document.getElementById(id);

function statusText(tr) {
  if (tr.status === 'snima') return 'Snima';
  const p = tr.pauze.find((x) => x.do == null);
  return p?.auto ? 'Auto-pauza (stojiš)' : 'Pauza';
}

function pointsForDisplay(tr) {
  return tr.uglacan ? smoothPoints(tr.tacke) : tr.tacke;
}

function trackSummary(tr) {
  const d = new Date(tr.start);
  const datum = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}.`;
  return `${datum} · ${formatDistance(trackDistance(tr.tacke))} · ${formatDuration(movingTime(tr))}`;
}

export function initTragovi(L, map) {
  const live = new Map();
  let shown = null;

  const panel = $('panel-snimanje');
  const btnRec = $('btn-snimaj');
  const btnPause = $('btn-snim-pauza');
  const list = $('tragovi');
  const recovery = $('oporavak');

  // Potraga ima prednost u panelu (može teći paralelno sa obilaskom).
  const current = () => { const r = activeRecordings(); return r.find((x) => x.vrsta === 'potraga') || r[0] || null; };
  const marks = L.layerGroup().addTo(map);
  const drawMarks = (tr, group = marks) => {
    group.clearLayers();
    const icon = (cls, title) => L.divIcon({ className: `oznaka ${cls}`, html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
    if (tr?.nastrijel) L.marker([tr.nastrijel.lat, tr.nastrijel.lon], { icon: icon('oznaka-nastrijel'), interactive: false }).addTo(group);
    for (const k of tr?.krv || []) L.marker([k.lat, k.lon], { icon: icon('oznaka-krv'), interactive: false }).addTo(group);
    for (const w of tr?.tackeInteresa || []) {
      L.marker([w.lat, w.lon], { icon: icon('oznaka-tacka'), keyboard: false }).bindTooltip(w.naziv, { permanent: false }).addTo(group);
    }
  };

  const renderPanel = (recs) => {
    const tr = current();
    $('potraga-dugmad').hidden = tr?.vrsta !== 'potraga';
    $('snim-vrsta').textContent = tr?.vrsta === 'potraga' ? 'Potraga · ' : '';
    $('snim-krv').textContent = `${tr?.vrsta === 'potraga' ? ` · krv: ${(tr.krv || []).length}` : ''}${(tr?.tackeInteresa || []).length ? ` · tačke: ${tr.tackeInteresa.length}` : ''}`;
    drawMarks(tr);
    btnRec.setAttribute('aria-pressed', String(Boolean(tr)));
    panel.hidden = !tr;
    for (const [id, line] of live) {
      if (!recs.some((r) => r.id === id)) { map.removeLayer(line); live.delete(id); }
    }
    for (const r of recs) {
      const latlngs = r.tacke.map((p) => [p.lat, p.lon]);
      if (live.has(r.id)) live.get(r.id).setLatLngs(latlngs);
      else live.set(r.id, L.polyline(latlngs, LIVE_STYLE).addTo(map));
    }
    if (!tr) return;
    $('snim-status').textContent = statusText(tr);
    $('snim-vrijeme').textContent = formatDuration(movingTime(tr));
    $('snim-duzina').textContent = formatDistance(trackDistance(tr.tacke));
    $('snim-tacke').textContent = String(tr.tacke.length);
    btnPause.textContent = tr.status === 'snima' ? 'Pauza' : 'Nastavi';
    panel.dataset.status = tr.status;
  };

  onRecordingChange(renderPanel);
  setInterval(() => { if (current()) renderPanel(activeRecordings()); }, 1000);

  btnRec.addEventListener('click', async () => {
    if (current()) { toast('Snimanje već traje'); return; }
    try {
      await startRecording();
      toast('Snimanje traga počelo');
    } catch (err) {
      toast(err.message, 5000);
    }
  });

  btnPause.addEventListener('click', async () => {
    const tr = current();
    if (!tr) return;
    if (tr.status === 'snima') await pauseRecording(tr.id);
    else await resumeRecording(tr.id);
  });

  wireTwoTap($('btn-snim-stop'), 'Dodirni ponovo za kraj', async () => {
    const tr = current();
    if (!tr) return;
    const done = await stopRecording(tr.id);
    if (done.odbaceno) { toast(`Trag je kraći od ${MIN_TRACK_M} m (${formatDistance(done.duzina)}) i nije sačuvan`, 5000); return; }
    toast(`Trag sačuvan: ${formatDistance(trackDistance(done.tacke))}`);
  });

  // ---- tačke i slike tokom snimanja ----
  const waypointDialog = $('tacka-dijalog');
  $('btn-snim-tacka').addEventListener('click', () => {
    if (!current()) return;
    if (!currentFix()) { toast('Čekam GPS…'); return; }
    $('tacka-naziv').value = '';
    waypointDialog.hidden = false;
    $('tacka-naziv').focus();
  });
  $('btn-tacka-odustani').addEventListener('click', () => { waypointDialog.hidden = true; });
  $('btn-tacka-sacuvaj').addEventListener('click', async () => {
    const tr = current();
    const f = currentFix();
    waypointDialog.hidden = true;
    if (!tr || !f) return;
    await addWaypoint(tr.id, { lat: f.lat, lon: f.lon, acc: f.acc, naziv: $('tacka-naziv').value });
    toast('Tačka je dodana na trag');
  });
  $('btn-snim-slika').addEventListener('click', () => {
    const tr = current();
    if (tr) document.dispatchEvent(new CustomEvent('slika:nova', { detail: { tragId: tr.id } }));
  });

  // ---- potraga za ranjenom divljači ----
  const potragaStart = $('potraga-start');
  const startSearch = async (point) => {
    potragaStart.hidden = true;
    const d = new Date();
    try {
      await startRecording({
        vrsta: 'potraga',
        naziv: `Potraga ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}. ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        nastrijel: { lat: point.lat, lon: point.lon, t: Date.now() },
      });
      toast('Potraga počela: tačka nastrijela je označena');
    } catch (err) {
      toast(err.message, 5000);
    }
  };
  $('btn-dodaj-potragu').addEventListener('click', () => {
    $('meni-dodaj').hidden = true;
    if (activeRecordings().some((r) => r.vrsta === 'potraga')) { toast('Potraga već traje'); return; }
    $('btn-nastrijel-gps').disabled = !currentFix();
    potragaStart.hidden = false;
  });
  $('btn-nastrijel-gps').addEventListener('click', () => { const f = currentFix(); if (f) startSearch(f); });
  $('btn-nastrijel-nisan').addEventListener('click', () => { const c = map.getCenter(); startSearch({ lat: c.lat, lon: c.lng }); });
  $('btn-nastrijel-odustani').addEventListener('click', () => { potragaStart.hidden = true; });
  $('btn-krv').addEventListener('click', async () => {
    const tr = current();
    const f = currentFix();
    if (!tr || tr.vrsta !== 'potraga') return;
    if (!f) { toast('Čekam GPS…'); return; }
    await addBloodMark(tr.id, { lat: f.lat, lon: f.lon, acc: f.acc });
    toast('Krv označena');
  });
  const nazad = $('meni-nazad');
  $('btn-vodi-nazad').addEventListener('click', async () => {
    const f = currentFix();
    const from = f || { lat: map.getCenter().lat, lon: map.getCenter().lng };
    const targets = nearestReturnTargets(from, await listRecords('objekti'), current());
    $('nazad-spisak').innerHTML = targets.map((t, i) => `<button type="button" class="dugme" data-i="${i}">${escapeHtml(t.naziv)}</button>`).join('')
      || '<p class="sitno">Nema cilja (nema čeke ni auta u objektima).</p>';
    nazad.targets = targets;
    nazad.hidden = false;
  });
  $('nazad-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    nazad.hidden = true;
    startNavigation(nazad.targets[Number(b.dataset.i)]);
  });
  $('btn-nazad-odustani').addEventListener('click', () => { nazad.hidden = true; });
  $('btn-potraga-dijeli').addEventListener('click', async () => {
    const tr = current();
    if (tr) await shareDialog()?.open('tragovi', tr.id);
  });
  registerBackHandler(() => {
    if (!potragaStart.hidden) { potragaStart.hidden = true; return true; }
    if (!nazad.hidden) { nazad.hidden = true; return true; }
    return false;
  });

  // ---- spisak tragova ----
  const shownMarks = L.layerGroup().addTo(map);
  const showTrack = (tr) => {
    if (shown) map.removeLayer(shown);
    drawMarks(tr, shownMarks);
    const pts = pointsForDisplay(tr);
    shown = L.polyline(pts.map((p) => [p.lat, p.lon]), SHOWN_STYLE).addTo(map);
    if (pts.length) map.fitBounds(shown.getBounds(), { padding: [40, 40], maxZoom: 17 });
  };

  let trFilter = { tip: 'svi', q: '', period: 'sve', sort: 'novije' };
  $('tr-period').innerHTML = PERIODI.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  $('tr-sort').innerHTML = SORTIRANJA.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  const DANI = ['N', 'P', 'U', 'S', 'Č', 'P', 'S'];
  const cardHtml = (t) => {
    const st = trackStats(t);
    const vrsta = t.vrsta === 'potraga' ? 'potraga' : 'obilazak';
    const path = routePath(pointsForDisplay(t));
    return `
      <li class="trag-red tr-kartica" data-id="${escapeHtml(t.id)}" data-vrsta="${vrsta}">
        <div class="tr-glava">
          <svg class="tr-mini" viewBox="0 0 96 64" role="img" aria-label="Oblik rute">${path ? `<path d="${path}" />` : ''}</svg>
          <div class="trag-naslov"><span class="tr-chip" data-vrsta="${vrsta}">${vrsta === 'potraga' ? 'Potraga' : 'Obilazak'}${t.tudji ? ' · podijeljen' : ''}</span>
          <b>${escapeHtml(t.naziv)}</b><span class="sitno">${escapeHtml(trackSummary(t))}</span></div>
        </div>
        <div class="tr-brojke">
          <span data-brojka="brzina"><b>${st.brzinaKmh != null ? escapeHtml(formatDecimalBs(st.brzinaKmh)) : '—'}</b> km/h</span>
          <span data-brojka="tacaka"><b>${st.tacaka}</b> tačaka</span>
          <span data-brojka="poi"><b>${st.poi}</b> tačaka interesa</span>
        </div>
        <span class="sitno">${t.tudji ? `Podijelio: ${escapeHtml(memberName(t.vlasnik_id))}` : `Vidljivost: ${escapeHtml(VIDLJIVOST[t.vidljivost || 'privatno'])}`}</span>
        <button type="button" class="dugme glavno tr-glavno" data-akcija="prikazi">Prikaži na karti</button>
        <div class="tr-dugmad">
          <button type="button" class="dugme" data-akcija="uglacaj" aria-pressed="${t.uglacan}">${t.uglacan ? 'Original' : 'Uglačaj'}</button>
          <button type="button" class="dugme" data-akcija="gpx">GPX</button>
          <button type="button" class="dugme" data-akcija="kml">KML</button>
          ${t.tudji ? '' : '<button type="button" class="dugme" data-akcija="dijeli">Dijeli</button><button type="button" class="dugme" data-akcija="obrisi">Obriši</button>'}
        </div>
      </li>`;
  };
  const renderList = async () => {
    const ul = $('tragovi-spisak');
    const all = (await allTracks()).filter((t) => t.status === 'gotovo');
    const tracks = sortTracks(filterPeriod(all.filter((t) => (trFilter.tip === 'svi' || (trFilter.tip === 'potraga') === (t.vrsta === 'potraga'))
      && matchesQuery([t.naziv, new Date(t.start).toLocaleDateString('bs-BA')], trFilter.q)), trFilter.period), trFilter.sort);
    $('tragovi-prazno').hidden = all.length > 0;
    $('tr-stat-broj').textContent = String(all.length);
    $('tr-stat-km').textContent = formatDecimalBs(Math.round(all.reduce((s, t) => s + trackDistance(t.tacke), 0) / 100) / 10);
    $('tr-stat-sati').textContent = formatDecimalBs(Math.round(all.reduce((s, t) => s + movingTime(t), 0) / 360000) / 10);
    const bars = lastDaysKm(all);
    const max = Math.max(0.1, ...bars.map((b) => b.km));
    $('tr-sedmica').innerHTML = bars.map((b, i) => `<div class="tr-stupac${i === bars.length - 1 ? ' danas' : ''}" data-km="${b.km}"><span class="tr-stupac-bar"><i style="height:${Math.round((b.km / max) * 100)}%"></i></span><b>${b.km ? escapeHtml(formatDecimalBs(b.km)) : ''}</b><span class="sitno">${DANI[b.dan]}</span></div>`).join('');
    $('tr-period').value = trFilter.period;
    $('tr-sort').value = trFilter.sort;
    // po mjesecima samo kad je redoslijed po datumu; inače jedna lista
    ul.innerHTML = (trFilter.sort === 'novije'
      ? groupByMonth(tracks).map((g) => `<li class="tr-mjesec" role="presentation"><span>${escapeHtml(g.naziv)}</span><span class="sitno">${g.tracks.length} · ${escapeHtml(formatDecimalBs(Math.round(g.tracks.reduce((s, t) => s + trackDistance(t.tacke), 0) / 100) / 10))} km</span></li>${g.tracks.map(cardHtml).join('')}`).join('')
      : tracks.map(cardHtml).join('')) || '<li class="sitno">Nema tragova za ovaj filter.</li>';
    ul.querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        const id = b.closest('[data-id]').dataset.id;
        await deleteTrack(id);
        await renderList();
        toast('Trag obrisan');
      });
    });
  };

  $('tr-filter').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tip]');
    if (!b) return;
    trFilter = { ...trFilter, tip: b.dataset.tip };
    $('tr-filter').querySelectorAll('[data-tip]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderList();
  });
  $('tr-period').addEventListener('change', (e) => { trFilter = { ...trFilter, period: e.target.value }; renderList(); });
  $('tr-sort').addEventListener('change', (e) => { trFilter = { ...trFilter, sort: e.target.value }; renderList(); });
  $('tr-trazi').addEventListener('input', (e) => { trFilter = { ...trFilter, q: e.target.value }; renderList(); });
  $('tragovi-spisak').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-akcija]');
    if (!btn || btn.dataset.akcija === 'obrisi') return;
    const id = btn.closest('[data-id]').dataset.id;
    const tr = (await allTracks()).find((t) => t.id === id);
    if (!tr) return;
    const pts = pointsForDisplay(tr);
    switch (btn.dataset.akcija) {
      case 'prikazi':
        list.hidden = true;
        showTrack(tr);
        break;
      case 'uglacaj':
        await setSmoothed(id, !tr.uglacan);
        await renderList();
        break;
      case 'dijeli':
        list.hidden = true;
        await shareDialog()?.open('tragovi', id);
        break;
      case 'gpx':
        shareFile(trackFileName(tr, 'gpx'), 'application/gpx+xml', toGpx(tr, pts, trackWaypoints(tr)));
        break;
      case 'kml':
        shareFile(trackFileName(tr, 'kml'), 'application/vnd.google-earth.kml+xml', toKml(tr, pts, trackWaypoints(tr)));
        break;
      default:
    }
  });

  const openList = async () => {
    await renderList();
    $('postavke').hidden = true;
    $('meni-spiskovi').hidden = true;
    list.hidden = false;
  };
  $('btn-tragovi').addEventListener('click', openList);
  $('btn-moji-tragovi')?.addEventListener('click', openList);
  $('btn-tragovi-zatvori').addEventListener('click', () => { list.hidden = true; });
  registerBackHandler(() => {
    if (list.hidden) return false;
    list.hidden = true;
    return true;
  });

  // ---- oporavak nakon pada / gašenja app-a ----
  const offerRecovery = async () => {
    const [tr] = await unfinishedTracks();
    if (!tr) return;
    const d = new Date(tr.start);
    $('oporavak-tekst').textContent = `Snimanje "${tr.naziv}" je prekinuto (app je bila ugašena). `
      + `Sačuvano ${tr.tacke.length} tačaka od ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}.`;
    recovery.dataset.id = tr.id;
    recovery.hidden = false;
  };
  $('btn-oporavak-nastavi').addEventListener('click', async () => {
    recovery.hidden = true;
    try {
      await continueRecovered(recovery.dataset.id);
      toast('Snimanje nastavljeno');
    } catch (err) {
      toast(err.message, 5000);
    }
    offerRecovery();
  });
  $('btn-oporavak-zavrsi').addEventListener('click', async () => {
    recovery.hidden = true;
    await finishRecovered(recovery.dataset.id);
    toast('Trag završen i sačuvan');
    offerRecovery();
  });
  offerRecovery().catch((err) => console.error('oporavak', err));
}

// Test u emulatoru (CI): snima i loguje broj tačaka koje su stigle kroz native servis.
export async function runRecordingAutotest() {
  const tr = await startRecording({ naziv: 'autotest', pitajBateriju: false });
  const h = setInterval(() => {
    const cur = activeRecordings().find((r) => r.id === tr.id);
    console.info(`TRAG_TACAKA ${cur ? cur.tacke.length : -1}`);
    console.info(`TRAG_SERVIS ${Boolean(globalThis.AndroidGps?.isRunning?.())}`);
  }, 2000);
  setTimeout(async () => { clearInterval(h); await stopRecording(tr.id); console.info('TRAG_STOP'); }, 180000);
}
