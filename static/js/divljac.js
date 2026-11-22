// Divljač: osnovne karakteristike, biologija i ono što je značajno za lov (statični sadržaj + pretraga).
// Brojke su orijentacione (stručna literatura, naš region). Propisi, lovostaj i datumi se NE navode ovdje:
// njih unosi administrator društva (Danas → "Šta se danas smije loviti").

import { matchesQuery } from './pretraga.js';

export const DIVLJAC_NAPOMENA = 'Opšte informacije za orijentaciju; brojke variraju po području i godini. Ne zamjenjuju propise, lovnu osnovu društva, lovočuvara ni stručnu literaturu. Datume lovostaja unosi administrator društva.';

const OSNOVA = [
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
    kod: 'medvjed', naziv: 'Mrki medvjed', latinski: 'Ursus arctos', grupa: 'Zvijer',
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

// Dopune po vrsti: biološki kalendar (NIJE lovostaj), dnevna aktivnost (0–3) i dodatni dijelovi sadržaja.
const DOPUNE = {
  divlja_svinja: {
    kalendar: [['parenje', 'Parenje (bukanje)', [11, 12, 1]], ['mladi', 'Prasenje', [3, 4, 5]]],
    aktivnost: { zora: 2, dan: 1, sumrak: 3, noc: 3 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'Vepar: zdepast, krupna glava i vidljive ocale; krmača je vitkija, sa vidljivim sisama kad doji. Dob se najpouzdanije procjenjuje po zubima (izrast trajnih zuba) i razvijenosti ocala.',
        'Prasad su prugasta prvih mjeseci, zatim smeđa; "nazime" su mlade životinje u drugoj godini.',
        'Lovac mora prepoznati vodeću krmaču sa prasadi: sa čeke ili u pogonu ne pucaj na grupu bez jasnog razlikovanja životinje.',
      ]],
      ['Zdravlje i bolesti', [
        'Afrička svinjska kuga (ASK) ne prelazi na ljude, ali se lako širi i teško pogađa uzgoj svinja: ugibanje više životinja ili nađeni leševi se odmah prijavljuju veterinarskoj službi i lovočuvaru.',
        'Trihineloza (parazit u mišićima) prenosi se na čovjeka jedenjem nepregledanog mesa: pregled na trihinelu je obavezan prije upotrebe.',
        'Mjere bioosiguranja: ne prenositi dijelove i utrobu između lovišta, oprati i dezinfikovati obuću, nož i vozilo.',
      ]],
      ['Poslije odstrela', [
        'Utrobu izvaditi što prije, a meso ohladiti. Uzorak mišića za pregled na trihinelu daj ovlaštenoj službi.',
        'Otpad i utrobu odloži prema uputi veterinarske službe i lovočuvara (ne ostavljati bilo gdje, naročito u područjima sa ASK-om).',
      ]],
    ],
  },
  srna: {
    kalendar: [['parenje', 'Parenje', [7, 8]], ['mladi', 'Laneta se rađaju', [5, 6]], ['rogovi', 'Rogovlje se mijenja', [10, 11, 12, 1, 2, 3, 4]]],
    aktivnost: { zora: 3, dan: 1, sumrak: 3, noc: 1 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'Srndać ima rogove (mladi srndać tanke, slabo razgranate "šilaše"; stariji jače i biserasto rogovlje), srna nema rogove, a zimi ima pramen dlake ("kitu") ispod ogledala.',
        'Laneta su pjegava prvih sedmica. Dob odraslih najpouzdanije govori stanje zuba.',
        'Prije pucanja uvijek odredi spol i dob: odstrel je selektivan i radi se prema planu društva.',
      ]],
      ['Zdravlje i bolesti', [
        'Česti su nametnici: krpelji, plućni i želučani crvi; slabija životinja, hromost ili ponašanje bez straha su razlog da se oprezno procijeni stanje i prijavi sumnja na bolest.',
        'Strvinu ili ugibanje više životinja prijavi lovočuvaru.',
      ]],
      ['Poslije odstrela', [
        'Utrobu izvaditi što prije, meso ohladiti; rogovlje (trofej) čuvati prema pravilima društva.',
      ]],
    ],
  },
  medvjed: {
    kalendar: [['parenje', 'Parenje', [5, 6, 7]], ['mladi', 'Mladunci se rađaju (u jazbini)', [1, 2]], ['san', 'Zimski san', [11, 12, 1, 2, 3]]],
    aktivnost: { zora: 2, dan: 1, sumrak: 3, noc: 3 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'U prirodi je spol teško odrediti: mužjak je veći i masivnije glave; ženka je često sa mladima.',
        'Mladi ostaju uz majku oko dvije godine: nikad ne prilazi medvjedici sa mladima.',
      ]],
      ['Zdravlje i bolesti', [
        'Medvjed može nositi trihinelu i druge parazite: meso se ne smije upotrijebiti bez pregleda; moguća je i bjesnoća.',
        'Neobično ponašanje (bez straha od ljudi, zalaženje u naselja) prijavi lovočuvaru.',
      ]],
      ['Poslije odstrela', [
        'Ako je odstrel zakonito odobren, o njemu se obavještavaju nadležni; meso na pregled na trihinelu prije upotrebe.',
      ]],
    ],
  },
  vuk: {
    kalendar: [['parenje', 'Parenje', [2, 3]], ['mladi', 'Mladunci u jazbini', [4, 5]]],
    aktivnost: { zora: 2, dan: 1, sumrak: 3, noc: 3 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'Procjena je teška: mužjaci su veći (do oko 45 kg); mlade u prvoj godini odaje kraća njuška i manji otisak.',
      ]],
      ['Zdravlje i bolesti', [
        'Moguća bjesnoća, šuga i paraziti (npr. ehinokok): leš ili životinju koja se ponaša čudno ne diraj golim rukama, nego odmah prijavi lovočuvaru i veterinarskoj službi.',
      ]],
      ['Poslije odstrela', [
        'Ako je odstrel zakonito odobren: rukavice, prijava nadležnima i postupak po uputi veterinarske službe.',
      ]],
    ],
  },
  cagalj: {
    kalendar: [['parenje', 'Parenje', [1, 2, 3]], ['mladi', 'Mladunci u jazbini', [4, 5]]],
    aktivnost: { zora: 2, dan: 1, sumrak: 3, noc: 3 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'Spol se teško razlikuje na terenu; mladi su manji i svjetliji. Oprezno razlikovanje od lisice (manja, duži rep, uže njuška) i mladog vuka (veći).',
      ]],
      ['Zdravlje i bolesti', [
        'Može nositi trihinelu, ehinokok i bjesnoću: koristi rukavice pri rukovanju i meso/preparaciju ne konzumiraj bez veterinarske provjere.',
      ]],
      ['Poslije odstrela', [
        'Postupak i evidencija po pravilima društva; nalaz neobičnog ponašanja ili ugibanja prijavi lovočuvaru.',
      ]],
    ],
  },
  fazan: {
    kalendar: [['parenje', 'Parenje i polaganje jaja', [3, 4, 5]], ['mladi', 'Pilići', [5, 6, 7]]],
    aktivnost: { zora: 3, dan: 2, sumrak: 3, noc: 0 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'Pijetao se prepoznaje po šarenom perju i dugom repu, koka po smeđem pjegavom perju i kraćem repu.',
        'Mlad pijetao ima kratku, tupu ostrugu na nozi; starijem je duža i oštrija.',
      ]],
      ['Zdravlje i bolesti', [
        'Ptičja gripa (avijarna influenca): ako nađeš više uginulih ptica, ne diraj ih nego prijavi veterinarskoj službi i lovočuvaru.',
        'Zdravo meso ima čist miris i svijetlu boju; pretjerano mršave ili bolesne ptice ne koristi.',
      ]],
      ['Poslije odstrela', [
        'Ptice ohladiti i očistiti što prije; držati odvojeno od sirovog mesa druge divljači radi higijene.',
      ]],
    ],
  },
  zec: {
    kalendar: [['parenje', 'Razmnožavanje (više legala)', [2, 3, 4, 5, 6, 7, 8, 9]]],
    aktivnost: { zora: 2, dan: 1, sumrak: 3, noc: 3 },
    dodatno: [
      ['Spol i dob (kako procijeniti)', [
        'Spol se ne razlikuje lako izvana. Mladi zec do oko 8 mjeseci ima "Stiedin čvor": otok na dnu prednje noge, iznad šapice, koji se osjeti pritiskom.',
        'Mladi su sitniji, mekših ušiju i s mladenačkim izgledom.',
      ]],
      ['Zdravlje i bolesti', [
        'Tularemija (zečja groznica) se može prenijeti na čovjeka dodirom: pri deranju koristi rukavice i oprezno rukuj sa pobolijelim zecom.',
        'Ako su jetra pjegava ili uvećana, meso ne koristi; pojavu više uginulih zečeva prijavi lovočuvaru.',
      ]],
      ['Poslije odstrela', [
        'Zeca izvaditi i ohladiti što prije; rukavice pri deranju.',
      ]],
    ],
  },
};

