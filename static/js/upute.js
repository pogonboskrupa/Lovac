// Upute za korištenje (sadržaj ostaje u aplikaciji, radi bez interneta).
// Propisi (datumi lovostaja, lovno vrijeme) se NE navode: unosi ih administrator u aplikaciji.

import { matchesQuery } from './pretraga.js';

export const UPUTE_NAPOMENA = 'Aplikacija je pomoć lovcu na terenu. Ne zamjenjuje pravila lova, vođu lova ni službeni lovački dnevnik.';

export const UPUTE = [
  {
    id: 'pocetak', naslov: 'Početak: prijava i nalog',
    uvod: 'Za rad su potrebni nalog i odobrenje administratora.',
    stavke: [
      ['Prijava', 'Upiši ime, prezime i PIN od 6 do 8 cifara. Ako u društvu ima dva lovca istog imena i prezimena, razlikuju se poljem nadimak / broj člana.'],
      ['Odobrenje', 'Novi nalog čeka odobrenje administratora. Dok nije odobren, podaci se ne mogu koristiti.'],
      ['Drugi lovac pravi nalog', 'Administrator, lovočuvar i grupovođa naprave nalog za lovca i odmah ga dodaju u sekciju. Običan član može samo predložiti lovca, a odobrava grupovođa.'],
      ['Zaboravljen PIN', 'Administrator može postaviti novi PIN. PIN možeš promijeniti u Postavke → Nalog.'],
      ['Pokretanje bez interneta', 'Kad si jednom prijavljen, aplikacija se otvara odmah, i bez signala.'],
    ],
  },
  {
    id: 'mapa', naslov: 'Mapa i koordinate',
    uvod: 'Mapa je glavni ekran. Dno ekrana: Mapa, tvoja sekcija, Meni, Postavke.',
    stavke: [
      ['Koordinate i visina', 'Gore lijevo su visina i koordinate centra karte. Dodir na koordinate mijenja sistem: WGS84, MGI 5, MGI 6. Dodir na visinu sakriva visinu i koordinate (isto se može u izboru podloge).'],
      ['Podloge', 'Dugme gore desno bira podlogu: Topo, Satelit ili Teren. Teren se preuzme jednom i radi bez interneta.'],
      ['Dugme +', 'Dodaje lovački objekat, opažanje divljači, odstrel, sliku na poziciji, potragu za ranjenom divljači i mjerenje (udaljenost, površina, nagib). Kamere dodaju samo lovočuvari.'],
      ['Visina (N.V.)', 'Nadmorska visina dolazi iz modela terena, a GPS visina je samo rezerva jer je netačna.'],
    ],
  },
  {
    id: 'lokacija', naslov: 'Moja lokacija, kompas i 3D',
    uvod: 'Dugme sa ciljem desno dole centrira kartu na tebe i otvara ploču sa alatima.',
    stavke: [
      ['GPS tačnost', 'Zelena je dobra, žuta srednja, crvena loša. Piše i koliko je star zadnji fiks.'],
      ['Alati u ploči', 'Centriraj na mene, Prati me, Snimaj trag, Opažanje divljači, Istraživač (3D) i Kopiraj koordinate.'],
      ['Pravac gledanja', 'Kompas pokazuje u kojem smjeru gleda telefon. Ako telefon nema senzor, koristi se smjer kretanja ili piše da kompas nije dostupan. Kompas može griješiti (metal, magneti).'],
      ['Snimanje traga', 'Snima put dok hodaš, i kad je ekran ugašen. Može se pauzirati, dodati tačka ili slika. Trag kraći od 50 m se ne čuva. Na nekim telefonima treba isključiti štednju baterije za aplikaciju.'],
      ['Istraživač (3D)', 'Nagnut pogled karte koji prati tebe. Jedan prst pomjera kartu (možeš istraživati teren van svoje pozicije, dugme ◎ te vraća), dva prsta je okreću, a dugme "Sjever gore" vraća pogled. Dodir na kolegu koji dijeli lokaciju pokazuje koliko je daleko od tebe, a prekidač prikazuje trag kuda se kretao. "Izađi iz 3D" je gore lijevo.'],
      ['Dijeljenje sa sekcijom', 'U istoj ploči možeš podijeliti lokaciju sa svojom sekcijom na 1 sat, 4 sata ili do kraja dana. Vide je članovi, grupovođa i lovočuvar te sekcije, a administrator ne (osim ako je u sekciji).'],
    ],
  },
  {
    id: 'offline', naslov: 'Rad bez interneta',
    uvod: 'Karta, GPS, unos i pregled rade bez signala. Sve što uneseš čuva se na telefonu i šalje na server kad se pojavi internet.',
    stavke: [
      ['Čeka slanje', 'Broj zapisa koji još nisu na serveru. Šalju se sami; Postavke → Podaci ima dugme "Pošalji sad". Neposlano se nikad ne briše.'],
      ['Preuzmi područje', 'Meni → Karte i offline → Preuzmi područje spremi pločice vidljivog dijela karte (topo ili satelit). Uradi to kod kuće za lovište u koje ideš.'],
      ['Teren i offline karte', 'Teren je karta društva koju preuzimaš jednom (veliki fajl, koristi wifi). Možeš uvesti i vlastitu MBTiles ili RMaps kartu sa telefona.'],
      ['Spremnost', 'Postavke → Podaci pokazuje vezu, zadnje slanje, zauzetu pohranu telefona, broj pločica i kad je zadnja rezervna kopija.'],
      ['Zapisi drugog naloga', 'Ako se na istom telefonu prijavi drugi lovac, njegovi neposlani zapisi se ne šalju pod tvojim imenom. Što server odbije, pojavi se u Postavke → Podaci i može se skinuti iz reda.'],
    ],
  },
  {
    id: 'evidencija', naslov: 'Evidencija: objekti, opažanja, odstrel, tragovi',
    uvod: 'Meni → Evidencija. Svaki zapis je u početku privatan.',
    stavke: [
      ['Vidljivost', 'Privatno (samo ti), društvo ili izabrani lovci. Administrator ne vidi tvoje privatne zapise.'],
      ['Objekti', 'Čeke, hranilišta, solila i slično, sa stanjem i datumom zadnjeg obilaska. Pokazuje se koji treba popravku i koji dugo nisu obiđeni; "Vodi me" vodi do objekta.'],
      ['Opažanja', 'Vrsta, broj grla, doba dana i fotografija. Pregled pokazuje kad je divljač viđena.'],
      ['Odstrel', 'Evidencija ulova sa težinom. Možeš izvesti CSV (Excel) i PDF. Izvještaj ne zamjenjuje službeni lovački dnevnik.'],
      ['Prijavi društvu', 'Na kartici odstrela dugme šalje društvu samo vrstu, kategoriju, težinu i vrijeme, bez tačne lokacije. Prijavu možeš povući dok je tvoja.'],
      ['Moji tragovi', 'Snimljene ture sa kilometrima, trajanjem i oblikom rute. Potraga za ranjenom divljači šalje se i dok traje, da je vodič psa može pratiti.'],
      ['Fotografije', 'Smanjuju se prije čuvanja. Na server ide sličica trajno, a velika slika ograničeno vrijeme. "Slika na poziciji" ostaje samo na telefonu.'],
    ],
  },
  {
    id: 'sekcija', naslov: 'Sekcije i pristup',
    uvod: 'Društvo ima revire, a revir sekcije. Svaka sekcija ima grupovođu, a revir lovočuvara.',
    stavke: [
      ['Pristup sekciji', 'Meni → Sekcije i pristup: zatraži pristup. Bez odobrenja grupovođe nema ulaza u sekciju.'],
      ['Tab sekcije', 'Dugme u donjoj navigaciji nosi ime tvoje sekcije. Pokazuje lovce (ko je aktivan), tekući lov, poruke, rukovodstvo (samo grupovođe i lovočuvari) i podatke sekcije.'],
      ['Poruke', 'Poruke vide članovi sekcije, grupovođa, lovočuvar i administrator. Obavijest stiže samo dok je aplikacija otvorena.'],
      ['Gdje si?', 'Dugme uz lovca pita gdje se nalazi. On odgovara sa Da ili Ne; Da pokreće dijeljenje lokacije sa sekcijom na sat vremena.'],
      ['Uloge', 'Administrator (cijelo društvo), lovočuvar (svoj revir), grupovođa (svoja sekcija) i lovac. Uloga se uvijek određuje na serveru.'],
    ],
  },
  {
    id: 'lov', naslov: 'Zajednički lov i sigurnost',
    uvod: 'Grupovođa pravi lov jednim dodirom, a članovi javljaju da su prisutni.',
    stavke: [
      ['Raspored', 'Meni → Zajednički lov: stanovi, učesnici i uloge. Raspored se preuzima na telefon i radi bez interneta.'],
      ['Sektori pucanja', 'Za svaki stan se računa smjer prema ostalim stanovima. Aplikacija upozorava kad je pravac zabranjen. To je pomoć, a ne zamjena za vođu lova.'],
      ['Tok lova', 'Komande vođe (početak pogona, kraj, okupljanje, prekid) stižu svima; svaki lovac javlja da je na stanu, da je napustio stan ili pauzu. PREKID se šalje i SMS-om.'],
      ['SOS', 'Šalje se serveru (ako ima veze) i uvijek kao SMS ostalim učesnicima, sa koordinatama. U SMS-u pritisni Pošalji.'],
      ['Lokacija u lovu', 'Dok je lov u toku, pozicija se dijeli sa učesnicima; to se može isključiti. Kraj lova gasi dijeljenje.'],
      ['Arhiva', 'Meni → Arhiva lova: završeni lovovi sa učesnicima, rezultatom, slikama i tragom kretanja lovaca.'],
    ],
  },
  {
    id: 'danas', naslov: 'Danas, Divljač, Pregled i statistika',
    uvod: 'Meni sadrži i pomoćne ekrane.',
    stavke: [
      ['Danas', 'Svjetlo od svitanja do sumraka na luku i vrijeme sa smjerom vjetra. Lovno vrijeme i lovostaj prikazuju se samo ako ih je administrator unio; inače piše da nisu uneseni.'],
      ['Vjetar na čeki', 'Smjer vjetra i konus mirisa pomažu pri izboru čeke. Termika je samo pravilo palca.'],
      ['Divljač', 'Opisi vrsta: izgled, biologija, ponašanje, tragovi i biološki kalendar. Kalendar nije lovostaj.'],
      ['Moj pas', 'Aplikacija ne čita ogrlice. Zalijepi poziciju koju ogrlica pošalje i dobiješ marker, trag, udaljenost i smjer.'],
      ['Pregled i statistika', 'Prijavljeni ulovi i rejting po sekciji, reviru i društvu, prema tvojoj ulozi. Rejting uzima odaziv na lovove, tačnost prijave, redovnost, raznovrsnost vrsta i prijavljeni ulov.'],
    ],
  },
  {
    id: 'postavke', naslov: 'Postavke',
    uvod: 'Četiri taba: Opšte, Podaci, Nalog, Profil lovca.',
    stavke: [
      ['Veličina teksta', 'Normalno, Veliko ili Najveće, za lakše čitanje na suncu ili za starije lovce.'],
      ['Izgled', 'Dnevna i noćna tema.'],
      ['Rezervna kopija', 'Postavke → Podaci izvozi tvoje zapise u fajl i može ih vratiti. Vraćanje samo dodaje zapise kojih nema. Napravi kopiju prije promjene telefona.'],
      ['Profil lovca', 'Avatar, pas, prateća oprema (vidiš samo ti), broj telefona i lična statistika.'],
      ['Ažuriranje', 'Postavke → Nalog → O aplikaciji: Provjeri ažuriranje ili Preuzmi zadnju verziju. Instalacija ide preko postojeće, podaci ostaju.'],
      ['Odjava', 'Ako ima neposlanih zapisa, traži drugi dodir. Neposlani zapisi se ne brišu.'],
    ],
  },
  {
    id: 'pitanja', naslov: 'Česta pitanja',
    uvod: 'Brza rješenja.',
    stavke: [
      ['"Čeka slanje" ne nestaje', 'Provjeri vezu i dodirni Postavke → Podaci → Pošalji sad. Ako piše da je server odbio zapise, vjerovatno su napravljeni pod drugim nalogom na ovom telefonu.'],
      ['Dijelovi karte su crni', 'Slaba veza. Preuzmi područje dok imaš dobar signal ili pričekaj da se pločice ponove učitati.'],
      ['Kompas ne radi', 'Neki telefoni nemaju senzor ili je potrebno kalibrisati (pokret osmice). Pri kretanju se koristi GPS smjer.'],
      ['Lokacija nije tačna', 'Izađi na otvoreno; ispod krošnji i u dolinama GPS griješi više. Tačnost piše u ploči Moja lokacija.'],
      ['Nema lovostaja ili lovnog vremena', 'Te podatke unosi administrator. Dok ih ne unese, aplikacija kaže da nisu uneseni i ne pogađa.'],
    ],
  },
];

const textOf = (sec) => [sec.naslov, sec.uvod, ...sec.stavke.flat()];

// Pretraga bez dijakritika; sekcija ostaje ako joj odgovara naslov ili bilo koja stavka.
export function filterUpute(sections, query) {
  return sections.filter((s) => matchesQuery(textOf(s), query));
}

export function matchingItems(sec, query) {
  if (!String(query ?? '').trim()) return sec.stavke;
  const rows = sec.stavke.filter((st) => matchesQuery(st, query));
  return rows.length ? rows : sec.stavke;
}
