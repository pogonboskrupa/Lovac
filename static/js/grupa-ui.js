// Ekran "Moja grupa": grupa je glavna jedinica lova. Lovac i grupovođa u njemu vide svoju grupu: lov i ko dolazi, lovce i
// njihovu aktivnost, poruke grupe i statistiku. Podaci su lokalni (radi offline); ovdje se samo crta, a mreža ide kroz
// postojeće tokove: poruke kroz sekcija-poruke.js (događaj `lov:poruke-osvjezi`), odaziv kroz odaziv-ui.js
// (`odaziv:odgovori`), organizacija lova kroz sekcija-ui.js (`lov:dodaj`, `lov:upravljanje`).
import { getClient, cachedProfile } from './auth.js';
import { idbAll, idbPut } from './db.js';
import { loadJSON, saveSoft } from './storage.js';
import { connectionQuality } from './net.js';
import { isServerConfigured } from './config.js';
import { cachedSekcije, downloadSekcije } from './sekcije-ui.js';
import { downloadHunts } from './lov-ui.js';
import { memberName } from './dijeljenje-ui.js';
import { myStatus } from './sekcije.js';
import { huntTargets, canManageHunt } from './lov-traje.js';
import { myGroupSlot, GROUP_READ_KEY, groupMembers, currentGroupHunt, groupHunts, attendance, myAttendance, groupStats, groupActivity } from './grupa-podaci.js';
import { groupHuntHtml, groupMembersHtml, groupStatsHtml } from './grupa-render.js';
import { conversationHtml } from './sekcija-render.js';
import { validateMessage, newMessage, QUICK_MESSAGES, KANAL_GRUPA } from './poruke.js';
import { faceStrip } from './sekcija-podaci.js';
import { ODAZIV_KEY } from './odaziv.js';
import { canPing } from './ping.js';
import { sendPing } from './ping-ui.js';
import { avatarOf } from './profil-ui.js';
import { logoStyle } from './sekcija-logo.js';
import { initialsOf } from './lokacija.js';
import { toast, registerBackHandler, escapeHtml } from './ui.js';

const $ = (id) => document.getElementById(id);
const SEL_KEY = 'lovac.sekcija.izabrana';
const POLL_MS = 20000;
const LISTS_MS = 60000;