function spoji(osnova) {
  const d = DOPUNE[osnova.kod] || {};
  const sekcije = [...osnova.sekcije];
  const lov = sekcije.pop(); // "Značajno za lov" ostaje zadnje
  return { ...osnova, kalendar: d.kalendar || [], aktivnost: d.aktivnost || null, sekcije: [...sekcije, ...(d.dodatno || []), lov] };
}

// Izgled kartice: boja i znak emblema (tamne boje: bijeli znak prolazi kontrast 4.5:1) i kod grupe za filter.
const ODLIKE = {
  divlja_svinja: { boja: '#6b3f26', znak: 'DS', grupaKod: 'krupna' },
  srna: { boja: '#92400e', znak: 'SR', grupaKod: 'krupna' },
  medvjed: { boja: '#44403c', znak: 'MD', grupaKod: 'zvijer' },
  vuk: { boja: '#334155', znak: 'VK', grupaKod: 'zvijer' },
  cagalj: { boja: '#854d0e', znak: 'ČG', grupaKod: 'zvijer' },
  fazan: { boja: '#9f1239', znak: 'FZ', grupaKod: 'sitna' },
  zec: { boja: '#4d7c0f', znak: 'ZC', grupaKod: 'sitna' },
};

export const VRSTE_DIVLJACI = OSNOVA.map((o) => ({ ...spoji(o), ...(ODLIKE[o.kod] || { boja: '#475569', znak: '?', grupaKod: 'sitna' }) }));

