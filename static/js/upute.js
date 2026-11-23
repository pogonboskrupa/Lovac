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
      ['Odobrenje i probni period', 'Nalog koji napraviš sam (Novi nalog) odmah radi 7 dana: karta, GPS, tvoji zapisi i zahtjev za sekciju. Za stalni pristup zatraži sekciju (Meni → Sekcije i pristup) — kad te grupovođa primi ili administrator odobri, nalog radi trajno. Dok traje probni period ne vidiš zapise drugih lovaca ni spisak članova. Grupovođa može i sam napraviti nalog i odmah te dodati u svoju sekciju.'],
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
      ['Prikaz po razmjeri', 'Slike, tragovi i tačke (opažanja, tačke interesa) se crtaju tek kad je karta uvećana do razmjere 1 : 12 500, da ne prekriju kartu pri pregledu lovišta. U Postavke → Opšte → Prikaz na karti — razmjera biraš drugu razmjeru, "Uvijek" ili isključuješ ograničenje za pojedinu vrstu.'],
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
      ['Istraživač (3D)', 'Nagnut pogled karte koji prati tebe. Jedan prst pomjera kartu (možeš istraživati teren van svoje pozicije, dugme ◎ te vraća), dva prsta je okreću i zumiraju (razmak prstiju), a dodir na kompas sa sjeverom vraća pogled na sjever. Dodir na kolegu koji dijeli lokaciju pokazuje koliko je daleko od tebe, a prekidač prikazuje trag kuda se kretao. Izlaz je X uz tipku lokacije ili "Izađi iz 3D" gore lijevo.'],
      ['Prati me', 'Karta prati tvoju poziciju dok je uključeno. Manji pomak karte prstom se vraća na tebe; praćenje se isključuje tek kad odvučeš kartu tako da si 80 % puta od sredine do ruba ekrana.'],
      ['Pošalji lokaciju', 'U ploči Moja lokacija dugme "Pošalji lokaciju" otvara SMS, Viber ili drugu aplikaciju sa tvojim koordinatama (WGS84 i MGI 5) i linkom karte. Radi i bez mobilnih podataka preko SMS-a. "Kopiraj" uz koordinate kopira sve sisteme. Kad dijeliš lokaciju sa sekcijom, na vrhu ploče piše do kad.'],
      ['Moja lokacija i Dijeli lokaciju (on/off)', 'U ploči Moja lokacija su dva odvojena prekidača. "Moja lokacija" samo pokazuje ili skriva tvoju poziciju na karti. "Dijeli lokaciju" (zadano uključen) određuje da li učesnici lova vide tvoju poziciju dok lov traje.'],
      ['Dodir na kolegu na karti', 'Dodirni krug sa inicijalima kolege koji dijeli lokaciju (u lovu ili sa sekcijom): otvara se kartica sa imenom i prezimenom, udaljenošću i stranom svijeta od tebe i starošću pozicije. Udaljenost traži tvoj GPS.'],
      ['Dijeljenje sa sekcijom', 'U istoj ploči možeš podijeliti lokaciju sa svojom sekcijom na 1 sat, 4 sata ili do kraja dana. Vide je članovi, grupovođa i lovočuvar te sekcije, a administrator ne (osim ako je u sekciji).'],
    ],
  },
  {
    id: 'offline', naslov: 'Rad bez interneta',
    uvod: 'Karta, GPS, unos i pregled rade bez signala. Sve što uneseš čuva se na telefonu i šalje na server kad se pojavi internet.',
    stavke: [
      ['Slab signal', 'Kad signal postoji, ali zahtjevi ne prolaze (većina pada ili traje preko 8 sekundi), aplikacija to prepozna, piše "Slab signal — radim offline" i radi kao bez veze: karta iz keša, GPS, unos i pregled. Zapisi se šalju sami čim veza opet proradi; dok traje slab signal, aplikacija povremeno provjerava je li se veza oporavila.'],
      ['Čeka slanje', 'Broj zapisa koji još nisu na serveru. Šalju se sami; Postavke → Podaci ima dugme "Pošalji sad". Neposlano se nikad ne briše.'],
      ['Preuzmi područje', 'Meni → Karte i offline → Preuzmi područje spremi pločice vidljivog dijela karte (topo ili satelit). Uradi to kod kuće za lovište u koje ideš.'],
      ['Preuzeta područja', 'Spisak preuzetih područja u Karte i offline pokazuje podlogu, zoom, broj pločica i datum. Prekidač ih crta isprekidanim okvirom na karti, a pri novom preuzimanju piše da je prikazani dio već preuzet. Preuzeto područje i Teren ostaju na telefonu i poslije odjave, ponovne prijave ili brisanja keša karte — preuzimaš ih jednom. "Ukloni" briše pločice tog područja.'],
      ['Teren i offline karte', 'Teren je karta društva koju preuzimaš jednom (veliki fajl, koristi wifi). Možeš uvesti i vlastitu MBTiles ili RMaps kartu sa telefona.'],
      ['Spremnost', 'Postavke → Podaci pokazuje vezu, zadnje slanje, zauzetu pohranu telefona, broj pločica i kad je zadnja rezervna kopija.'],
      ['Obavijesti i baterija', 'Postavke → Podaci → Obavijesti i baterija pokazuje da li su obavijesti dozvoljene i da li je optimizacija baterije isključena. Dugmad "Postavke obavijesti" i "Postavke baterije" vode direktno u sistemske postavke telefona, gdje to promijeniš. Oboje treba da stigne poruka, SOS i komande lova i da se trag snima bez prekida. Crvena značka na tabu sekcije pokazuje broj nepročitanih poruka. Bez servisa za push obavijest stiže dok je aplikacija otvorena ili živa u pozadini.'],
      ['Zapisi drugog naloga', 'Ako se na istom telefonu prijavi drugi lovac, njegovi neposlani zapisi se ne šalju pod tvojim imenom. Što server odbije, pojavi se u Postavke → Podaci i može se skinuti iz reda.'],
    ],
  },
  {
    id: 'evidencija', naslov: 'Evidencija: objekti, opažanja, odstrel, tragovi',
    uvod: 'Meni → Evidencija. Svaki zapis je u početku privatan.',
    stavke: [
      ['Vidljivost', 'Privatno (samo ti), društvo ili izabrani lovci. Administrator ne vidi tvoje privatne zapise.'],
      ['Objekti', 'Čeke, hranilišta, solila i slično, sa stanjem i datumom zadnjeg obilaska. Pokazuje se koji treba popravku i koji dugo nisu obiđeni; "Vodi me" vodi do objekta.'],
      ['Zvanični objekti društva', 'Administrator, lovočuvar i grupovođa pri unosu objekta mogu označiti "Zvanični objekat društva". Takav objekat vide svi članovi društva, a na karti ima zlatni prsten i zvjezdicu. Objekti koje unese lovac ostaju njegovi (privatni dok ih sam ne podijeli).'],
      ['Opažanja', 'Vrsta, broj grla, doba dana i fotografija. Pregled pokazuje kad je divljač viđena. Opažanje sa fotografijom se na karti vidi kao sličica. Dodir na opažanje otvara karticu sa slikom i podatkom ko je vidio, a svoje opažanje možeš podijeliti ili obrisati (drugi dodir).'],
      ['Prijavi lovočuvaru', 'Ploča + → "Prijavi lovočuvaru": krivolov, ubijena ili ranjena divljač, zamka ili otrov, pas lutalica ili ostalo, sa lokacijom (GPS ili nišan karte), opisom i slikom. Dojava ide lovočuvaru revira (i administratoru), drugi lovci je ne vide. Bez interneta čeka na telefonu i šalje se kad se veza vrati. U Meni → "Prijave lovočuvaru" vidiš status (Nova, Preuzeta, Riješena) i odgovor lovočuvara. Lovočuvar tamo preuzima i rješava dojave, a neriješene vidi i na karti. Kod opasnosti ne prilazi — javi se lovočuvaru ili policiji telefonom.'],
      ['Odstrel', 'Evidencija ulova sa težinom. Možeš izvesti CSV (Excel) i PDF. Izvještaj ne zamjenjuje službeni lovački dnevnik.'],
      ['Prijavi društvu', 'Na kartici odstrela dugme šalje društvu samo vrstu, kategoriju, težinu i vrijeme, bez tačne lokacije. Prijavu možeš povući dok je tvoja.'],
      ['Nagib terena', 'Meni → Granice lovišta → Nagib terena: uključiš prikaz i izabereš od kojeg nagiba se teren boji (20°, 25°, 30° zadano, 35°, 40°). Žuto je odmah iznad praga, pa narandžasto, crveno i ljubičasto za najstrmije. Vidi se kad je karta uvećana (razmjera 1 : 50 000 i bliže). Procjena je iz modela terena (ćelija oko 14 m), orijentaciona je i ne zamjenjuje procjenu na terenu. Za rad bez interneta preuzmi područje (Karte i offline).'],
      ['Tragovi u Granicama lovišta', 'Meni → Granice lovišta → Moji tragovi na karti: prvo su tragovi najbliži sredini karte (ili najnoviji). Možeš ih uključiti na kartu više odjednom, promijeniti boju, debljinu i vrstu linije (puna, isprekidana, tačkasta), pokazati ili obrisati (drugi dodir). Dodir na trag na karti otvara njegovu karticu.'],
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
      ['Sekcije po revirima', 'Lovočuvar revira (i administrator) u Sekcije i pristup pravi nove sekcije u svom reviru, postavlja grupovođu sekcije i grupovođe revira (oni smiju praviti sekcije u tom reviru). Članove sekcije dodaje i odobrava grupovođa. Sekciju u drugi revir premješta samo administrator.'],
    ],
  },
  {
    id: 'lov', naslov: 'Zajednički lov i sigurnost',
    uvod: 'Grupovođa u tabu sekcije dodirne "Novi lov" i u formi upiše naziv, datum, okupljanje i napomenu, izabere učesnike i po želji odmah pokrene lov. Članovi javljaju da su prisutni.',
    stavke: [
      ['Dodaj lov', 'Grupovođa (i administrator) u ploči + na mapi dodirne "Dodaj lov", izabere lovce sa spiska sekcije (pretraga, "Označi sve" ili "Kao zadnji lov") i za svakog dodirom bira Strijelac ili Pogonič. Upisuje se vrijeme i mjesto okupljanja. Zadano se lov odmah pokreće; ako se ne pokrene, ploča + do pokretanja nudi "Lov danas" sa dugmetom "Pokreni lov". Za pravljenje lova potreban je internet.'],
      ['Vođenje lova', 'Vođa lova (organizator, grupovođa sekcije ili administrator) u ekranu "Lov traje" ima "Dodaj lovce" (sa ulogom) i "Završi lov" (drugi dodir potvrđuje). Pregled pokazuje stanje pogona iz toka lova i ulov upisan u lovu, uz "Upiši odstrel".'],
      ['Lov traje', 'Dok traje lov u kojem si, ploča + umjesto "Dodaj lov" ima "Lov traje". Pregled: početak i trajanje, tvoja uloga i stan, vođa, napomena, zadnja poruka i slike. Lovci: ko dijeli lokaciju uživo, udaljenost i strana svijeta od tebe, a dodir na lovca pokazuje njegove poruke i slike iz lova i "Na karti". Poruke: razgovor svih u lovu, sa brzim porukama; broj nepročitanih se vidi na dugmetu u ploči +. Slike: dodaj sliku iz lova (šalje se kad bude interneta). Radi i bez interneta iz onoga što je na telefonu.'],
      ['Raspored', 'Meni → Zajednički lov: stanovi, učesnici i uloge. Raspored se preuzima na telefon i radi bez interneta.'],
      ['Sektori pucanja', 'Za svaki stan se računa smjer prema ostalim stanovima. Aplikacija upozorava kad je pravac zabranjen. To je pomoć, a ne zamjena za vođu lova.'],
      ['Tok lova', 'Komande vođe (početak pogona, kraj, okupljanje, prekid) stižu svima; svaki lovac javlja da je na stanu, da je napustio stan ili pauzu. PREKID se šalje i SMS-om. Učesnici su sažeti po stanju; ekran se zatvara sa × gore (ostaje vidljiv i kad listaš) ili "Zatvori tok lova" na dnu.'],
      ['SOS', 'Šalje se serveru (ako ima veze) i uvijek kao SMS ostalim učesnicima, sa koordinatama. U SMS-u pritisni Pošalji.'],
      ['Lokacija u lovu', 'Dok je lov u toku, pozicija se dijeli sa učesnicima; to se može isključiti. Kraj lova gasi dijeljenje.'],
      ['Arhiva', 'Meni → Arhiva lova: završeni lovovi sa učesnicima, rezultatom, slikama i tragom kretanja lovaca. Tab "Kalendar" pokazuje mjesec po mjesec dane sa lovom (zeleno); dodir na dan otvara lov.'],
      ['Lov iz arhive na karti', 'U detalju lova "Prikaži lov na karti" crta tragove lovaca i slike lova (one koje imaju lokaciju). Sa desne strane karte su dugmad Tragovi i Slike — svako se posebno prikazuje ili sakriva — i Sakrij, koje skida lov sa karte. Dodir na sliku je otvara veliku.'],
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
      ['Ažuriranje', 'Postavke → Nalog → O aplikaciji: Provjeri ažuriranje ili Preuzmi zadnju verziju. Aplikacija sama preuzme novu verziju na telefon (vidi se napredak u %), pa otvori instalaciju; instalacija ide preko postojeće, podaci ostaju. Prvi put telefon traži dozvolu za instalaciju iz ove aplikacije: dozvoli i vrati se, instalacija kreće sama.'],
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
