// Tab sekcije: crtanje HTML-a (kartica lova, upravljanje prisutnima, razgovor). Čiste funkcije bez DOM-a i stanja:
// sve što im treba stiže kroz argument, pa se testiraju u Node-u, a sekcija-ui.js ostaje samo veza podataka i događaja.
import { memberActivity, huntPresence, addableMembers, activityText, huntsText } from './sekcija-podaci.js';
import { summarizeHarvest, formatDecimalBs } from './odstrel.js';
import { lookupNaziv } from './spiskovi.js';
import { initialsOf } from './lokacija.js';
import { huntDateText } from './lov.js';
import { answersSummary } from './odaziv.js';
import { conversationItems, formatMessageTime } from './poruke.js';
import { escapeHtml } from './ui.js';

export const U_LOVU = { strijelac: 'Strijelac', pogonic: 'Pogonič', vodja: 'Vođa lova' };

// Lovovođa sekcije/admin: pokreće i završava lov, dodaje i uklanja prisutne. Član: javlja da je prisutan.
// o = { s, cur, st, myId, clanovi, odazivi, nameOf }
export function huntControlsHtml(o) {
  const { s, cur, st, myId, clanovi, odazivi, nameOf } = o;
  const manager = st === 'grupovodja' || st === 'admin';
  if (!cur) {
    return manager ? '<button type="button" class="dugme glavno" data-akcija="lov-novi">Novi lov</button>'
      : '<p class="sitno">Lovovođa sekcije još nije napravio lov. Kad ga napravi, ovdje javljaš da si prisutan.</p>';
  }
  const { lov, ucesnici } = cur.zapis;
  const pres = huntPresence(cur.zapis, myId, st);
  let html = '';
  if (pres.canJoin) html += '<button type="button" class="dugme glavno" data-akcija="lov-prijavi">Prisutan sam — pridruži se lovu</button>';
  if (pres.canLeave) html += '<button type="button" class="dugme" data-akcija="lov-odjavi">Nisam prisutan</button>';
  if (!manager) return html;
  if (lov.status === 'planiran') html += `<button type="button" class="dugme glavno" data-akcija="lov-pokreni" data-lov="${escapeHtml(lov.id)}">Pokreni lov</button>`;
  if (lov.status === 'u_toku') html += `<button type="button" class="dugme" data-akcija="lov-zavrsi" data-lov="${escapeHtml(lov.id)}">Završi lov</button>`;
  html += '<button type="button" class="dugme" data-akcija="lov-obrisi">Obriši lov</button>';
  const addable = addableMembers(s, clanovi, ucesnici);
  if (odazivi.lovId === lov.id) {
    const sum = answersSummary(odazivi.rows, nameOf);
    html += `<div class="odaziv-odgovori" id="sk-odazivi"><b>${escapeHtml(sum.tekst)}</b>${sum.ne.length ? `<div class="sitno">Ne dolaze: ${sum.ne.map(escapeHtml).join(', ')}</div>` : ''}</div>`;
  }
  html += `<h4>Prisutni (${ucesnici.length})</h4><ul class="spisak" data-prisutni>${ucesnici.map((u) => `<li class="clan-red" data-uid="${escapeHtml(u.korisnik_id)}">
        <span class="sk-avatar" aria-hidden="true">${escapeHtml(initialsOf(nameOf(u.korisnik_id)))}</span>
        <span class="clan-tekst"><b>${escapeHtml(nameOf(u.korisnik_id))}</b>${u.samoprijava ? ' <span class="sitno">· prijavio se sam</span>' : ''}</span>
        ${u.korisnik_id === myId ? '' : '<button type="button" class="dugme" data-akcija="lov-ukloni">Ukloni</button>'}</li>`).join('')
    || '<li class="sitno">Još niko nije prisutan.</li>'}</ul>
      <h4>Dodaj iz sekcije</h4>
      <div class="clanovi" data-spisak>${addable.map((id) => `<label class="red-check"><input type="checkbox" value="${escapeHtml(id)}"> ${escapeHtml(nameOf(id))}</label>`).join('')
    || '<p class="sitno">Svi članovi sekcije su već u lovu.</p>'}</div>
      ${addable.length ? '<button type="button" class="dugme" data-akcija="lov-dodaj">Dodaj izabrane</button>' : ''}`;
  return html;
}

