// UI snimanja: panel na karti, živa linija, spisak tragova, oporavak nakon pada i izvoz.

import {
  startRecording, pauseRecording, resumeRecording, stopRecording, onRecordingChange, activeRecordings,
  allTracks, unfinishedTracks, continueRecovered, finishRecovered, deleteTrack, setSmoothed,
} from './snimanje.js';
import {
  movingTime, trackDistance, formatDistance, formatDuration, smoothPoints, toGpx, toKml, trackFileName,
} from './trag.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';
import { shareFile } from './dijeljenje.js';

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

  const current = () => activeRecordings()[0] || null;

  const renderPanel = (recs) => {
    const tr = recs[0];
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
    toast(`Trag sačuvan: ${formatDistance(trackDistance(done.tacke))}`);
  });

  // ---- spisak tragova ----
  const showTrack = (tr) => {
    if (shown) map.removeLayer(shown);
    const pts = pointsForDisplay(tr);
    shown = L.polyline(pts.map((p) => [p.lat, p.lon]), SHOWN_STYLE).addTo(map);
    if (pts.length) map.fitBounds(shown.getBounds(), { padding: [40, 40], maxZoom: 17 });
  };

  const renderList = async () => {
    const ul = $('tragovi-spisak');
    const tracks = (await allTracks()).filter((t) => t.status === 'gotovo');
    $('tragovi-prazno').hidden = tracks.length > 0;
    ul.innerHTML = tracks.map((t) => `
      <li class="trag-red" data-id="${escapeHtml(t.id)}">
        <div class="trag-naslov"><b>${escapeHtml(t.naziv)}</b><span class="sitno">${escapeHtml(trackSummary(t))}</span></div>
        <div class="red-dugmadi">
          <button type="button" class="dugme" data-akcija="prikazi">Prikaži</button>
          <button type="button" class="dugme" data-akcija="uglacaj" aria-pressed="${t.uglacan}">${t.uglacan ? 'Original' : 'Uglačaj'}</button>
          <button type="button" class="dugme" data-akcija="gpx">GPX</button>
          <button type="button" class="dugme" data-akcija="kml">KML</button>
          <button type="button" class="dugme" data-akcija="obrisi">Obriši</button>
        </div>
      </li>`).join('');
    ul.querySelectorAll('[data-akcija="obrisi"]').forEach((b) => {
      wireTwoTap(b, 'Dodirni ponovo', async () => {
        const id = b.closest('[data-id]').dataset.id;
        await deleteTrack(id);
        await renderList();
        toast('Trag obrisan');
      });
    });
  };

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
      case 'gpx':
        shareFile(trackFileName(tr, 'gpx'), 'application/gpx+xml', toGpx(tr, pts));
        break;
      case 'kml':
        shareFile(trackFileName(tr, 'kml'), 'application/vnd.google-earth.kml+xml', toKml(tr, pts));
        break;
      default:
    }
  });

  const openList = async () => {
    await renderList();
    $('postavke').hidden = true;
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
  }, 2000);
  setTimeout(async () => { clearInterval(h); await stopRecording(tr.id); console.info('TRAG_STOP'); }, 90000);
}
