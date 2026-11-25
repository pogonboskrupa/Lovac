// Crtanje markera lovaca na karti: veličina po razmjeri i broju lovaca, a oni koji bi se prekrili su jedan znak sa brojem.
// Zajedničko za lov (uzivo-ui), dijeljenje sa sekcijom i sa izabranim lovcima. Dodir na grupu uvećava kartu do lovaca;
// ako se više ne može uvećati (ili su na istoj tački), pokazuje spisak imena.

import { initialsOf } from './lokacija.js';
import { escapeHtml } from './ui.js';
import { markerDiameter, showInitials, clusterMembers, groupDiameter } from './marker-velicina.js';

const STATE_TEXT = { uzivo: 'uživo', staro: 'staro', 'bez-signala': 'bez signala' };

// member: { id, ime, lat, lon, t, stanje, uloga? }; popupFor(member) vraća sadržaj kartice (element ili tekst).
export function createMemberLayer(L, map, layer, { cssClass = '', popupFor }) {
  let last = [];

  const groupPopup = (g) => `<div class="uc-grupa-popup"><b>${g.members.length} lovaca na istom mjestu</b><ul>${
    g.members.map((m) => `<li>${escapeHtml(m.ime)}${STATE_TEXT[m.stanje] ? ` <span class="sitno">· ${STATE_TEXT[m.stanje]}</span>` : ''}</li>`).join('')}</ul></div>`;

  const openGroup = (g, marker) => {
    const before = map.getZoom();
    const bounds = L.latLngBounds(g.members.map((m) => [m.lat, m.lon]));
    if (bounds.getNorthEast().distanceTo(bounds.getSouthWest()) > 3 && before < map.getMaxZoom()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: Math.min(map.getMaxZoom(), before + 3), animate: false });
    }
    if (map.getZoom() <= before) marker.bindPopup(groupPopup(g)).openPopup();
  };

  const render = () => {
    layer.clearLayers();
    const zoom = map.getZoom();
    const d = markerDiameter(zoom, last.length);
    const project = (m) => map.latLngToContainerPoint([m.lat, m.lon]);
    for (const g of clusterMembers(last, project, d)) {
      if (g.members.length === 1) {
        const m = g.members[0];
        const icon = L.divIcon({
          className: 'uc-ikona',
          html: `<span class="uc-marker ${cssClass}" style="--d:${d}px" data-uid="${escapeHtml(m.id)}" data-stanje="${m.stanje}"${m.uloga ? ` data-uloga="${m.uloga}"` : ''}>${showInitials(d) ? escapeHtml(initialsOf(m.ime)) : ''}</span>`,
          iconSize: [d, d], iconAnchor: [d / 2, d / 2],
        });
        L.marker([m.lat, m.lon], { icon, keyboard: false, clan: { korisnik_id: m.id, lat: m.lat, lon: m.lon, t: m.t } })
          .bindPopup(() => popupFor(m), { closeButton: true, autoPan: true }).addTo(layer);
      } else {
        const gd = groupDiameter(d);
        const icon = L.divIcon({
          className: 'uc-ikona',
          html: `<span class="uc-marker uc-grupa ${cssClass}" style="--d:${gd}px" data-broj="${g.members.length}" aria-label="${g.members.length} lovaca">${g.members.length}</span>`,
          iconSize: [gd, gd], iconAnchor: [gd / 2, gd / 2],
        });
        const marker = L.marker([g.lat, g.lon], { icon, keyboard: false }).addTo(layer);
        marker.on('click', () => openGroup(g, marker));
      }
    }
  };

  map.on('zoomend', render);
  return { draw(members) { last = members; render(); }, redraw: render };
}
