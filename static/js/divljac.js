// Divljač: osnovne karakteristike, biologija i ono što je značajno za lov (statični sadržaj + pretraga).
// Brojke su orijentacione (stručna literatura, naš region). Propisi, lovostaj i datumi se NE navode ovdje:
// njih unosi administrator društva (Danas → "Šta se danas smije loviti").

import { matchesQuery } from './pretraga.js';

export const DIVLJAC_NAPOMENA = 'Opšte informacije za orijentaciju; brojke variraju po području i godini. Ne zamjenjuju propise, lovnu osnovu društva, lovočuvara ni stručnu literaturu. Datume lovostaja unosi administrator društva.';

export const VRSTE_DIVLJACI = [
  {
    kod: 'divlja_svinja', naziv: 'Divlja svinja (vepar)', latinski: 'Sus scrofa', grupa: 'Krupna divljač',
    kratko: 'Najprilagodljivija krupna divljač: svejed, noćni, društven. Ranjena je opasna.',
    brojke: [['Težina', 'vepar 80–150 kg (rijetko preko 200), krmača 60–100 kg'], ['Visina grebena', '55–110 cm'], ['Vijek', '8–10 god. (rijetko do 15)']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Zbijeno tijelo, velika glava, čekinjava tamna dlaka (zimi gusta potkošulja).',
        'Vepar ima ocale (donji očnjaci) koje rastu cijeli život; ispod kože na ramenu ima "štit" od zadebljane kože.',
        'Prasad su prvih mjeseci prugasta (crvenkastosmeđa sa svijetlim prugama).',
      ]],
      ['Biologija i razmnožavanje', [
        'Parenje ("bukanje") uglavnom od novembra do januara; skotnost traje oko 114–115 dana.',
        'Prasenje najčešće mart–maj, 4–8 prasadi; mlade krmače daju manje, starije više. Spolna zrelost zavisi od težine, već u prvoj godini.',
        'Krmače sa prasadi i podmlatkom čine krdo; stariji veprovi su uglavnom usamljenici i pridružuju se krdu u parenju.',
      ]],
      ['Ponašanje i prehrana', [
        'Pretežno noćna i sumračna; dan provodi u gustišu (ležaj), na tihim mjestima.',
        'Odličan njuh i dobar sluh, slab vid: miris vjetra odlučuje o uspjehu prilaza.',
        'Svejed: žir, bukvica, kesten, kukuruz, korijenje i gomolji, crvi, jaja, strvina.',
        'Valja se u kaljužama (blato štiti od parazita) i trlja o stabla ("tarišta") — vidljivi znakovi na terenu.',
      ]],
      ['Tragovi i znakovi', [
        'Prevrnuta (ritana) zemlja i travnjaci, kaljuže, tarišta sa blatom i dlakom na stablima.',
        'Otisak papaka je širi i zaobljeniji; u mekom tlu se vide i otisci pobočnih papaka.',
      ]],
      ['Značajno za lov', [
        'Najproduktivnije u sumrak i noću: čeka na prelazima, uz njive i hranilišta (mamišta).',
        'Pogon sa psima je čest; zahtijeva strogu disciplinu strijelaca, sektore pucanja i vođu lova.',
        'Ranjena divlja svinja (naročito vepar i krmača sa prasadi) je opasna: ne prilaziti ranjenoj životinji bez psa i pratnje; potraga uz psa krvara je obavezna.',
        'Pucati u komoru (srce i pluća, iza plećke); kod noćnog lova provjeriti šta je iza cilja.',
        'Meso se prije upotrebe mora pregledati na trihinelu. Pokazuje li životinja bolest ili nađeš leševe, odmah prijavi veterinarskoj službi i lovočuvaru (afrička svinjska kuga).',
      ]],
    ],
  },
  {
    kod: 'srna', naziv: 'Srndać (srna obična)', latinski: 'Capreolus capreolus', grupa: 'Krupna divljač',
    kratko: 'Najmanja jelenska divljač: srndać nosi rogove, krije se, aktivan u zoru i sumrak.',
    brojke: [['Težina', '18–30 kg (srndać obično 22–28 kg)'], ['Visina grebena', '65–75 cm'], ['Vijek', 'do 12–15 god.']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Ljeti crvenkastosmeđa, zimi sivosmeđa; bijelo "ogledalo" na zadnjici.',
        'Rogovlje nosi samo srndać; šestak ima po tri ogranka na svakoj strani. Srna nema rogove.',
        'Srndać rogove odbacuje u jesen (oktobar–decembar) i novo rogovlje raste preko zime; do proljeća se čisti od baršuna (kože).',
      ]],
      ['Biologija i razmnožavanje', [
        'Parenje ljeti (jul–avgust), a razvoj zametka kasni (odgođena implantacija); laneta se rađaju u maju–junu, najčešće jedno ili dva.',
        'Laneta imaju bijele pjege i prvih sedmica leže mirno u travi: ne diraj ih, majka je u blizini.',
        'Srndać je teritorijalan (proljeće–ljeto); zimi se srne okupljaju u rudo.',
      ]],
      ['Ponašanje i prehrana', [
        'Zora i sumrak su vrijeme najveće aktivnosti; dan provodi odmarajući i preživajući u zaklonu.',
        'Probirljiva: mladice, pupoljci, lišće, trave, bobice, žir; zimi pupoljci i ostaci na njivama.',
        'Uznemirena "laje" (kratak oštar glas) i bježi pokazujući ogledalo.',
      ]],
      ['Tragovi i znakovi', [
        'Mali uski papci (oko 4–5 cm), ležaji u travi i šiblju, ogrebene mladice (štavljanje rogova) i "stazice" uz ivice šume.',
      ]],
      ['Značajno za lov', [
        'Prilaz ili čeka u zoru i pred sumrak; u ljetnom parenju srndać se može dozivati.',
        'Odstrel je selektivan (po spolu, dobi i kondiciji, prema planu društva): pažljivo odredi spol i dob prije pucanja.',
        'Pucati u komoru; pogodak u trbuh traži potragu uz psa krvara.',
      ]],
    ],
  },
  {
    kod: 'medvjed', naziv: 'Mrki medvjed', latinski: 'Ursus arctos', grupa: 'Krupna divljač',
    kratko: 'Najveća kopnena zvijer kod nas. Plašljiv, ali opasan kad je iznenađen ili brani mlade.',
    brojke: [['Težina', 'mužjak 150–300 kg, ženka 80–150 kg'], ['Visina u ramenu', '90–110 cm'], ['Vijek', '20–25 god.']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Zdepast, smeđ (od svijetle do skoro crne), široka glava, kratak rep, kandže do 8 cm (ne uvlače se).',
        'Hoda cijelim stopalom (plantigradno); može se uspraviti da bolje nanjuši i vidi.',
      ]],
      ['Biologija i razmnožavanje', [
        'Parenje maj–juli; mladunci (1–3) se rađaju u jazbini u januaru–februaru, teški samo oko pola kilograma.',
        'Zimski san (nepotpuna hibernacija): jazbina od novembra/decembra do marta/aprila. Medvjedica s mladima ostaje sa njima oko dvije godine.',
      ]],
      ['Ponašanje i prehrana', [
        'Svejed, većinom biljna hrana: bobice, žir, bukvica, voće, trave, korijenje, ali i insekti (mravi), strvine i povremeno plijen.',
        'Aktivan u sumrak i noću, odlično njuši i čuje; zalazi do voćnjaka, košnica i smetlišta.',
        'Izbjegava ljude; opasan kad je iznenađen na kratkoj udaljenosti, uz strvinu ili sa mladima.',
      ]],
      ['Tragovi i znakovi', [
        'Otisak stopala sa pet prstiju i kandžama (stopalo 15–25 cm), razderani trulo drvo i mravinjaci, ogrebana i ugrizena stabla, izmet pun bobica ili žira.',
      ]],
      ['Značajno za lov', [
        'Mrki medvjed je u većem dijelu Evrope strogo zaštićen. Da li se, koliko i kada smije loviti određuju važeći propisi i odluka nadležnih: bez pisanog odobrenja se ne lovi.',
        'Uočenog medvjeda, tragove ili štetu prijavi lovočuvaru.',
        'Susret: ostani miran, ne trči, polako se povlači i govori mirno; ne staj između majke i mladih; psa drži na uzici.',
      ]],
    ],
  },
  {
    kod: 'vuk', naziv: 'Vuk', latinski: 'Canis lupus', grupa: 'Zvijer',
    kratko: 'Čopor, noćni lovac na preživare; vrlo oprezan i teško se vidi.',
    brojke: [['Težina', '25–45 kg (mužjaci veći)'], ['Visina grebena', '60–80 cm'], ['Vijek', '8–13 god. u divljini']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Sivosmeđa dlaka, duže noge i uži prsni koš od psa, rep visi ravno i ne savija se preko leđa.',
      ]],
      ['Biologija i razmnožavanje', [
        'Čopor je porodica: par i mladunci iz prethodne i tekuće godine (obično 4–8 životinja).',
        'Parenje februar–mart, skotnost oko 63 dana; 4–6 mladunaca u jazbini u aprilu–maju.',
        'Teritorija velika (desetine do stotine km²); noću prelazi i po 20–50 km.',
      ]],
      ['Ponašanje i prehrana', [
        'Lovi srne, jelene i divlje svinje, hvata bolesne i slabe; koristi i strvine, a povremeno napada stoku.',
        'Aktivan noću i u sumrak, dan provodi sakriven; glasa se zavijanjem radi komunikacije.',
      ]],
      ['Tragovi i znakovi', [
        'Ovalan otisak sa četiri prsta i kandžama (oko 8–10 cm), trag ide u pravoj liniji (zadnja šapa staje u otisak prednje); izmet sa dlakom i kostima.',
        'Od psa se razlikuje pravolinijskim hodom, većim otiskom i time što trag ide kroz šumu mimo ljudskih staza.',
      ]],
      ['Značajno za lov', [
        'Vuk je u većem dijelu Evrope strogo zaštićen. Odstrel zavisi od važećih propisa i odobrenja: bez njih se ne lovi.',
        'Tragove, zavijanje, plijen ili štetu na stoci prijavi lovočuvaru; fotografiši trag sa predmetom za razmjer.',
      ]],
    ],
  },
  {
    kod: 'cagalj', naziv: 'Čagalj (zlatni šakal)', latinski: 'Canis aureus', grupa: 'Zvijer',
    kratko: 'Manji pripadnik pasa, glasan u sumrak; širi se u nizinama i uz vode.',
    brojke: [['Težina', '8–15 kg'], ['Visina grebena', '40–50 cm'], ['Vijek', '8–12 god.']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Veći od lisice, manji od vuka, kraćih nogu; žućkastosiva dlaka, kratak rep (oko 20–25 cm) sa tamnim vrhom.',
      ]],
      ['Biologija i razmnožavanje', [
        'Živi u paru sa potomcima; parenje januar–mart, skotnost oko 63 dana, 2–4 (do 6) mladunaca u aprilu–maju u jazbini.',
        'Posljednjih decenija se širi na Balkanu, naročito u poljoprivrednim nizijama i uz rijeke.',
      ]],
      ['Ponašanje i prehrana', [
        'Svejed: glodari, ptice, strvine, voće, kukuruz, otpad; može loviti sitnu divljač i perad.',
        'Aktivan u sumrak i noću; karakteristično glasno zavijanje i cvilež čopora uveče.',
      ]],
      ['Tragovi i znakovi', [
        'Otisak manji od vučjeg (oko 5–6 cm), trag ide u liniji; izmet sa dlakom, perjem i sjemenjem.',
      ]],
      ['Značajno za lov', [
        'Status (lovna ili zaštićena vrsta, vrijeme i način lova) određuju propisi koje vodi administrator društva: provjeri kod lovočuvara prije svakog odstrela.',
        'Uobičajeno: čeka na mamištu ili strvini u sumrak i noću, ili dozivanje snimkom/pištaljkom; pazi da ne zamijeniš sa lisicom, psom ili mladim vukom.',
      ]],
    ],
  },
  {
    kod: 'fazan', naziv: 'Fazan', latinski: 'Phasianus colchicus', grupa: 'Sitna divljač (pernata)',
    kratko: 'Šarena ptica otvorenog krajolika, uzima se iz uzgoja i naseljava u lovišta.',
    brojke: [['Težina', 'pijetao 1–1,5 kg, koka 0,8–1 kg'], ['Dužina', 'pijetao 70–90 cm sa repom'], ['Vijek', '2–4 god. u divljini']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Pijetao: bakarnocrveno perje, zeleno-ljubičasta glava, crvena kožica oko oka, dug šiljat rep. Koka: neupadljiva smeđa i pjegava.',
      ]],
      ['Biologija i razmnožavanje', [
        'Poligamija: pijetao ima "harem" od nekoliko koka. Parenje u proljeće (mart–maj); gnijezdo na tlu, u travi ili usjevu.',
        'Koka snese oko 8–14 jaja i leži 23–25 dana; pilići ostaju uz majku nekoliko sedmica.',
        'Noći provodi na drveću ili u gustom šiblju, danju u polju, uz ivice bara i trstika.',
      ]],
      ['Ponašanje i prehrana', [
        'Zrnevlje, sjemenje korova, kukuruz, kukci, bobice, pupoljci i mladice.',
        'Radije trči nego leti; pred pasom ili ljudima uzleti naglo uz jak zvuk krila. Pijetao se javlja oštrim "kukurikanjem".',
      ]],
      ['Tragovi i znakovi', [
        'Tragovi stopala sa tri prednja prsta, ostaci kupanja u prašini ("kupališta"), perje, pijetlovi na rubu njiva u zoru.',
      ]],
      ['Značajno za lov', [
        'Najčešće se lovi uz pse ptičare ili potjerom uz liniju strijelaca; puca se tek kad ptica uzleti i kad je jasno da je pijetao, ako to propisi traže.',
        'Populacija često zavisi od naseljavanja iz uzgoja, uz stanište sa zaklonom (živice, trska, neprekošene trake).',
        'Pojedini lovci pucaju samo na pijetlove da štite leglo; slijedi pravila društva.',
      ]],
    ],
  },
  {
    kod: 'zec', naziv: 'Zec obični', latinski: 'Lepus europaeus', grupa: 'Sitna divljač',
    kratko: 'Brz stanovnik otvorenog polja; ne kopa jazbinu nego leži u "ležaju".',
    brojke: [['Težina', '3–5 kg (do 6)'], ['Dužina tijela', '60–70 cm'], ['Brzina', 'do oko 60–70 km/h']],
    sekcije: [
      ['Izgled i karakteristike', [
        'Duge uši sa crnim vrhovima, duge zadnje noge, smeđesiva dlaka; rep odozgo crn.',
      ]],
      ['Biologija i razmnožavanje', [
        'Razmnožava se od kasne zime do jeseni, 3–4 legla godišnje; skotnost oko 42 dana, 1–5 mladih.',
        'Mladi se rađaju sa dlakom i otvorenim očima i nisu u jazbini, nego leže sami u travi; majka ih doji jednom dnevno, pred noć.',
        'Brojnost jako zavisi od vremena u proljeće, grabežljivaca, bolesti i načina obrade zemljišta.',
      ]],
      ['Ponašanje i prehrana', [
        'Aktivan u sumrak i noću; dan provodi u "ležaju" (plitka udubina u zemlji ili travi) i često se ne pomjera dok se čovjek ne približi na nekoliko koraka.',
        'Trave, djetelina, usjevi i povrće; zimi kora i pupoljci mladih stabala.',
      ]],
      ['Tragovi i znakovi', [
        'Ležaji, tragovi u snijegu (zadnje noge ispred prednjih), ogrizene mladice i voćke, izmet u obliku okruglih kuglica.',
      ]],
      ['Značajno za lov', [
        'Najčešće se lovi pogonom (linija strijelaca i gonjenje) ili dočekom; jutarnji sati su najproduktivniji.',
        'Zbog gubitka staništa brojnost u Evropi opada: planiraj odstrel prema procjeni brojnosti koju radi društvo.',
        'U pogonu važe pravila: samo na svom stanu, uz sektore pucanja i bez pucanja nisko prema liniji.',
      ]],
    ],
  },
];

export function allSpeciesText(v) {
  return [v.naziv, v.latinski, v.grupa, v.kratko, ...v.brojke.flat(), ...v.sekcije.flatMap(([n, t]) => [n, ...t])];
}

export function filterSpecies(query, list = VRSTE_DIVLJACI) {
  return list.filter((v) => matchesQuery(allSpeciesText(v), query));
}