export function initGrupaEkran() {
  const screen = $('grupa-ekran');
  let ctx = { reviri: [], sekcije: [], clanovi: [], lovocuvari: [], grupe: [], revirVodje: [], drustvoUloge: [] };
  let lovovi = [];
  let poruke = [];
  let pozicije = [];
  let odazivi = { lovId: null, rows: [] };
  let timer = null;
  let lastLists = 0;
  let armedEnd = null;
  const me = () => cachedProfile();
  const online = () => isServerConfigured() && connectionQuality() !== 'nema' && Boolean(getClient());
  const isOpen = () => !screen.hidden;
  const slot = () => myGroupSlot(ctx, me(), loadJSON(SEL_KEY, null));

  const load = async () => {
    ctx = await cachedSekcije();
    lovovi = await idbAll('lovovi');
    poruke = (await idbAll('poruke')).sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  };

  const myAnswer = (lovId) => loadJSON(ODAZIV_KEY, {})[lovId]?.odgovor;

  const pullOdazivi = async (zapis) => {
    if (!zapis || zapis.lov.status === 'zavrsen' || !online()) { odazivi = { lovId: null, rows: [] }; return; }
    const { data, error } = await getClient().from('lov_odazivi').select('korisnik_id,odgovor').eq('lov_id', zapis.lov.id);
    odazivi = { lovId: zapis.lov.id, rows: error ? [] : data || [] }; // bez migracije 034: prazno
  };

  const render = () => {
    const sl = slot();
    $('gr-prazno').hidden = Boolean(sl);
    $('gr-sadrzaj').hidden = !sl;
    if (!sl) return;
    const { sekcija: s, grupaId } = sl;
    const g = ctx.grupe.find((x) => x.id === grupaId);
    const members = groupMembers(ctx, grupaId, memberName);
    const cur = currentGroupHunt(lovovi, s.id, grupaId);
    const zapis = cur?.zapis || null;
    const lov = zapis?.lov || null;
    const uc = zapis?.ucesnici || [];
    const poz = lov?.status === 'u_toku' ? pozicije : [];
    const actOf = (id) => groupActivity(id, lov, uc, poz);
    const aktivnih = members.filter((m) => actOf(m.id).stanje === 'aktivan').length;
    const rev = ctx.reviri.find((r) => r.id === s.revir_id);
    const st = myStatus(s, ctx.clanovi, me()?.id, false, ctx.lovocuvari);

    $('gr-naslov').textContent = 'Moja grupa';
    $('gr-logo').setAttribute('style', logoStyle(s));
    $('gr-uloga').textContent = g?.grupovodja_id === me()?.id ? 'Grupovođa' : 'Lovac grupe';
    $('gr-podnaslov').textContent = `Grupa — grupovođa ${g ? memberName(g.grupovodja_id) : '…'} · ${s.naziv}${rev ? ` · revir ${rev.naziv}` : ''}`;
    $('gr-stat-clanova').textContent = String(members.length);
    $('gr-stat-aktivnih').textContent = String(aktivnih);
    $('gr-stat-lovova').textContent = String(groupHunts(lovovi, s.id, grupaId).filter((z) => z.lov.grupa_id === grupaId).length);
    const strip = faceStrip(members);
    $('gr-lica').innerHTML = strip.lica.map((r) => `<span class="sk-avatar sk-lice${avatarOf(r.id) ? ' ima-sliku' : ''}" data-stanje="${actOf(r.id).stanje}" title="${escapeHtml(r.ime)}"${avatarOf(r.id) ? ` style="background-image:url('${avatarOf(r.id)}')"` : ''}>${avatarOf(r.id) ? '' : escapeHtml(initialsOf(r.ime))}</span>`).join('')
      + (strip.ostalo ? `<span class="sk-lice-vise">+${strip.ostalo}</span>` : '');

    // lov i prisustvo
    // moj lokalni odgovor ulazi u brojke odmah (server ga još nije vratio)
    const mine = lov && myAnswer(lov.id) ? [{ korisnik_id: me()?.id, odgovor: myAnswer(lov.id) }] : [];
    const att = attendance(members, uc, [...(odazivi.lovId === lov?.id ? odazivi.rows.filter((r) => r.korisnik_id !== me()?.id) : []), ...mine]);
    const canCreate = huntTargets(s, ctx, me(), memberName).some((m) => m.grupaId === grupaId);
    $('gr-lov').innerHTML = groupHuntHtml({
      cur, grupaId, att, my: zapis ? myAttendance(zapis, me()?.id, myAnswer(lov.id)) : { stanje: 'nema', mozeOdjava: false },
      manage: zapis ? canManageHunt(zapis, ctx, me()) : false, canCreate, aktivnih,
    });

    // lovci
    $('gr-broj').textContent = `(${members.length})`;
    const attMap = new Map(att.rows.map((r) => [r.id, r.stanje]));
    $('gr-clanovi').innerHTML = groupMembersHtml(members, {
      myId: me()?.id, st, canPing, actOf, attState: zapis && zapis.lov.status !== 'zavrsen' ? (id) => attMap.get(id) : null, avatarOf,
    });

    // poruke
    const msgs = poruke.filter((m) => m.kanal === KANAL_GRUPA && m.grupa_id === grupaId);
    $('gr-poruke').innerHTML = conversationHtml(msgs, { showHunt: false, myId: me()?.id, nameOf: memberName })
      || '<p class="sitno poruke-prazno">Još nema poruka grupe. Pošalji prvu ili dodirni brzu poruku.</p>';
    $('gr-poruke').scrollTop = $('gr-poruke').scrollHeight;
    $('gr-brze').innerHTML = QUICK_MESSAGES.map((t) => `<button type="button" data-brza="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');

    $('gr-stat').innerHTML = groupStatsHtml(groupStats(lovovi, s.id, grupaId, members));
    const last = msgs.map((m) => m.created_at).sort().pop();
    if (last && isOpen()) { saveSoft(GROUP_READ_KEY(grupaId), last); document.dispatchEvent(new Event('grupa:procitano')); }
  };

  const refresh = async ({ force = false } = {}) => {
    if (!isOpen()) return;
    if (online()) {
      try {
        if (force || Date.now() - lastLists > LISTS_MS) {
          await downloadSekcije({ grupe: true });
          await downloadHunts();
          lastLists = Date.now();
        }
        document.dispatchEvent(new Event('lov:poruke-osvjezi'));
        await load();
        const sl = slot();
        await pullOdazivi(sl ? currentGroupHunt(lovovi, sl.sekcija.id, sl.grupaId)?.zapis : null);
        $('gr-status').textContent = '';
      } catch (err) {
        $('gr-status').textContent = `Nema veze sa serverom — prikazani su sačuvani podaci (${err.message})`;
      }
    }
    render();
  };

  const open = async () => {
    screen.hidden = false;
    await load();
    render();
    refresh({ force: true });
    clearInterval(timer);
    timer = setInterval(() => refresh(), POLL_MS);
  };
  const close = () => { screen.hidden = true; clearInterval(timer); timer = null; armedEnd = null; };

  document.addEventListener('grupa:otvori', open);
  $('btn-gr-sekcija').addEventListener('click', () => { close(); document.dispatchEvent(new Event('sekcija:otvori')); });
  $('btn-gr-pristup').addEventListener('click', () => { close(); $('btn-sekcije').click(); });
  $('gr-nav').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cilj]');
    if (b) $(b.dataset.cilj).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.addEventListener('uzivo:pozicije', (e) => { pozicije = e.detail?.rows || []; if (isOpen()) render(); });
  document.addEventListener('poruke:promjena', () => { if (isOpen()) load().then(render); });
  document.addEventListener('lovovi:promjena', () => { if (isOpen()) load().then(render); });
  // odgovor Dolazim/Ne dolazim je poslan: raspored lova sa servera se osvježi da svi vide isto
  document.addEventListener('lovovi:promjena', () => { if (isOpen() && online()) downloadHunts().then(load).then(render).catch(() => {}); });
  document.addEventListener('sekcije:promjena', () => { if (isOpen()) load().then(render); });

  const curZapis = () => { const sl = slot(); return sl ? currentGroupHunt(lovovi, sl.sekcija.id, sl.grupaId)?.zapis : null; };

  screen.addEventListener('click', async (e) => {
    const brza = e.target.closest('[data-brza]');
    if (brza) { const i = $('forma-gr-poruka').elements.tekst; i.value = brza.dataset.brza; i.focus(); return; }
    const b = e.target.closest('button[data-akcija]');
    if (!b) return;
    const sl = slot();
    const zapis = curZapis();
    const a = b.dataset.akcija;
    if (a === 'gr-novi') {
      if (!sl) return;
      document.dispatchEvent(new CustomEvent('lov:dodaj', { detail: { sekcijaId: sl.sekcija.id, grupaId: sl.grupaId } }));
    } else if ((a === 'gr-dolazim' || a === 'gr-ne') && zapis) {
      document.dispatchEvent(new CustomEvent('odaziv:odgovori', { detail: { lovId: zapis.lov.id, odgovor: a === 'gr-dolazim' ? 'da' : 'ne' } }));
      setTimeout(() => { if (isOpen()) load().then(render); }, 300);
    } else if (a === 'gr-pokreni' && zapis) {
      document.dispatchEvent(new CustomEvent('lov:upravljanje', { detail: { akcija: 'pokreni', lovId: zapis.lov.id } }));
    } else if (a === 'gr-zavrsi' && zapis) {
      // završetak je za sve: drugi dodir (WebView nema confirm())
      if (armedEnd !== zapis.lov.id) {
        armedEnd = zapis.lov.id;
        b.textContent = 'Dodirni ponovo — završava lov za sve';
        setTimeout(() => { if (armedEnd === zapis.lov.id) { armedEnd = null; if (b.isConnected) b.textContent = 'Završi lov'; } }, 4000);
        return;
      }
      armedEnd = null;
      document.dispatchEvent(new CustomEvent('lov:upravljanje', { detail: { akcija: 'zavrsi', lovId: zapis.lov.id } }));
    } else if (a === 'gr-raspored') {
      close();
      document.dispatchEvent(new CustomEvent('lov:otvori', { detail: { id: b.dataset.lov } }));
    } else if (a === 'gr-na-karti') {
      close();
      document.dispatchEvent(new CustomEvent('lov:prikazi-lovca', { detail: { korisnikId: b.closest('[data-uid]').dataset.uid } }));
    } else if (a === 'gr-poruka') {
      const i = $('forma-gr-poruka').elements.tekst;
      i.value = `${b.closest('[data-uid]').querySelector('b').textContent.replace(' (ti)', '')}: `;
      i.focus();
    } else if (a === 'gr-ping' && sl) {
      await sendPing(sl.sekcija.id, b.closest('[data-uid]').dataset.uid);
    }
  });

  $('forma-gr-poruka').addEventListener('submit', async (e) => {
    e.preventDefault();
    const sl = slot();
    const input = e.target.elements.tekst;
    const err = validateMessage(input.value);
    if (err) { toast(err); return; }
    if (!sl) return;
    const zapis = curZapis();
    const m = newMessage({ kanal: KANAL_GRUPA, grupa_id: sl.grupaId, autor_id: me().id, tekst: input.value, lov_id: zapis?.lov.status === 'u_toku' ? zapis.lov.id : null });
    try {
      await idbPut('poruke', m);
    } catch (er) {
      toast(`Poruka nije sačuvana: ${er.message}`);
      return;
    }
    input.value = '';
    await load();
    render();
    document.dispatchEvent(new Event('lov:poruke-osvjezi'));
  });

  registerBackHandler(() => {
    if (screen.hidden) return false;
    close();
    return true;
  });
}
