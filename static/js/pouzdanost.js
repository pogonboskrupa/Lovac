// Pouzdan rad na telefonu (čista logika): obavijesti i izuzeće od optimizacije baterije.

// notif / baterija: true | false | null (nepoznato); hasBridge: radi li u aplikaciji na telefonu.
export function reliabilityItems({ hasBridge, notif, battery }) {
  if (!hasBridge) {
    return [{ id: 'aplikacija', stanje: 'nepoznato', naslov: 'Obavijesti i baterija', tekst: 'Ovo se podešava u aplikaciji na telefonu.' }];
  }
  return [
    {
      id: 'obavijesti', naslov: 'Obavijesti',
      stanje: notif === true ? 'ok' : notif === false ? 'upozorenje' : 'nepoznato',
      tekst: notif === true ? 'Dozvoljene: stižu poruke, SOS i komande lova.'
        : notif === false ? 'Isključene: nećeš vidjeti poruke, SOS ni komande lova dok app nije otvorena.' : 'Stanje se ne može pročitati.',
    },
    {
      id: 'baterija', naslov: 'Optimizacija baterije',
      stanje: battery === true ? 'ok' : battery === false ? 'upozorenje' : 'nepoznato',
      tekst: battery === true ? 'Isključena za ovu aplikaciju: snimanje traga se manje prekida.'
        : battery === false ? 'Uključena: telefon može ugasiti aplikaciju i prekinuti snimanje traga.' : 'Stanje se ne može pročitati.',
    },
  ];
}

export function needsAttention(items) {
  return items.some((i) => i.stanje === 'upozorenje');
}
