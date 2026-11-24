// Slike lovcima: slanje (iz ekrana ili iz velike slike "Pošalji lovcu"), izlazna kutija (radi bez interneta),
// preuzimanje primljenih (poslije preuzimanja se brišu sa servera) i lokalni spisak primljenih/poslanih.
import { getClient, cachedProfile } from './auth.js';
import { idbGet, idbPut, idbDelete } from './db.js';
import { connectionQuality } from './net.js';
import { uuid } from './zapisi.js';
import { resizeToDataUrl, makeThumbnail } from './foto.js';
import { dataUrlToBlob } from './fotosync.js';
import { memberName, refreshMembers } from './dijeljenje-ui.js';
import { loadJSON } from './storage.js';
import { isPolicyRejection, isNetworkFailure } from './sync.js';
import { openImageViewer } from './slika-pregled.js';
import { formatMessageTime } from './poruke.js';
import {
  MAX_SLIKA, MAX_PRIMALACA, missingOnServer, retryLater, recipientsFrom, filterRecipients, validateSend, newSends, newInboxIds, sentStatus, newestFirst, inboxSummary, memberLabel,
} from './slike-lovcima.js';
import { toast, escapeHtml, registerBackHandler } from './ui.js';

const $ = (id) => document.getElementById(id);
// Ključevi po nalogu: drugi lovac prijavljen na istom telefonu ne vidi tuđe slike niti šalje tuđi red kao svoj.
const KES0 = 'slike-lovcima';
const RED0 = 'slike-lovcima-red';
const SLIKA = (id) => `slika-lovca:${id}`;
const POLL_MS = 120000;
const POLL_OTVORENO_MS = 30000;
const CISCENJE_MS = 3600000;
const LAKE = 'id,posiljalac_id,opis,lat,lon,created_at,istice';

// Smanji sliku dok ne stane u granicu servera.
async function toSendable(blob) {
  for (const [side, q] of [[1280, 0.72], [960, 0.62], [720, 0.55]]) {
    const s = await resizeToDataUrl(blob, side, q);
    if (s.length <= MAX_SLIKA) return s;
  }
  throw new Error('Slika je prevelika');
}

