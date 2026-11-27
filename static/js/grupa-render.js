// Moja grupa: crtanje HTML-a (čiste funkcije, sve što treba stiže kroz argument; testira se u Node-u).
import { activityText } from './sekcija-podaci.js';
import { huntDateText } from './lov.js';
import { initialsOf } from './lokacija.js';
import { escapeHtml } from './ui.js';

const STATUS = { planiran: 'Planiran', u_toku: 'U TOKU', zavrsen: 'Završen' };
const STANJE = { prisutan: 'Prisutan', ne: 'Ne dolazi', nema: 'Nije odgovorio' };

// Kartica lova grupe.
// o = { cur, grupaId, att, my (myAttendance), manage, canCreate, nameOf, aktivnih, odgovor }
export function groupHuntHtml(o) {
  const { cur, grupaId, att, my, manage, canCreate, aktivnih } = o;
  const novi = canCreate ? '<button type="button" class="dugme glavno" data-akcija="gr-novi">Novi lov grupe</button>' : '';
  if (!cur) {
    return `<p>Nema lova grupe u toku ni planiranog.</p>${canCreate ? '' : '<p class="sitno">Lov grupe organizuje grupovođa. Kad ga napravi, ovdje javljaš dolaziš li.</p>'}${novi}`;
  }
  const { lov } = cur.zapis;
  const live = lov.status === 'u_toku';
  const grupni = lov.grupa_id === grupaId;
  const odgovorna = lov.status !== 'zavrsen';
  const mojBlok = !odgovorna ? '' : my.stanje === 'prisutan'
    ? `<p class="gr-moje" data-stanje="prisutan"><b>Prisutan si</b>${my.mozeOdjava ? '' : ' <span class="sitno">(dodao te grupovođa)</span>'}</p>
       ${my.mozeOdjava ? '<button type="button" class="dugme" data-akcija="gr-ne">Ne dolazim</button>' : ''}`
    : `<p class="gr-moje" data-stanje="${my.stanje}"><b>${my.stanje === 'ne' ? 'Javio si da ne dolaziš' : 'Još nisi javio dolaziš li'}</b></p>
       <div class="odaziv-dugmad"><button type="button" class="dugme glavno" data-akcija="gr-dolazim">Dolazim</button>${my.stanje === 'ne' ? '' : '<button type="button" class="dugme" data-akcija="gr-ne">Ne dolazim</button>'}</div>`;
  const redovi = att.rows.map((r) => `<li class="gr-prisustvo" data-uid="${escapeHtml(r.id)}" data-stanje="${r.stanje}"><span>${escapeHtml(r.ime)}</span><span class="sitno">${STANJE[r.stanje]}</span></li>`).join('');
  return `<div class="sk-lov-glava"><b>${escapeHtml(lov.naziv)}</b><span class="lov-status" data-status="${lov.status}">${STATUS[lov.status] || lov.status}</span></div>
    <p class="lk-datum">${escapeHtml(huntDateText(lov.datum))} · ${grupni ? 'lov grupe' : 'lov cijele sekcije'}</p>
    <div class="sk-statovi">
      <div data-stat="prisutnih"><b>${att.prisutnih}</b><span>prisutnih</span></div>
      <div data-stat="nema"><b>${att.nema}</b><span>bez odgovora</span></div>
      <div data-stat="ne"><b>${att.ne}</b><span>ne dolazi</span></div>
      ${live ? `<div data-stat="aktivnih"><b>${aktivnih}</b><span>aktivnih sada</span></div>` : ''}
    </div>
    ${mojBlok}
    <button type="button" class="dugme glavno" data-akcija="gr-raspored" data-lov="${escapeHtml(lov.id)}">Raspored na karti</button>
    ${manage && lov.status === 'planiran' ? `<button type="button" class="dugme glavno" data-akcija="gr-pokreni" data-lov="${escapeHtml(lov.id)}">Pokreni lov</button>` : ''}
    ${manage && live ? `<button type="button" class="dugme" data-akcija="gr-zavrsi" data-lov="${escapeHtml(lov.id)}">Završi lov</button>` : ''}
    ${novi}
    <details class="gr-ko-dolazi"><summary>Ko dolazi (${att.prisutnih} od ${att.ukupno})</summary><ul class="spisak">${redovi || '<li class="sitno">Nema lovaca u grupi.</li>'}</ul></details>`;
}

// Lovci grupe. o = { myId, st, canPing, actOf(id), attState(id) | null, avatarOf(id), lovCount(id) }
export function groupMembersHtml(members, o) {
  const { myId, st, canPing, actOf, attState, avatarOf } = o;
  return members.map((m) => {
    const a = actOf(m.id);
    const av = avatarOf(m.id);
    const ja = m.id === myId;
    const stanje = attState ? attState(m.id) : null;
    return `<li class="clan-red" data-uid="${escapeHtml(m.id)}" data-stanje="${a.stanje}">
      <span class="sk-avatar${av ? ' ima-sliku' : ''}" aria-hidden="true"${av ? ` style="background-image:url('${av}')"` : ''}>${av ? '' : escapeHtml(initialsOf(m.ime))}</span>
      <div class="clan-tekst"><b>${escapeHtml(m.ime)}${ja ? ' (ti)' : ''}</b>
        <span class="sitno">${m.grupovodja ? '<span class="sk-znacka" data-uloga="grupovodja">Grupovođa</span>' : 'Lovac'}${stanje ? ` · ${escapeHtml(STANJE[stanje])}` : ''}</span>
        <span class="sitno aktivnost">${escapeHtml(activityText(a))}</span></div>
      <div class="clan-akcije">
        ${a.zadnje && Number.isFinite(a.lat) ? '<button type="button" class="dugme" data-akcija="gr-na-karti">Na karti</button>' : ''}
        ${ja ? '' : '<button type="button" class="dugme" data-akcija="gr-poruka">Poruka</button>'}
        ${canPing(st, 'clan', myId, m.id) ? '<button type="button" class="dugme" data-akcija="gr-ping">Gdje si?</button>' : ''}
      </div></li>`;
  }).join('') || '<li class="sitno">U grupi još nema lovaca.</li>';
}

export function groupStatsHtml(s) {
  if (!s.lovova) return '<p class="sitno">Grupa još nema održanih lovova u kojima je lov bio vezan za nju. Statistika se računa iz lovova na telefonu.</p>';
  return `<div class="sk-statovi"><div data-stat="lovova"><b>${s.lovova}</b><span>lovova</span></div>
      <div data-stat="prosjek"><b>${s.prosjek} %</b><span>prosječno prisutnih</span></div></div>
    <ul class="spisak gr-po-clanu">${s.poClanu.map((r) => `<li data-uid="${escapeHtml(r.id)}"><div class="st-traka" data-pct="${r.procenat}"><span>${escapeHtml(r.ime)}</span><span class="st-traka-bar"><i style="width:${r.procenat}%"></i></span><b>${r.lovova} / ${s.lovova}</b></div></li>`).join('')}</ul>
    <p class="sitno">Računa se iz lovova grupe sačuvanih na ovom telefonu i današnjeg sastava grupe.</p>`;
}