// o = { s, cur, st, myId, clanovi, odazivi, nameOf, extra, vrste, traceOn }
export function huntCardHtml(o) {
  const { cur, extra, vrste, myId, traceOn } = o;
  if (!cur) return `<p>Nema lova u toku ni planiranog lova za ovu sekciju.</p>${huntControlsHtml(o)}`;
  const { lov, ucesnici, stanovi } = cur.zapis;
  const live = lov.status === 'u_toku';
  const acts = ucesnici.map((u) => memberActivity(u.korisnik_id, lov, ucesnici, extra.lovId === lov.id ? extra.pozicije : []));
  const aktivnih = acts.filter((a) => a.stanje === 'aktivan').length;
  const mineAssign = ucesnici.find((u) => u.korisnik_id === myId);
  const stan = stanovi.find((x) => x.korisnik_id === myId);
  const odstrel = live && extra.lovId === lov.id ? summarizeHarvest(extra.odstrel.map((x) => ({ vrsta: x.vrsta, tezina: x.tezina }))) : [];
  return `<div class="sk-lov-glava"><b>${escapeHtml(lov.naziv)}</b><span class="lov-status" data-status="${lov.status}">${live ? 'U TOKU' : lov.status === 'zavrsen' ? 'Završen' : 'Planiran'}</span></div>
      <p class="lk-datum">${escapeHtml(huntDateText(lov.datum))}</p>
      <div class="sk-statovi">
        <div data-stat="prisutnih"><b>${ucesnici.length}</b><span>prisutnih</span></div>
        ${live ? `<div data-stat="aktivnih"><b>${aktivnih}</b><span>aktivnih sada</span></div>` : ''}
        <div data-stat="stanova"><b>${stanovi.length}</b><span>stanova</span></div>
      </div>
      ${mineAssign ? `<p>Moja uloga: ${escapeHtml(U_LOVU[mineAssign.uloga] || mineAssign.uloga)}${stan ? `, stan ${stan.broj}` : ''}</p>` : ''}
      ${live ? `<p class="sitno">Odstrel u lovu: ${odstrel.length ? odstrel.map((x) => `${escapeHtml(lookupNaziv(vrste, x.vrsta))}: ${x.komada} kom., ${escapeHtml(formatDecimalBs(Math.round(x.tezina * 10) / 10))} kg`).join('; ') : 'još nema'} · SOS poruka: ${extra.sos.length}</p>` : ''}
      <label class="red-check"><input type="checkbox" data-trag="${escapeHtml(lov.id)}" data-live="${live}"${traceOn ? ' checked' : ''}> Prikaži trag kretanja lovaca sekcije</label>
      <button type="button" class="dugme glavno" data-akcija="raspored" data-lov="${escapeHtml(lov.id)}">Raspored na karti</button>
      ${huntControlsHtml(o)}`;
}

// Jedan način crtanja razgovora za sekciju i rukovodstvo: naslovi dana, ime i inicijali samo na prvoj poruci niza.
export function conversationHtml(list, { showHunt, myId, nameOf }) {
  return conversationItems(list).map((it) => {
    if (it.dan) return `<div class="poruka-dan"><span>${escapeHtml(it.dan)}</span></div>`;
    const m = it.poruka;
    const mine = m.autor_id === myId;
    const name = mine ? 'Ti' : nameOf(m.autor_id);
    const head = it.prva ? `<small>${escapeHtml(name)} · ${escapeHtml(formatMessageTime(m.created_at))}${m.sinhronizovano === false ? ' · čeka slanje' : ''}${showHunt && m.lov_id ? ' · u lovu' : ''}</small>`
      : `<small class="poruka-vrijeme">${escapeHtml(formatMessageTime(m.created_at))}${m.sinhronizovano === false ? ' · čeka slanje' : ''}</small>`;
    const av = !mine && it.prva ? `<span class="poruka-av" aria-hidden="true">${escapeHtml(initialsOf(name))}</span>` : '';
    return `<div class="poruka-red${mine ? ' moja' : ''}${it.prva ? '' : ' nastavak'}" data-id="${escapeHtml(m.id)}">${av}${head}${escapeHtml(m.tekst)}</div>`;
  }).join('');
}

const ULOGE_CLANA = { grupovodja: 'Lovovođa sekcije', lovocuvar: 'Lovočuvar revira', clan: 'Član' };

// Redovi lovaca sekcije. o = { actOf, myId, st, lovCounts (Map), avatarOf(id), canPing(st, uloga, myId, id), total }
export function membersHtml(shown, o) {
  const { actOf, myId, st, lovCounts, avatarOf, canPing, total } = o;
  return shown.map((r) => {
    const a = actOf(r.id);
    const ja = r.id === myId;
    const av = avatarOf(r.id);
    return `<li class="clan-red" data-uid="${escapeHtml(r.id)}" data-stanje="${a.stanje}" data-uloga="${r.uloga}">
        <span class="sk-avatar${av ? ' ima-sliku' : ''}" aria-hidden="true"${av ? ` style="background-image:url('${av}')"` : ''}>${av ? '' : escapeHtml(initialsOf(r.ime))}</span>
        <div class="clan-tekst"><b>${escapeHtml(r.ime)}${ja ? ' (ti)' : ''}</b>
          <span class="sitno"><span class="sk-znacka" data-uloga="${r.uloga}">${escapeHtml(ULOGE_CLANA[r.uloga])}</span>${a.uloga ? ` · u lovu: ${escapeHtml(U_LOVU[a.uloga] || a.uloga)}` : ''} · <span class="sk-lovova">${escapeHtml(huntsText(lovCounts.get(r.id) || 0))}</span></span>
          <span class="sitno aktivnost">${escapeHtml(activityText(a))}</span></div>
        <div class="clan-akcije">
          ${a.zadnje && Number.isFinite(a.lat) ? '<button type="button" class="dugme" data-akcija="na-karti">Na karti</button>' : ''}
          ${ja ? '' : '<button type="button" class="dugme" data-akcija="poruka">Poruka</button>'}
          ${canPing(st, r.uloga, myId, r.id) ? '<button type="button" class="dugme" data-akcija="ping">Gdje si?</button>' : ''}
        </div>
      </li>`;
  }).join('') || `<li class="sitno">${total ? 'Nijedan lovac ne odgovara pretrazi.' : 'Nema članova.'}</li>`;
}