export const GRUPE = [['sve', 'Sve'], ['krupna', 'Krupna divljač'], ['sitna', 'Sitna divljač'], ['zvijer', 'Zvijeri']];

// Dijelovi sadržaja po tabu u detalju vrste: svaki naslov ide u TAČNO jedan tab.
export const DETALJ_TABOVI = [
  ['pregled', 'Pregled', ['Izgled i karakteristike']],
  ['biologija', 'Biologija', ['Biologija i razmnožavanje', 'Spol i dob (kako procijeniti)']],
  ['ponasanje', 'Ponašanje', ['Ponašanje i prehrana', 'Tragovi i znakovi']],
  ['lov', 'Lov i zdravlje', ['Značajno za lov', 'Poslije odstrela', 'Zdravlje i bolesti']],
];

export function sectionsOfTab(v, tab) {
  const names = DETALJ_TABOVI.find(([k]) => k === tab)?.[2] || [];
  return v.sekcije.filter(([naziv]) => names.includes(naziv));
}

export function filterByGroup(list, grupa) {
  return grupa && grupa !== 'sve' ? list.filter((v) => v.grupaKod === grupa) : list;
}

// Doba dana kad je vrsta najaktivnija ("zora i sumrak").
export function bestTimes(v) {
  if (!v.aktivnost) return '';
  const max = Math.max(...Object.values(v.aktivnost));
  const names = { zora: 'zora', dan: 'dan', sumrak: 'sumrak', noc: 'noć' };
  const top = ['zora', 'dan', 'sumrak', 'noc'].filter((k) => v.aktivnost[k] === max).map((k) => names[k]);
  return top.length > 1 ? `${top.slice(0, -1).join(', ')} i ${top[top.length - 1]}` : top[0] || '';
}

// Šta se u prirodi dešava u datom mjesecu (1–12) — biološki kalendar, NIJE lovostaj.
export function monthEvents(month, list = VRSTE_DIVLJACI) {
  const out = [];
  for (const v of list) {
    for (const [kod, naziv, mjeseci] of v.kalendar || []) if (mjeseci.includes(month)) out.push({ vrsta: v.kod, nazivVrste: v.naziv, kod, dogadjaj: naziv });
  }
  return out;
}

export const MJESECI = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
export const DOBA_DANA = [['zora', 'Zora'], ['dan', 'Dan'], ['sumrak', 'Sumrak'], ['noc', 'Noć']];

// Redovi kalendara: za svaki događaj 12 logičkih vrijednosti (jan–dec).
export function calendarRows(v) {
  return (v.kalendar || []).map(([kod, naziv, mjeseci]) => ({ kod, naziv, mjeseci: MJESECI.map((_, i) => mjeseci.includes(i + 1)) }));
}

export function activityRows(v) {
  return v.aktivnost ? DOBA_DANA.map(([kod, naziv]) => ({ kod, naziv, nivo: v.aktivnost[kod] ?? 0 })) : [];
}

export function allSpeciesText(v) {
  return [v.naziv, v.latinski, v.grupa, v.kratko, ...v.brojke.flat(), ...v.sekcije.flatMap(([n, t]) => [n, ...t])];
}

export function filterSpecies(query, list = VRSTE_DIVLJACI) {
  return list.filter((v) => matchesQuery(allSpeciesText(v), query));
}
