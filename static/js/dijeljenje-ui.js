// Vidljivost zapisa (jednim dodirom) i brojač reda slanja. Pravilo provodi SERVER (RLS);
// ovdje se samo bira šta lovac želi.

import { getClient, cachedProfile } from './auth.js';
import { updateRecord, getRecord, VIDLJIVOST } from './zapisi.js';
import { saveTrack } from './snimanje.js';
import { idbGet } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { syncNow, onQueueChange, queueEntries, dropRejected } from './sync.js';
import { registerBackHandler, escapeHtml, toast } from './ui.js';

const MEMBERS_KEY = 'lovac.clanovi';
const $ = (id) => document.getElementById(id);

export const VIDLJIVOST_OPIS = {
  privatno: 'Vidiš samo ti. Ne vidi niko drugi, ni administrator.',
  drustvo: 'Vide svi odobreni lovci društva i administrator.',
  izabrani: 'Vide samo lovci koje izabereš.',
};

export function memberName(id) {
  // Rezerva: imena podnosilaca zahtjeva (probni nalozi nisu u spisku članova; daje ih server samo onome ko odobrava, 040).
  const m = loadJSON(MEMBERS_KEY, []).find((x) => x.id === id) || loadJSON('lovac.imena_zahtjeva', []).find((x) => x.korisnik_id === id || x.id === id);
  if (!m) return 'drugi lovac';
  return `${m.ime} ${m.prezime}${m.nadimak ? ` (${m.nadimak})` : ''}`;
}

export async function refreshMembers() {
  const sb = getClient();
  if (!sb) return loadJSON(MEMBERS_KEY, []);
  const { data, error } = await sb.from('korisnici').select('*');
  if (error) throw new Error(error.message);
  const list = (data || []).filter((u) => u.odobren).map((u) => ({ id: u.id, ime: u.ime, prezime: u.prezime, nadimak: u.nadimak || null }));
  saveSoft(MEMBERS_KEY, list);
  return list;
}

async function saveVisibility(store, id, vidljivost, dijeliSa) {
  if (store === 'tragovi') {
    const tr = await idbGet('tragovi', id);
    return saveTrack({ ...tr, vidljivost, dijeli_sa: dijeliSa });
  }
  return updateRecord(store, id, { vidljivost, dijeli_sa: dijeliSa });
}

export function initDijeljenje() {
  const dialog = $('dijeljenje');
  let target = null; // { store, id, vidljivost, dijeli_sa }

  const render = () => {
    $('dijeljenje-izbor').querySelectorAll('[data-vidljivost]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.vidljivost === target.vidljivost));
    });
    $('dijeljenje-opis').textContent = VIDLJIVOST_OPIS[target.vidljivost];
    const box = $('dijeljenje-clanovi');
    box.hidden = target.vidljivost !== 'izabrani';
    if (box.hidden) return;
    const me = cachedProfile()?.id;
    const members = loadJSON(MEMBERS_KEY, []).filter((m) => m.id !== me);
    box.innerHTML = members.length
      ? members.map((m) => `<label class="red-check" data-id="${escapeHtml(m.id)}"><input type="checkbox" value="${escapeHtml(m.id)}"
        ${target.dijeli_sa.includes(m.id) ? 'checked' : ''}> ${escapeHtml(memberName(m.id))}</label>`).join('')
      : '<p class="sitno">Spisak lovaca još nije preuzet sa servera (potreban je internet).</p>';
  };

  $('dijeljenje-izbor').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vidljivost]');
    if (!b) return;
    target.vidljivost = b.dataset.vidljivost;
    render();
  });
  $('dijeljenje-clanovi').addEventListener('change', (e) => {
    const id = e.target.value;
    target.dijeli_sa = e.target.checked ? [...new Set([...target.dijeli_sa, id])] : target.dijeli_sa.filter((x) => x !== id);
  });
  $('btn-dijeljenje-sacuvaj').addEventListener('click', async () => {
    const dijeliSa = target.vidljivost === 'izabrani' ? target.dijeli_sa : [];
    if (target.vidljivost === 'izabrani' && !dijeliSa.length) { toast('Izaberi bar jednog lovca'); return; }
    await saveVisibility(target.store, target.id, target.vidljivost, dijeliSa);
    dialog.hidden = true;
    toast(`Vidljivost: ${VIDLJIVOST[target.vidljivost]}`);
    document.dispatchEvent(new CustomEvent('zapisi:promjena', { detail: { izvor: 'dijeljenje', store: target.store } }));
  });
  $('btn-dijeljenje-odustani').addEventListener('click', () => { dialog.hidden = true; });
  registerBackHandler(() => {
    if (dialog.hidden) return false;
    dialog.hidden = true;
    return true;
  });

  // ---- red slanja ----
  const badge = $('red-znacka');
  const renderQueue = async (n) => {
    badge.hidden = n === 0;
    badge.textContent = `Čeka slanje: ${n}`;
    $('postavke-red').textContent = n ? `Čeka slanje: ${n}` : 'Sve je poslano na server.';
    const all = await queueEntries();
    const errs = all.filter((e) => !e.odbijen).map((e) => e.greska).filter(Boolean);
    $('postavke-red-greska').textContent = errs.length ? `Zadnja greška: ${errs[errs.length - 1]}` : '';
    const rej = all.filter((e) => e.odbijen).length;
    const box = $('postavke-red-odbijeno');
    if (box) {
      box.hidden = rej === 0;
      $('postavke-red-odbijeno-tekst').textContent = rej
        ? `Server nije prihvatio ${rej} zapisa (npr. napravljeni su pod drugim nalogom na ovom telefonu). Ostaju na telefonu, ali se više ne šalju.`
        : '';
    }
  };
  onQueueChange(renderQueue);
  $('btn-odbijeno-ukloni')?.addEventListener('click', async () => {
    const n = await dropRejected();
    toast(`Skinuto iz reda: ${n}`);
  });
  const sendNow = async () => {
    toast('Šaljem…');
    const r = await syncNow({ force: true });
    toast(r.preostalo ? `Poslano ${r.poslano}, čeka još ${r.preostalo}` : `Poslano ${r.poslano}. Sve je na serveru.`);
    refreshMembers().catch(() => {});
  };
  badge.addEventListener('click', sendNow);
  $('btn-posalji-sad').addEventListener('click', sendNow);
  refreshMembers().catch(() => {});

  return {
    async open(store, id) {
      const rec = store === 'tragovi' ? await idbGet('tragovi', id) : await getRecord(store, id);
      if (!rec || rec.tudji) return;
      target = { store, id, vidljivost: rec.vidljivost || 'privatno', dijeli_sa: [...(rec.dijeli_sa || [])] };
      render();
      dialog.hidden = false;
    },
  };
}

let instance = null;
export function shareDialog() {
  return instance;
}
export function setShareDialog(d) {
  instance = d;
}