// Grupe sekcije. m = { groups, ungrouped, manage, myId, candidates, assignable }. Grupa nema naziv — prepoznaje se po grupovođi.
export function groupsHtml(m) {
  const { groups, ungrouped, manage, myId, candidates, assignable } = m;
  const opts = (list) => list.map((g) => `<option value="${escapeHtml(g.id)}">${escapeHtml(g.grupovodja)}</option>`).join('');
  const assign = (id) => (assignable.length
    ? `<span class="sk-grupa-dodjela"><select data-grupa-izbor aria-label="Grupa (grupovođa)">${opts(assignable)}</select>
        <button type="button" class="dugme" data-akcija="grupa-dodijeli" data-uid="${escapeHtml(id)}">Dodaj u grupu</button></span>` : '');
  const grupa = (g) => `<li class="sk-grupa" data-grupa="${escapeHtml(g.id)}">
      <div class="sk-grupa-glava"><b>Grupa — grupovođa ${escapeHtml(g.grupovodja)}</b><span class="sitno"> · ${g.clanovi.length} lovaca</span>
        ${manage ? `<button type="button" class="dugme" data-akcija="grupa-ukloni" data-grupa="${escapeHtml(g.id)}">Ukloni grupu</button>` : ''}</div>
      ${g.grupovodja_id === myId ? `<button type="button" class="dugme sk-dozvola" data-akcija="grupa-dozvola" data-grupa="${escapeHtml(g.id)}" data-nova="${g.dozvola ? 'false' : 'true'}" aria-pressed="${g.dozvola}">Lovovođa sekcije i viši smiju organizovati lov za moju grupu: ${g.dozvola ? 'DA' : 'NE'}</button>`
        : `<p class="sitno">Lov za grupu organizuje grupovođa; lovovođa sekcije i viši samo uz njegovo dopuštenje (${g.dozvola ? 'dato' : 'nije dato'}).</p>`}
      <ul class="sk-grupa-clanovi">${g.clanovi.map((c) => `<li data-uid="${escapeHtml(c.id)}">${escapeHtml(c.ime)}${c.id === g.grupovodja_id ? ' <span class="sitno">(grupovođa)</span>' : ''}${manage || g.grupovodja_id === myId ? ` <button type="button" class="dugme" data-akcija="grupa-izbaci" data-uid="${escapeHtml(c.id)}">Izvadi iz grupe</button>` : ''}</li>`).join('') || '<li class="sitno">Nema lovaca u grupi.</li>'}</ul>
    </li>`;
  // Lovac je sam izabrao grupu (želja): upravljač ili grupovođa te grupe je odobrava jednim dodirom.
  const zelja = (c) => {
    const g = c.zeljena && groups.find((x) => x.id === c.zeljena);
    if (!g) return '';
    const smije = manage || g.grupovodja_id === myId;
    return `<span class="sk-zelja sitno">želi u grupu: grupovođa ${escapeHtml(g.grupovodja)}</span>${smije ? ` <button type="button" class="dugme glavno" data-akcija="grupa-odobri" data-uid="${escapeHtml(c.id)}" data-grupa="${escapeHtml(g.id)}">Odobri</button>` : ''}`;
  };
  const bez = ungrouped.length
    ? `<h4>Bez grupe (${ungrouped.length})</h4><ul class="sk-bez-grupe">${ungrouped.map((c) => `<li data-uid="${escapeHtml(c.id)}">${escapeHtml(c.ime)}${c.id === myId ? ' (ti)' : ''} ${zelja(c)} ${assign(c.id)}</li>`).join('')}</ul>`
    : '';
  const nova = manage
    ? `<div class="sk-grupa-nova"><select id="sk-grupa-gv" aria-label="Grupovođa nove grupe">${candidates.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.ime)}</option>`).join('')}</select>
        <button type="button" class="dugme" data-akcija="grupa-nova"${candidates.length ? '' : ' disabled'}>Napravi grupu</button></div>`
    : '';
  return `${groups.map(grupa).join('') || '<p class="sitno">Još nema grupa.</p>'}${bez}${nova}`;
}
