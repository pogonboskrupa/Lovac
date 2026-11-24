// Znak na dugmetu "Moja lokacija" dok dijelim lokaciju sa lovcima (u lovu ili sa sekcijom):
// blago podrhtava i prelazi iz tirkizne u crvenu, da se dijeljenje ne zaboravi uključeno.
const izvori = new Set();

export function isSharingAny() {
  return izvori.size > 0;
}

export function setSharing(izvor, aktivno) {
  if (aktivno) izvori.add(izvor); else izvori.delete(izvor);
  const b = document.getElementById('btn-moja-lokacija');
  if (!b) return;
  b.classList.toggle('dijeli-lokaciju', izvori.size > 0);
  b.dataset.dijeli = [...izvori].join(' ');
  b.setAttribute('aria-label', izvori.size ? 'Moja lokacija (dijeliš lokaciju sa lovcima)' : 'Moja lokacija');
}