export function initSlikeLovcima(L, map) {
  const screen = $('slike-lovcima');
  const sheet = $('slika-lovcu');
  if (!screen || !sheet) return;
  let state = { primljene: [], poslane: [] };
  let tab = 'primljene';
  let draft = null; // { slika, lat, lon, izabrani: Set }
  let busy = false;
  let lastClean = 0;
  let tempMarker = null;
  const armed = new Map();
  const me = () => cachedProfile();
  const online = () => connectionQuality() !== 'nema' && Boolean(getClient());

  const KES = () => `${KES0}:${me()?.id || 'niko'}`;
  const RED = () => `${RED0}:${me()?.id || 'niko'}`;
  // v1.1.6 je čuvao bez naloga: prvi nalog koji otvori preuzima te zapise, pa se stari ključ briše.
  const adoptOld = async () => {
    if (!me()?.id) return;
    for (const [old, now] of [[KES0, KES()], [RED0, RED()]]) {
      const o = await idbGet('arhiva', old).catch(() => null);
      if (!o) continue;
      if (!(await idbGet('arhiva', now).catch(() => null))) await idbPut('arhiva', { ...o, id: now });
      await idbDelete('arhiva', old).catch(() => {});
    }
  };
  const load = async () => {
    await adoptOld().catch(() => {});
    const c = await idbGet('arhiva', KES()).catch(() => null);
    state = { primljene: c?.primljene || [], poslane: c?.poslane || [] };
  };
  const save = () => idbPut('arhiva', { id: KES(), ...state });
  const outbox = async () => (await idbGet('arhiva', RED()).catch(() => null))?.rows || [];
  const members = () => recipientsFrom(loadJSON('lovac.clanovi', []), me()?.id);
  const updateTile = () => { const el = $('btn-slike-lovcima-opis'); if (el) el.textContent = inboxSummary(state.primljene); };

  // ---------- forma slanja ----------
  const renderRecipients = () => {
    if (!draft) return;
    const list = filterRecipients(members(), $('sl-trazi').value);
    $('sl-primaoci').innerHTML = list.slice(0, 80).map((m) => `<li data-uid="${escapeHtml(m.id)}"><label class="sl-primalac">
      <input type="checkbox" ${draft.izabrani.has(m.id) ? 'checked' : ''}> ${escapeHtml(memberLabel(m))}</label></li>`).join('')
      || '<li class="sitno">Nema lovaca na spisku. Spisak članova stiže sa servera kad ima interneta.</li>';
    $('sl-izabrani').textContent = draft.izabrani.size ? `Izabrano: ${[...draft.izabrani].map(memberName).join(', ')}` : 'Niko nije izabran.';
  };
  const openSheet = ({ slika, lat = null, lon = null, opis = '' }) => {
    draft = { slika, lat, lon, izabrani: new Set() };
    $('sl-pregled').innerHTML = `<img src="${escapeHtml(slika)}" alt="Slika za slanje">`;
    $('sl-trazi').value = '';
    $('sl-opis').value = opis;
    $('sl-status').textContent = '';
    sheet.hidden = false;
    renderRecipients();
    if (online()) refreshMembers().then(renderRecipients).catch(() => {});
  };
  const closeSheet = () => { sheet.hidden = true; draft = null; };
  const prepareAndOpen = async (blob, extra = {}) => {
    try {
      openSheet({ slika: await toSendable(blob), ...extra });
    } catch (err) {
      toast(`Slika se ne može pripremiti: ${err.message}`);
    }
  };

  $('sl-trazi').addEventListener('input', renderRecipients);
  $('sl-primaoci').addEventListener('change', (e) => {
    const li = e.target.closest('[data-uid]');
    if (!li || !draft) return;
    if (e.target.checked) {
      if (draft.izabrani.size >= MAX_PRIMALACA) { e.target.checked = false; toast(`Najviše ${MAX_PRIMALACA} lovaca odjednom`); return; }
      draft.izabrani.add(li.dataset.uid);
    } else draft.izabrani.delete(li.dataset.uid);
    renderRecipients();
  });
  $('btn-sl-posalji').addEventListener('click', async () => {
    if (!draft || !me()) return;
    const primaoci = [...draft.izabrani];
    const err = validateSend({ primaoci, slika: draft.slika });
    if (err) { $('sl-status').textContent = err; return; }
    const rows = newSends({ ids: primaoci.map(() => uuid()), primaoci, slika: draft.slika, opis: $('sl-opis').value, lat: draft.lat, lon: draft.lon });
    try {
      const sl = await makeThumbnail(dataUrlToBlob(draft.slika));
      // kritičan upis: slika i red prvo na telefon; ako ne uspije, forma ostaje otvorena
      for (const r of rows) await idbPut('arhiva', { id: SLIKA(r.id), slika: r.slika });
      await idbPut('arhiva', { id: RED(), rows: [...await outbox(), ...rows] });
      state.poslane = [...state.poslane, ...rows.map(({ slika, ...r }) => ({ ...r, slicica: sl, poslano: false }))];
      await save();
    } catch (er) {
      $('sl-status').textContent = `Slika nije sačuvana: ${er.message}`;
      return;
    }
    closeSheet();
    const sent = await flushSlike();
    toast(sent ? 'Slika je poslana' : 'Slika je sačuvana i šalje se čim bude interneta', 5000);
    renderSlike();
  });
  $('btn-sl-odustani').addEventListener('click', closeSheet);
  $('btn-slika-lovcu-zatvori').addEventListener('click', closeSheet);
  $('sl-ulaz').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) prepareAndOpen(file);
  });
  // "Pošalji lovcu" iz velike slike (slika na poziciji, opažanje, arhiva, dojava, primljena slika)
  document.addEventListener('slika:posalji', (e) => {
    const d = e.detail || {};
    if (d.blob) prepareAndOpen(d.blob, { lat: d.lat ?? null, lon: d.lon ?? null, opis: d.opis || '' });
  });

  // ---------- slanje i preuzimanje ----------
  async function flushSlike() {
    if (!online()) return false;
    let left = await outbox();
    let sent = false;
    for (const r of [...left]) {
      const { data, error } = await getClient().from('slike_lovcima').insert(r).select('id,istice');
      if (error) {
        if (isNetworkFailure(error) || (!isPolicyRejection(error) && !error.code)) break; // veza: ostaje u redu
        if (missingOnServer(error)) { console.warn('slike lovcima: server još nema nadogradnju (033)'); break; }
        if (retryLater(error)) { toast('Server trenutno ne prima više slika (čekaju preuzimanje) — slika čeka i šalje se kasnije'); break; }
        const razlog = isPolicyRejection(error) ? 'server nije prihvatio (nalog bez odobrenja?)' : error.message;
        // isti id već na serveru (ponovljen pokušaj) nije greška
        if (error.code !== '23505') {
          state.poslane = state.poslane.map((p) => (p.id === r.id ? { ...p, odbijena: razlog } : p));
          toast(`Slika nije poslana: ${razlog}`);
        } else state.poslane = state.poslane.map((p) => (p.id === r.id ? { ...p, poslano: true } : p));
      } else {
        sent = true;
        const istice = data?.[0]?.istice || null;
        state.poslane = state.poslane.map((p) => (p.id === r.id ? { ...p, poslano: true, istice } : p));
      }
      left = left.filter((x) => x.id !== r.id);
    }
    await idbPut('arhiva', { id: RED(), rows: left }).catch(() => {});
    await save().catch(() => {});
    return sent;
  }
  const pull = async () => {
    if (!online() || !me()?.id) return;
    const sb = getClient();
    const { data, error } = await sb.from('slike_lovcima').select(LAKE).eq('primalac_id', me().id).order('created_at').limit(20);
    if (error) { console.warn('slike lovcima', error.message); return; }
    const lokalno = state.primljene.map((p) => p.id);
    // već sačuvane na telefonu a još na serveru (brisanje ranije puklo): obrisati, da ne zauzimaju prostor 12 h
    const zaostale = (data || []).map((r) => r.id).filter((id) => lokalno.includes(id));
    if (zaostale.length) await sb.from('slike_lovcima').delete().in('id', zaostale);
    const nove = newInboxIds(data, lokalno);
    let primljeno = 0;
    for (const id of nove.slice(0, 5)) {
      const { data: full, error: e2 } = await sb.from('slike_lovcima').select('*').eq('id', id);
      const row = full?.[0];
      if (e2 || !row?.slika) continue;
      try {
        const sl = await makeThumbnail(dataUrlToBlob(row.slika)).catch(() => null);
        await idbPut('arhiva', { id: SLIKA(id), slika: row.slika });
        const { slika, ...meta } = row;
        state.primljene = [...state.primljene, { ...meta, slicica: sl, novo: true }];
        await save();
      } catch (er) {
        console.warn('slika nije sačuvana', er.message);
        continue; // ne briše se sa servera dok nije na telefonu
      }
      primljeno += 1;
      await sb.from('slike_lovcima').delete().eq('id', id);
      notify(row);
    }
    if (primljeno) document.dispatchEvent(new CustomEvent('slike-lovcima:nove', { detail: { broj: primljeno } }));
    if (Date.now() - lastClean > CISCENJE_MS) {
      lastClean = Date.now();
      sb.rpc('ocisti_slike_lovcima').then(() => {}, () => {});
    }
  };
  const notify = (row) => {
    const title = `Slika od: ${memberName(row.posiljalac_id)}`;
    const text = row.opis || 'Nova slika';
    toast(`${title} — ${text}`, 6000);
    if (globalThis.AndroidNotif?.poruka) globalThis.AndroidNotif.poruka(title, text, 1);
    else globalThis.AndroidNotif?.prikazi?.(title, text);
  };
  const tick = async () => {
    if (busy || !me()?.id) return;
    busy = true;
    try {
      await load();
      await flushSlike();
      await pull();
      renderSlike();
    } catch (err) {
      console.warn('slike lovcima', err.message);
    } finally {
      busy = false;
    }
  };

  // ---------- ekran ----------
  const cardHtml = (p, primljena) => {
    const ko = primljena ? `Od: ${memberName(p.posiljalac_id)}` : `Za: ${memberName(p.primalac_id)}`;
    const st = primljena ? null : sentStatus(p);
    const obrisi = armed.get(p.id) ? 'Dodirni ponovo za brisanje' : 'Obriši';
    return `<li class="tr-kartica ev-kartica sl-kartica" data-id="${escapeHtml(p.id)}"${p.novo ? ' data-novo="true"' : ''}>
      <button type="button" class="sl-mala" data-akcija="otvori">${p.slicica ? `<img src="${escapeHtml(p.slicica)}" alt="Slika">` : '<svg class="ic"><use href="#ic-camera"/></svg>'}</button>
      <div class="sl-tekst"><b>${escapeHtml(ko)}</b>
        <span class="sitno">${escapeHtml(formatMessageTime(p.created_at))}${p.novo ? ' · nova' : ''}</span>
        ${p.opis ? `<span>${escapeHtml(p.opis)}</span>` : ''}
        ${st ? `<span class="sitno sl-stanje" data-stanje="${st.stanje}">${escapeHtml(st.tekst)}</span>` : ''}
        <div class="red-dugmadi">
          ${Number.isFinite(p.lat) ? '<button type="button" class="dugme" data-akcija="karta">Na karti</button>' : ''}
          <button type="button" class="dugme" data-akcija="obrisi">${obrisi}</button>
        </div></div>
    </li>`;
  };
  function renderSlike() {
    updateTile();
    if (screen.hidden) return;
    document.querySelectorAll('#sl-tabovi [data-sltab]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sltab === tab)));
    const nove = state.primljene.filter((p) => p.novo).length;
    $('sl-tabovi').querySelector('[data-sltab="primljene"]').textContent = nove ? `Primljene (${nove})` : 'Primljene';
    const list = newestFirst(tab === 'primljene' ? state.primljene : state.poslane);
    $('sl-spisak').innerHTML = list.map((p) => cardHtml(p, tab === 'primljene')).join('')
      || `<li class="sitno">${tab === 'primljene' ? 'Još nema primljenih slika.' : 'Još nisi slao slike. Dodirni "Pošalji sliku" ili u velikoj slici "Pošalji lovcu".'}</li>`;
  }
  const markRead = async () => {
    if (!state.primljene.some((p) => p.novo)) return;
    state.primljene = state.primljene.map((p) => ({ ...p, novo: false }));
    await save().catch(() => {});
  };
  $('sl-tabovi').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sltab]');
    if (!b) return;
    tab = b.dataset.sltab;
    renderSlike();
  });
  $('sl-spisak').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-akcija]');
    const card = e.target.closest('[data-id]');
    if (!b || !card) return;
    const id = card.dataset.id;
    const p = [...state.primljene, ...state.poslane].find((x) => x.id === id);
    if (!p) return;
    const a = b.dataset.akcija;
    if (a === 'otvori') {
      const s = (await idbGet('arhiva', SLIKA(id)).catch(() => null))?.slika || p.slicica;
      if (!s) { toast('Slika nije na telefonu'); return; }
      const ko = tab === 'primljene' ? `Od: ${memberName(p.posiljalac_id)}` : `Za: ${memberName(p.primalac_id)}`;
      openImageViewer({ src: s, caption: `${ko} · ${formatMessageTime(p.created_at)}${p.opis ? ` · ${p.opis}` : ''}`, share: { lat: p.lat, lon: p.lon, opis: p.opis } });
      return;
    }
    if (a === 'karta') {
      screen.hidden = true;
      if (tempMarker) map.removeLayer(tempMarker);
      tempMarker = L.circleMarker([p.lat, p.lon], { radius: 14, color: '#2563eb', weight: 3, fillOpacity: 0.15 }).addTo(map);
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 16), { animate: false });
      setTimeout(() => { if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; } }, 60000);
      return;
    }
    if (a === 'obrisi') {
      if (!armed.get(id)) { armed.set(id, true); renderSlike(); setTimeout(() => { armed.delete(id); renderSlike(); }, 4000); return; }
      armed.delete(id);
      // samo sa telefona; neposlana slika se skida i iz reda slanja
      state.primljene = state.primljene.filter((x) => x.id !== id);
      state.poslane = state.poslane.filter((x) => x.id !== id);
      await idbPut('arhiva', { id: RED(), rows: (await outbox()).filter((x) => x.id !== id) }).catch(() => {});
      await idbDelete('arhiva', SLIKA(id)).catch(() => {});
      await save().catch(() => {});
      renderSlike();
    }
  });
  let pollOpen = null;
  const open = async () => {
    $('meni-spiskovi').hidden = true;
    await load();
    screen.hidden = false;
    renderSlike();
    await markRead();
    updateTile();
    tick();
    clearInterval(pollOpen);
    pollOpen = setInterval(() => { if (!screen.hidden) tick(); else clearInterval(pollOpen); }, POLL_OTVORENO_MS);
  };
  const closeScreen = () => { screen.hidden = true; clearInterval(pollOpen); };
  $('btn-slike-lovcima').addEventListener('click', open);
  $('btn-slike-lovcima-zatvori').addEventListener('click', closeScreen);
  registerBackHandler(() => {
    if (!sheet.hidden) { closeSheet(); return true; }
    if (!screen.hidden) { closeScreen(); return true; }
    return false;
  });
  load().then(renderSlike);
  setInterval(tick, POLL_MS);
  setTimeout(tick, 8000);
}
