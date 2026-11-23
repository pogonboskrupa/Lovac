// Arhiva lova: prošli i tekući lovovi sekcija sa učesnicima, početkom i krajem, ulovom, rezultatom, slikama i tragom kretanja.
// Spisak radi iz keša (offline); detalji se preuzimaju kad ima veze i keširaju. Slike idu kroz izlaznu kutiju (IndexedDB).

import { openImageViewer } from './slika-pregled.js';
import { getClient, cachedProfile } from './auth.js';
import { idbAll, idbGet, idbPut, idbDelete } from './db.js';
import { connectionQuality } from './net.js';
import { currentFix } from './gps.js';
import { uuid } from './zapisi.js';
import { memberName } from './dijeljenje-ui.js';
import { downloadHunts } from './lov-ui.js';
import { getSpisakAll, lookupNaziv } from './spiskovi.js';
import { makeThumbnail, resizeToDataUrl } from './foto.js';
import { summarizeHarvest, formatDecimalBs } from './odstrel.js';
import { archiveHunts, huntDate, huntTimeRange, huntedText, canAddMedia, matchesArchive, MAX_PHOTOS_PER_HUNT, archiveOverview } from './arhiva.js';
import { logoStyle } from './sekcija-logo.js';
import { toast, registerBackHandler, wireTwoTap, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const U_LOVU = { strijelac: 'Strijelac', pogonic: 'Pogonič', vodja: 'Vođa lova' };

async function qArh(p) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

export function initArhiva() {
  const list = $('arhiva');
  const detail = $('arhiva-detalj');
  let hunts = [];
  let vrste = [];
  let currentId = null;
  const details = new Map(); // lovId -> { odstrel, slike }
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());
  const speciesName = (kod) => lookupNaziv(vrste, kod);

  const loadLocal = async () => {
    hunts = archiveHunts(await idbAll('lovovi').catch(() => []));
    vrste = await getSpisakAll('vrste');
    for (const z of hunts) {
      if (!details.has(z.id)) {
        const c = await idbGet('arhiva', `detalj:${z.id}`).catch(() => null);
        if (c) details.set(z.id, { odstrel: c.odstrel || [], slike: c.slike || [] });
      }
    }
  };

  const isManager = (z) => Boolean(me()?.is_admin) || z.lov.organizator_id === me()?.id || z.sekcija?.grupovodja_id === me()?.id;

  // ---------- spisak ----------
  const renderList = () => {
    const q = $('arhiva-trazi').value;
    const shown = hunts.filter((z) => matchesArchive(z, q, (details.get(z.id)?.odstrel || []).map((o) => speciesName(o.vrsta)).join(' ')));
    const ov = archiveOverview(hunts, (id) => details.get(id));
    $('arh-lovova').textContent = String(ov.lovova);
    $('arh-komada').textContent = String(ov.komada);
    $('arh-slika').textContent = String(ov.slika);
    $('arhiva-spisak').innerHTML = shown.map((z) => {
      const d = details.get(z.id);
      const hunted = d ? huntedText(d.odstrel, speciesName) : '';
      const live = z.lov.status === 'u_toku';
      return `<li class="trag-red arhiva-red tr-kartica" data-id="${escapeHtml(z.id)}" data-status="${escapeHtml(z.lov.status)}">
        <button type="button" class="obj-red-dugme arh-dugme" data-akcija="otvori">
          ${z.sekcija ? `<span class="sek-logo" style="${logoStyle(z.sekcija)}" aria-hidden="true"></span>` : ''}
          <span class="trag-naslov"><b>${escapeHtml(z.lov.naziv)}</b>
          <span class="lk-datum">${escapeHtml(huntDate(z.lov.datum))}${live ? ' · <span class="lk-chip" data-chip="u_toku">U TOKU</span>' : ''}</span>
          <span class="sitno">${escapeHtml(z.sekcija?.naziv || z.revir?.naziv || '')} · ${escapeHtml(huntTimeRange(z.lov))}</span>
          <span class="arh-cipovi"><span>${z.ucesnici.length} učesnika</span>${hunted ? `<span>${escapeHtml(hunted)}</span>` : ''}${d ? `<span>${d.slike.length} slika</span>` : ''}</span></span>
        </button></li>`;
    }).join('') || '<li class="sitno">Nema lovova u arhivi (preuzimaju se uz internet).</li>';
  };

  const openList = async () => {
    $('meni-spiskovi').hidden = true;
    await loadLocal();
    renderList();
    list.hidden = false;
    if (online()) {
      $('arhiva-status').textContent = 'Osvježavam…';
      try {
        await downloadHunts();
        await loadLocal();
        renderList();
        $('arhiva-status').textContent = '';
        // detalji (ulov, broj slika) za prvih 20 lovova, da spisak bude informativan i offline
        for (const z of hunts.slice(0, 20)) await fetchDetail(z.id).catch(() => {});
        renderList();
      } catch (err) {
        $('arhiva-status').textContent = `Nema veze sa serverom — prikazan je keš (${err.message})`;
      }
    } else {
      $('arhiva-status').textContent = 'Bez interneta — prikazan je keš.';
    }
  };

  // ---------- detalj ----------
  const fetchDetail = async (lovId) => {
    const sb = getClient();
    const [odstrel, slike] = await Promise.all([
      qArh(sb.from('lov_odstrel').select('*').eq('lov_id', lovId)),
      qArh(sb.from('lov_slike').select('*').eq('lov_id', lovId).order('created_at', { ascending: true })),
    ]);
    details.set(lovId, { odstrel, slike });
    await idbPut('arhiva', { id: `detalj:${lovId}`, odstrel, slike, preuzeto: Date.now() });
  };

  const queued = async (lovId) => (await idbAll('arhiva_red').catch(() => [])).filter((x) => x.lov_id === lovId);

  const renderDetail = async () => {
    const z = hunts.find((x) => x.id === currentId);
    if (!z) return;
    const d = details.get(z.id) || { odstrel: [], slike: [] };
    const pending = await queued(z.id);
    $('ad-naslov').textContent = z.lov.naziv;
    $('ad-podnaslov').textContent = `${huntDate(z.lov.datum)} · ${huntTimeRange(z.lov)} · ${z.sekcija?.naziv || z.revir?.naziv || ''}`;
    $('ad-stat-ucesnika').textContent = String(z.ucesnici.length);
    $('ad-stat-ulov').textContent = String(d.odstrel.length);
    $('ad-stat-slika').textContent = String(d.slike.length + pending.length);

    const sum = summarizeHarvest(d.odstrel.map((o) => ({ vrsta: o.vrsta, tezina: o.tezina })));
    $('ad-ulov').innerHTML = sum.map((s) => `<li><b>${escapeHtml(speciesName(s.vrsta))}</b>: ${s.komada} kom.${s.tezina ? `, ${escapeHtml(formatDecimalBs(Math.round(s.tezina * 10) / 10))} kg` : ''}
      <span class="sitno">${escapeHtml(d.odstrel.filter((o) => o.vrsta === s.vrsta).map((o) => memberName(o.korisnik_id)).join(', '))}</span></li>`).join('')
      || '<li class="sitno">Nema upisanog ulova za ovaj lov.</li>';

    $('ad-rezultat-tekst').textContent = z.lov.rezultat || 'Rezultat još nije upisan.';
    $('ad-rezultat-forma').hidden = !isManager(z);
    if (!$('ad-rezultat').dataset.lov || $('ad-rezultat').dataset.lov !== z.id) { $('ad-rezultat').value = z.lov.rezultat || ''; $('ad-rezultat').dataset.lov = z.id; }

    $('ad-ucesnici').innerHTML = z.ucesnici.map((u) => `<li class="clan-red"><span class="clan-tekst"><b>${escapeHtml(memberName(u.korisnik_id))}</b>
      <span class="sitno">${escapeHtml(U_LOVU[u.uloga] || u.uloga)}${u.samoprijava ? ' · prijavio se sam' : ''}</span></span></li>`).join('') || '<li class="sitno">Nema učesnika.</li>';

    $('ad-slike').innerHTML = [...d.slike.map((s) => `<figure class="ad-slika" data-id="${escapeHtml(s.id)}"><img src="${s.mala}" alt="${escapeHtml(s.opis || 'Slika lova')}">
        <figcaption>${escapeHtml(memberName(s.autor_id).split(' ')[0])}${s.opis ? ` — ${escapeHtml(s.opis)}` : ''}</figcaption>
        ${(s.autor_id === me()?.id || isManager(z)) ? '<button type="button" class="foto-ukloni" data-akcija="obrisi" aria-label="Obriši sliku">×</button>' : ''}</figure>`),
      ...pending.map((p) => `<figure class="ad-slika ad-slika-ceka"><img src="${p.mala}" alt="Slika čeka slanje"><figcaption>čeka slanje</figcaption></figure>`)].join('')
      || '<p class="sitno">Još nema slika.</p>';
    $('ad-slika-dodaj').hidden = !canAddMedia(z, me()?.id, isManager(z), d.slike.length + pending.length);
    $('btn-ad-trag').hidden = z.lov.status === 'planiran';
  };

  const openDetail = async (id) => {
    currentId = id;
    $('ad-status').textContent = '';
    $('ad-rezultat').dataset.lov = '';
    await renderDetail();
    detail.hidden = false;
    if (online()) {
      try { await flushQueue(); await fetchDetail(id); } catch (err) { $('ad-status').textContent = `Nema veze sa serverom — prikazan je keš (${err.message})`; }
      await renderDetail();
    } else {
      $('ad-status').textContent = 'Bez interneta — prikazan je keš.';
    }
  };

  // ---------- slike: izlazna kutija ----------
  const flushQueue = async () => {
    if (!online()) return;
    const sb = getClient();
    for (const p of await idbAll('arhiva_red').catch(() => [])) {
      try {
        await qArh(sb.from('lov_slike').upsert({ id: p.id, lov_id: p.lov_id, autor_id: p.autor_id, mala: p.mala, opis: p.opis || null, lat: p.lat ?? null, lon: p.lon ?? null, created_at: p.created_at }, { onConflict: 'id' }));
        await qArh(sb.from('lov_slike_podaci').upsert({ id: p.id, slika: p.slika }, { onConflict: 'id' }));
        await idbDelete('arhiva_red', p.id);
      } catch (err) {
        console.warn('slika lova čeka slanje', err.message);
        break;
      }
    }
  };

  $('ad-slika-ulaz').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    const z = hunts.find((x) => x.id === currentId);
    if (!file || !z) return;
    try {
      const fix = currentFix();
      const item = {
        id: uuid(), lov_id: z.id, autor_id: me().id, mala: await makeThumbnail(file), slika: await resizeToDataUrl(file),
        opis: $('ad-slika-opis').value.trim().slice(0, 300), lat: fix?.lat ?? null, lon: fix?.lon ?? null, created_at: new Date().toISOString(),
      };
      await idbPut('arhiva_red', item);
      $('ad-slika-opis').value = '';
      await renderDetail();
      if (online()) {
        await flushQueue();
        await fetchDetail(z.id).catch(() => {});
        await renderDetail();
        toast('Slika je dodana u arhivu lova');
      } else {
        toast('Slika je sačuvana i šalje se kad bude interneta');
      }
    } catch (err) {
      $('ad-status').textContent = `Slika nije dodana: ${err.message}`;
    }
  });

  $('ad-slike').addEventListener('click', async (e) => {
    const fig = e.target.closest('.ad-slika[data-id]');
    if (!fig) return;
    const id = fig.dataset.id;
    const s = (details.get(currentId)?.slike || []).find((x) => x.id === id);
    if (!s) return;
    if (e.target.closest('[data-akcija="obrisi"]')) return; // brisanje ima svoj rukovalac
    openImageViewer({ src: s.mala, caption: `${s.opis || 'Slika lova'} · ${memberName(s.autor_id)}` });
    // velika slika: prvo keš na telefonu, pa server; na serveru traje samo nekoliko dana (migracija 018), sličica ostaje
    const cached = await idbGet('arhiva', `slika:${id}`).catch(() => null);
    if (cached?.slika) { $('slika-velika-img').src = cached.slika; return; }
    if (online()) {
      try {
        const rows = await qArh(getClient().from('lov_slike_podaci').select('*').eq('id', id));
        if (rows[0]?.slika) {
          await idbPut('arhiva', { id: `slika:${id}`, slika: rows[0].slika });
          if (!$('slika-velika').hidden) $('slika-velika-img').src = rows[0].slika;
        } else {
          toast('Original slike je uklonjen sa servera (stariji od 14 dana); vidi se sličica', 5000);
        }
      } catch (err) { console.warn('velika slika', err.message); }
    }
  });
  // brisanje slike: drugi dodir
  let armed = null;
  $('ad-slike').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-akcija="obrisi"]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    if (armed !== id) {
      armed = id;
      b.textContent = '✓?';
      setTimeout(() => { if (armed === id) { armed = null; b.textContent = '×'; } }, 4000);
      return;
    }
    armed = null;
    try {
      await qArh(getClient().from('lov_slike').delete().eq('id', id));
      await fetchDetail(currentId);
      await renderDetail();
      toast('Slika obrisana');
    } catch (err) {
      toast(`Nije obrisano: ${err.message}`);
    }
  });
  void wireTwoTap;

  $('btn-ad-rezultat').addEventListener('click', async () => {
    const z = hunts.find((x) => x.id === currentId);
    if (!z) return;
    if (!online()) { $('ad-status').textContent = 'Za čuvanje rezultata potreban je internet.'; return; }
    try {
      const text = $('ad-rezultat').value.trim();
      await qArh(getClient().from('lovovi').update({ rezultat: text || null }).eq('id', z.id));
      await downloadHunts();
      await loadLocal();
      $('ad-rezultat').dataset.lov = '';
      await renderDetail();
      toast('Rezultat je sačuvan');
    } catch (err) {
      $('ad-status').textContent = `Nije sačuvano: ${err.message}`;
    }
  });

  $('btn-ad-trag').addEventListener('click', () => {
    const id = currentId;
    detail.hidden = true;
    list.hidden = true;
    document.dispatchEvent(new CustomEvent('lovtrag:arhiva', { detail: { lovId: id } }));
  });

  // ---------- događaji ----------
  $('btn-arhiva').addEventListener('click', openList);
  $('btn-arhiva-zatvori').addEventListener('click', () => { list.hidden = true; });
  $('btn-ad-zatvori').addEventListener('click', () => { detail.hidden = true; });
  $('arhiva-trazi').addEventListener('input', renderList);
  $('arhiva-spisak').addEventListener('click', (e) => {
    const b = e.target.closest('[data-akcija="otvori"]');
    if (b) openDetail(b.closest('[data-id]').dataset.id);
  });
  registerBackHandler(() => {
    if (!detail.hidden) { detail.hidden = true; return true; }
    if (!list.hidden) { list.hidden = true; return true; }
    return false;
  });
  setInterval(() => { flushQueue().catch(() => {}); }, 60000);
  void MAX_PHOTOS_PER_HUNT;
}
