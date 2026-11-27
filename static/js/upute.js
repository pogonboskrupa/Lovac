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
      ['Odobrenje i probni period', 'Nalog koji napraviš sam (Novi nalog) odmah radi 24 sata; pri registraciji možeš izabrati revir i sekciju, a ako pogriješiš, administrator ili lovovođa sekcije te prebaci u drugu: karta, GPS, tvoji zapisi i zahtjev za sekciju. Za stalni pristup zatraži sekciju (Meni → Sekcije i pristup) — kad te lovovođa sekcije ili lovočuvar revira primi ili administrator odobri, nalog radi trajno. Dok traje probni period ne vidiš zapise drugih lovaca ni spisak članova. Lovovođa sekcije može i sam napraviti nalog i odmah te dodati u svoju sekciju.'],
      ['Drugi lovac pravi nalog', 'Administrator, lovočuvar i lovovođa sekcije naprave nalog za lovca i odmah ga dodaju u sekciju. Običan član može samo predložiti lovca, a odobrava lovovođa sekcije.'],
      ['Korisnici i odobrenja (administrator)', 'Postavke → Opšte → Korisnici i odobrenja je glavno mjesto za upravljanje svim nalozima. Pregled: čeka odobrenje, probni period, odobreno, administratori, broj lovovođa sekcije i lovočuvara i koliko odobrenih nema sekciju; filteri Svi, Čekaju, Odobreni, Vodstvo, Admini i Bez sekcije, filter po sekciji i pretraga (ime, nadimak, naziv sekcije). Na kartici korisnika dugme Upravljanje otvara: Sekcije (Premjesti u drugu sekciju, Ukloni, Dodaj u sekciju; zahtjev za ulaz se prebacuje ili odbija), Uloge (Postavi za lovovođu sekcije — zamjenjuje dosadašnjeg, lista kaže koga; Postavi za lovočuvara revira; Postavi ili ukloni administratora) i Nalog (novi PIN, brisanje drugim dodirom). Uloge se dodjeljuju tek poslije odobrenja. Radi uz internet; sebi administrator ne mijenja uloge.'],
      ['Lovci na karti: veličina i grupe', 'Krug sa inicijalima lovca prati razmjeru: što je karta manje uvećana, to je manji, a kad je lovaca puno, malo je manji i na bližoj razmjeri. Ako se više lovaca prekriva na malom prostoru, vide se kao jedan tamniji krug sa brojem lovaca. Dodir na njega uvećava kartu do tih lovaca; kad se više ne može uvećati ili su na istom mjestu, otvori se spisak imena.'],
      ['Crveni štit na karti i brisanje prijave', 'Crveni štit na karti je neriješena prijava lovočuvaru (krivolov, ubijena ili ranjena divljač, zamka…); vidi je samo lovočuvar tog revira. Dodir otvara karticu sa opisom i dugmetom "Obriši prijavu" (potvrda drugim dodirom). Prijavu mogu obrisati ko ju je poslao, lovočuvar revira i administrator; traži internet.'],
      ['Uloge vodstva (administrator)', 'Postavke → Korisnici i odobrenja → Upravljanje → Uloge: Lovočuvar društva (najviše 2, rade na cijelom području), Lovovođa društva (jedan, glavni) i Lovovođa revira (jedan po reviru, organizuje lov u svom reviru). Skidanje traži drugi dodir. Kad je mjesto popunjeno, piše ko ga drži.'],
      ['Broj lovačke dozvole', 'Postavke → Profil lovca → Lovačka dozvola: upiši broj dozvole i dodirni Sačuvaj profil. Broj vidiš samo ti; aplikacija ga ne provjerava i ne zamjenjuje samu dozvolu.'],
      ['Najaktivniji lovci u sekciji', 'U tabu sekcije, kartica Lovci: izaberi "Najaktivniji prvi" da se prvo prikažu lovci sa najviše lovova. Uz svakog lovca piše koliko je lovova imao u sekciji.'],
      ['Precizniji trag', 'Dok snimaš trag, aplikacija izglađuje šum GPS-a: u malom prostoru i pri sporom hodu linija ne cik-cakira, nego prati stvarno kretanje. Skokove GPS-a od stotinu metara odbacuje. Tačnost zavisi od telefona i neba iznad tebe; u gustoj šumi i uskoj dolini signal je slabiji.'],
      ['Slike lovcima: zum i čuvanje', 'Veliku sliku uvećavaš sa dva prsta (razmicanje), pomjeraš jednim prstom, a dupli dodir uvećava i vraća. Dugme "Sačuvaj na telefon" stavlja sliku u Preuzimanja/Lovac. Čim slika stigne na tvoj telefon, briše se sa servera.'],
      ['Brisanje lova', 'Lov može obrisati administrator i lovovođa sekcije tog lova: u Meni → Zajednički lov dugme "Obriši lov" na kartici lova (i planirani i završeni), u tabu sekcije u kartici lova i uz svaki lov u spisku "Lovovi sekcije" (Podaci o sekciji i lovu) i u Arhivi lova u detalju. Potvrda je drugi dodir na isto dugme. Brisanje je za sve: raspored, učesnici, trag, slike i pogoci nestaju sa servera; poruke sekcije ostaju. Traži internet.'],
      ['Kretanje i pogoci u završenom lovu', 'U Meni → Arhiva lova → lov, kartica "Kretanje i pogoci" pokazuje gdje je divljač ustrijeljena (vrsta, lovac, vrijeme, težina, stan) i koliko je svaki lovac prešao i koliko dugo se kretao. "Na karti" otvara pogodak na karti sa karticom; "Prikaži lov na karti" crta tragove svih lovaca, pogotke (crveni krug sa metom) i slike, a dugmad sa strane ih prikazuju i sakrivaju. Pogodak se pamti kad lovac upiše odstrel u lovu na mjestu gdje je (GPS ili odabrano na karti); ranije upisani komadi nemaju lokaciju. Trag je iz tačaka koje su lovci slali dok je dijeljenje lokacije bilo uključeno. Isto se vidi i u fajlu lova koji se preuzme na telefon (crtež sa crvenim X i popis sa koordinatama).'],
      ['Zaboravljen PIN', 'Administrator može postaviti novi PIN. PIN možeš promijeniti u Postavke → Nalog.'],
      ['Pokretanje bez interneta', 'Kad si jednom prijavljen, aplikacija se otvara odmah, i bez signala.'],
    ],
  },
  {
    id: 'mapa', naslov: 'Mapa i koordinate',
    uvod: 'Mapa je glavni ekran. Dno ekrana: Mapa, tvoja sekcija, Meni, Postavke.',
    stavke: [
      ['Koordinate i visina', 'Gore lijevo su visina i koordinate centra karte. Dodir na koordinate mijenja sistem: WGS84, MGI 5, MGI 6. Visinu i koordinate sakrivaš ili vraćaš prekidačem "Prikaži visinu i koordinate" u ploči podloga (dugme gore desno).'],
      ['Podloge', 'Dugme gore desno bira podlogu. Prvi je istaknut Teren (zelena oznaka) — offline karta društva koja se preuzme jednom i radi bez interneta; ispod piše da li je na telefonu. Topo i Satelit traže internet (ili preuzeto područje).'],
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
      ['Koordinate u ploči', 'Ploča "Moja lokacija" pokazuje koordinate u izabranom sistemu i ispod drugi sistem (uz WGS84 MGI 5, uz MGI WGS84), te nadmorsku visinu sa modela terena (radi i bez interneta kad je područje preuzeto). Dodir bilo gdje na redu prekidača ga uključuje ili isključuje.'],
      ['Alati u ploči', 'Centriraj na mene, Prati me, Snimaj trag, Opažanje divljači, Istraživač (3D) i Kopiraj koordinate.'],
      ['Pravac gledanja', 'Kompas pokazuje u kojem smjeru gleda telefon. Ako telefon nema senzor, koristi se smjer kretanja ili piše da kompas nije dostupan. Kompas može griješiti (metal, magneti).'],
      ['Snimanje traga', 'Snima put dok hodaš, i kad je ekran ugašen. Može se pauzirati, dodati tačka ili slika. Trag kraći od 50 m se ne čuva, osim ako si dodao tačku, sliku ili znak potrage. Auto-pauza se uključuje tek kad stojiš (2 minute u krugu od 4–6 m), pa kretanje u malom prostoru, npr. oko stana, ostaje snimljeno; nastavlja se sama čim se pomakneš oko 10 m, i to od trenutka kad si krenuo. Tačka se pamti tek kad se pomakneš za 3–10 m (zavisno od tačnosti GPS-a), pa stajanje ne pravi "šum" u tragu. Na nekim telefonima treba isključiti štednju baterije za aplikaciju.'],
      ['Istraživač (3D)', 'Nagnut pogled karte koji prati tebe. Jedan prst pomjera kartu (možeš istraživati teren van svoje pozicije, dugme ◎ te vraća), dva prsta je okreću, a zum je na tipkama + i − (zum prstima dok je karta nagnuta je trzao sliku). Dodir na kompas sa sjeverom vraća pogled na sjever. Dodir na marker kolege (krug sa inicijalima imena i prezimena) pokazuje ko je, koliko je daleko od tebe i u kojem smjeru; izabrani kolega dobija zlatni prsten, a pogled se postavi tako da se vidite obojica, a prekidač prikazuje trag kuda se kretao. Izlaz je "Izađi iz 3D" gore lijevo. Dugmad desno (sjever, prati kompas, nagib, vrati me na mene) su u jednoj koloni, jedno ispod drugog.'],
      ['Prati me', 'Karta prati tvoju poziciju dok je uključeno. Manji pomak karte prstom se vraća na tebe; praćenje se isključuje tek kad odvučeš kartu tako da si 50 % puta od sredine do ruba ekrana.'],
      ['Pošalji lokaciju', 'U ploči Moja lokacija dugme "Pošalji lokaciju" otvara SMS, Viber ili drugu aplikaciju sa tvojim koordinatama (WGS84 i MGI 5) i linkom karte. Radi i bez mobilnih podataka preko SMS-a. "Kopiraj" uz koordinate kopira sve sisteme. Kad dijeliš lokaciju sa sekcijom, na vrhu ploče piše do kad.'],
      ['Moja lokacija i Dijeli lokaciju (on/off)', 'U ploči Moja lokacija su dva odvojena prekidača. "Moja lokacija" samo pokazuje ili skriva tvoju poziciju na karti. "Dijeli lokaciju" izvan lova je zadano isključen: uključen dijeli tvoju lokaciju sa sekcijom (na vrijeme izabrano u kartici sekcije, zadano 1 sat). Dok traje lov u kojem si, isti prekidač je dijeljenje u lovu i zadano je uključen — učesnici lova vide tvoju poziciju.'],
      ['Dodir na kolegu na karti', 'Dodirni krug sa inicijalima kolege koji dijeli lokaciju (u lovu ili sa sekcijom): otvara se kartica sa imenom i prezimenom, udaljenošću i stranom svijeta od tebe i starošću pozicije. Udaljenost traži tvoj GPS.'],
      ['Znak dijeljenja na karti', 'Dok dijeliš lokaciju sa lovcima (u lovu ili sa sekcijom), dugme "Moja lokacija" na karti se polako preliva iz tirkizne u crvenu i povremeno blago zadrhti — da ne zaboraviš da te drugi vide. Kad prestaneš dijeliti, dugme je opet obično.'],
      ['Dijeljenje sa izabranim lovcima', 'U ploči Moja lokacija, dio "Dijeli sa izabranim lovcima": upiši bar 2 slova imena, prezimena ili nadimka (spisak svih lovaca se ne prikazuje, samo pretraga), dodaj jednog ili više lovaca, izaberi 1 sat, 4 sata ili do kraja dana i dodirni "Počni dijeliti sa izabranima". Lokaciju vide samo oni koje si izabrao (ne ni administrator ni ostali), a ti vidiš ko dijeli samo sa tobom. Lovca možeš ukloniti i dok dijeliš. Treba internet; dijele i primaju samo članovi društva.'],
      ['Dijeljenje sa sekcijom', 'U istoj ploči možeš podijeliti lokaciju sa sekcijom na 1 sat, 4 sata ili do kraja dana. Dijeliti mogu svi: član, lovovođa sekcije, lovočuvar revira i administrator (administrator bira sekciju sa spiska). Vide je članovi, lovovođa sekcije i lovočuvar te sekcije; administrator tuđe lokacije ne vidi (nije dio sekcije), ali ga sekcija vidi kad on dijeli.'],
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
      ['Imena mjesta na Terenu', 'Na podlozi Teren se vide imena mjesta (naselja, vrhovi, doline, potoci i izvori…) radi lakšeg snalaženja; sitnija se pojave tek kad kartu uvećaš. Na drugim podlogama se ne vide. Slovo prati razmjeru (što je karta manje uvećana, to je manje), a imena koja bi se prekrila se ne crtaju — važnija imaju prednost, pa uvećaj kartu da se pojave i ostala. Imena unosi samo administrator: ploča + → Ime mjesta na Terenu, pomjeri kartu dok križ nije na mjestu, Dalje, upiši naziv i izaberi vrstu. Dodir na ime (administrator) otvara uređivanje: promjena naziva, vrste ili položaja i skidanje sa karte. Ime se sprema na telefon i radi bez interneta, a serveru se šalje kad veza proradi; ostali lovci ga dobiju čim imaju internet i poslije vide i bez njega.'],
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
      ['Objekti', 'Čeke, hranilišta, solila i slično, sa stanjem i datumom zadnjeg obilaska. Pokazuje se koji treba popravku i koji dugo nisu obiđeni; "Vodi me" vodi do objekta. Na karti su objekti mali i vide se tek od razmjere 1 : 50 000 (kad se karta dovoljno uveća), da ne prekriju cijelo lovište.'],
      ['Vodi me do', 'Ploča gore pokazuje cilj, veliku strelicu u krugu (crveno S je sjever), udaljenost, stranu svijeta, procjenu vremena hoda (~3 km/h po terenu, gruba procjena) i da li se približavaš ili udaljavaš. "Ja i cilj na karti" pokaže oboje na karti. Kad stigneš (manje od 15 m) okvir pozeleni i telefon kratko zavibrira. Kompas može griješiti; bez kompasa je sjever gore. Radi bez interneta.'],
      ['Zvanični objekti društva', 'Administrator, lovočuvar i lovovođa sekcije pri unosu objekta mogu označiti "Zvanični objekat društva". Takav objekat vide svi članovi društva, a na karti ima zlatni prsten i zvjezdicu. Objekti koje unese lovac ostaju njegovi (privatni dok ih sam ne podijeli).'],
      ['Opažanja', 'Vrsta, broj grla, doba dana i fotografija. Pregled pokazuje kad je divljač viđena. Na karti je svako opažanje oznaka sa emblemom vrste (dva slova ili znak iz Divljači) i brojem grla u uglu; starije opažanje je blijeđe (danas je najjače, preko mjesec dana najblijeđe), a tek upisano nekoliko sekundi pulsira. Dodir na oznaku otvara karticu. Opažanje sa fotografijom se na karti vidi kao sličica. Dodir na opažanje otvara karticu sa slikom i podatkom ko je vidio, a svoje opažanje možeš podijeliti ili obrisati (drugi dodir).'],
      ['Prijavi lovočuvaru', 'Ploča + → "Prijavi lovočuvaru": krivolov, ubijena ili ranjena divljač, zamka ili otrov, pas lutalica ili ostalo, sa lokacijom (GPS ili "Odaberi na karti"), opisom i slikom. Dojava ide lovočuvaru revira (i administratoru), drugi lovci je ne vide. Bez interneta čeka na telefonu i šalje se kad se veza vrati. U Meni → "Prijave lovočuvaru" vidiš status (Nova, Preuzeta, Riješena) i odgovor lovočuvara. Lovočuvar tamo preuzima i rješava dojave, a neriješene vidi i na karti. Kod opasnosti ne prilazi — javi se lovočuvaru ili policiji telefonom.'],
      ['Odstrel', 'Evidencija ulova sa težinom. Možeš izvesti CSV (Excel) i PDF. Izvještaj ne zamjenjuje službeni lovački dnevnik.'],
      ['Prijavi društvu', 'Na kartici odstrela dugme šalje društvu samo vrstu, kategoriju, težinu i vrijeme, bez tačne lokacije. Prijavu možeš povući dok je tvoja.'],
      ['Nagib terena', 'Meni → Granice lovišta → Nagib terena: uključiš prikaz i izabereš od kojeg nagiba se teren boji (20°, 25°, 30° zadano, 35°, 40°). Žuto je odmah iznad praga, pa narandžasto, crveno i ljubičasto za najstrmije. Vidi se kad je karta uvećana (razmjera 1 : 50 000 i bliže). Procjena je iz modela terena (ćelija oko 14 m), orijentaciona je i ne zamjenjuje procjenu na terenu. Za rad bez interneta preuzmi područje (Karte i offline).'],
      ['Tragovi u Granicama lovišta', 'Meni → Granice lovišta → Moji tragovi na karti: prvo su tragovi najbliži sredini karte (ili najnoviji). Možeš ih uključiti na kartu više odjednom, promijeniti boju, debljinu i vrstu linije (puna, isprekidana, tačkasta), pokazati ili obrisati (drugi dodir). Dodir na trag na karti otvara njegovu karticu.'],
      ['Potraga za ranjenom divljači', 'Ploča + → Potraga: izabereš divljač, kad je pucano i znakove na nastrijelu (krv, dlaka, kost…) — aplikacija daje orijentacioni savjet. Nastrijel je na tvojoj poziciji ili na mjestu koje odabereš na karti ("Odaberi nastrijel na karti") i snimanje počinje odmah. Tokom potrage panel pokazuje udaljenost i smjer do nastrijela, broj znakova i vrijeme od pucnja; "Krv ovdje" bilježi krv jednim dodirom, "Znak…" dlaku, kost, ležaj ili drugo. Znakovi se na karti spajaju isprekidanom crvenom linijom. "Završi" pita ishod (pronađena / nije pronađena / prekinuta), koji se vidi u Mojim tragovima. Potragu vodi vodič psa krvara ili lovočuvar; ranjenoj divljači ne prilazi sam.'],
      ['Moji tragovi', 'Snimljene ture sa kilometrima, trajanjem i oblikom rute. Potraga za ranjenom divljači šalje se i dok traje, da je vodič psa može pratiti.'],
      ['Slike lovcima', 'Meni → Evidencija → "Slike lovcima" → "Pošalji slike", ili u bilo kojoj velikoj slici dugme "Pošalji lovcu": do 6 slika odjednom (npr. trofej sa više strana), vrsta (Trofej, Trag, Divljač, Teren, Ostalo), do 5 lovaca i poruka. Slike istog slanja stižu kao jedna kartica; dodir otvara galeriju koja se lista strelicama ili prevlačenjem prsta, a filter "Trofej" pokazuje samo trofeje. Server sliku čuva najviše 12 sati i briše je čim je lovac preuzme; kod tebe i kod njega slika ostaje na telefonu. Bez interneta slika čeka i šalje se kad se veza vrati. Šalju i primaju samo odobreni članovi društva; administrator ne vidi tuđe slike.'],
      ['Arhiva lova na telefon', 'Meni → Arhiva lova → otvori lov → "Preuzmi lov na telefon": pravi se jedan fajl (otvara se u pregledniku i bez interneta) sa podacima o lovu, rezultatom, ulovom, učesnicima, slikama i crtežom tragova kretanja. U aplikaciji se čuva u Preuzimanja/Lovac (na starijem Androidu biraš gdje). Da bi tragovi bili u fajlu, lov prvo jednom prikaži na karti. Fajl ne zamjenjuje službeni lovački dnevnik.'],
      ['Fotografije', 'Smanjuju se prije čuvanja. Na server ide sličica trajno, a velika slika ograničeno vrijeme. "Slika na poziciji" ostaje samo na telefonu.'],
    ],
  },
  {
    id: 'sekcija', naslov: 'Sekcije i pristup',
    uvod: 'Društvo ima revire, a revir sekcije. Svaka sekcija ima lovovođu sekcije, a revir lovočuvara.',
    stavke: [
      ['Pristup sekciji', 'Meni → Sekcije i pristup: zatraži pristup. Bez odobrenja lovovođe sekcije, lovočuvara revira ili administratora nema ulaza u sekciju. Kad odluka stigne (primljen, odbijen uz razlog ili prebačen u drugu sekciju), dobiješ obavijest dok je aplikacija otvorena, a na Meniju se uz Sekcije i pristup pojavi crvena tačka dok poruku ne potvrdiš sa U redu.'],
      ['Odobravanje zahtjeva', 'Lovovođa sekcije, lovočuvar revira i administrator vide ime podnosioca, odobravaju ili odbijaju (Odbij otvara polje za razlog koji podnosilac vidi; odbijanje se potvrđuje drugim dugmetom), a pogrešno prijavljenog prebace u drugu sekciju. Kad čeka više zahtjeva, Upravljanje → Odobri sve (drugi dodir). Ispod je historija zadnjih odluka: ko je koga primio ili odbio i zašto.'],
      ['Opis i spisak sekcije', 'Lovovođa sekcije u Upravljanju upisuje opis sekcije i mjesto okupljanja (vide se na kartici sekcije) i izvozi spisak članova kao CSV za Excel (prezime, ime, nadimak, uloga, član od).'],
      ['Tab sekcije', 'Dugme u donjoj navigaciji nosi ime tvoje sekcije. Pokazuje lovce (ko je aktivan), tekući lov, poruke, rukovodstvo (samo lovovođe sekcije i lovočuvari) i podatke sekcije.'],
      ['Poruke', 'Poruke vide članovi sekcije, lovovođa sekcije, lovočuvar i administrator. Obavijest stiže samo dok je aplikacija otvorena.'],
      ['Gdje si?', 'Dugme uz lovca pita gdje se nalazi. On odgovara sa Da ili Ne; Da pokreće dijeljenje lokacije sa sekcijom na sat vremena.'],
      ['Grupe u sekciji', 'U tabu sekcije kartica Grupe: grupa nema naziv, prepoznaje se po grupovođi, a lovac je u jednoj grupi. Lovovođa sekcije (i lovovođa revira, lovovođa društva, administrator) pravi grupu tako što izabere lovca iz sekcije za grupovođu i raspoređuje lovce; grupovođa može dodati lovca u svoju grupu ili ga izvaditi. Ko nije ni u jednoj grupi vidi se pod Bez grupe. Grupu uklanja upravljač drugim dodirom (lovci ostaju bez grupe). Radnje traže internet.'],
      ['Lov po grupi', 'Grupovođa pravi lov za svoju grupu (Novi lov → lovci njegove grupe; dugme za proširenje dodaje i ostale članove sekcije). Lovovođa revira organizuje lov u cijelom reviru. Lovovođa sekcije, lovovođa društva i administrator organizuju lov za grupu tek kad grupovođa to dopusti: u kartici Grupe dugme o dopuštenju vidi samo grupovođa te grupe. Zahtjeve za ulaz u sekciju odobrava i lovovođa revira te lovovođa društva. Administrator u Postavke → Korisnici i odobrenja pravi novog korisnika dugmetom Novi korisnik: izabere sekciju i ulogu (član, grupovođa nove grupe, lovovođa sekcije, lovovođa revira, lovočuvar ili lovovođa društva), a ulogu može dodijeliti i kasnije u Upravljanje → Uloge.'],
      ['Struktura LD Grmeč', 'Postavke → Struktura LD Grmeč (vide ga administrator, predsjednik, lovočuvari i lovovođe): ko vodi udruženje — predsjednik, dva lovočuvara udruženja, lovovođa udruženja, lovovođe sva tri revira, lovovođa svake sekcije i grupovođe grupa, sa brojem članova i lovaca. Prazno mjesto piše Nije postavljen ili Slobodno mjesto. Administrator u istom tabu uređuje vodstvo: uz svako mjesto dodijeli ulogu postojećem članu (Dodijeli), skine je (Skini, drugi dodir) ili napravi nalog za prazno mjesto (Napravi nalog); u sekciji može dodati grupu. U grupi administrator, lovovođa sekcije, revira i udruženja prave novog lovca odmah u toj grupi (Napravi lovca u ovoj grupi) ili dodaju postojećeg člana bez grupe; to je moguće jer grupa postoji samo sa grupovođom. Lovci u grupi su zadano sklopljeni (dodirni strelicu uz grupu ili "Prikaži sve lovce" / "Sklopi lovce"). Na širokom ekranu (računar) revir i vodstvo su raspoređeni u kolone. Ko već ima neku ulogu ne nudi se u spisku za dodjelu druge uloge dok mu se prva ne skine. Korisnika koji koristi aplikaciju, a ne treba se vidjeti u pregledima, administrator sklanja u Korisnici i odobrenja → Upravljanje → Sakrij iz pregleda. Ispod stabla su brojke i dugme za Korisnici i odobrenja. Prikaz radi i bez interneta, a izmjene traže internet.'],
      ['Biranje grupe', 'Lovac se sam registruje i traži sekciju; čim uđe u aplikaciju (uz internet) iskoči dijalog Izaberi grupu sa grupovođama te sekcije (Kasnije pita ponovo pri sljedećem pokretanju, Nemam preferenciju ostavlja raspored lovovođi). Izbor se može napraviti i kasnije: u Sekcije i pristup dodirne Izaberi grupu i izabere grupovođu čijoj grupi želi pripadati. Kad mu članstvo odobre, odmah ulazi u izabranu grupu. Ako je već član bez grupe, izbor čeka odobrenje: lovovođa sekcije ili grupovođa te grupe ga odobri u kartici Grupe (Odobri).'],
      ['Članovi i grupe (vodstvo)', 'Meni → Članovi i grupe vide samo vodstvo društva: administrator, predsjednik, lovočuvari udruženja i lovovođa udruženja vide cijelo društvo, a lovovođa revira (i lovočuvar pojedinog revira) samo svoj revir. Prikaz je stablo revir, sekcija, grupa, članovi: brojke (članova, grupa, bez grupe, čekaju), pretraga po lovcu, grupovođi ili sekciji, filteri Bez grupe, Čekaju i Vodstvo, Rasklopi sve i Izvezi (Excel). Imena lovaca koji tek čekaju odobrenje vidi lovovođa sekcije; ovdje se samo broje. Nalozi lovočuvara i lovovođa prave se samo preko administratora (Novi lovac sa ulogom). Za predsjednika i lovočuvare udruženja treba pokrenuti migraciju 048.'],
      ['Moja grupa', 'Lovac i grupovođa u donjoj navigaciji imaju tab Grupa (umjesto naziva sekcije; ekran se zove Moja grupa). Na vrhu je grupovođa, lovci grupe i brojke, pa Lov grupe: ko dolazi na tekući ili sljedeći lov (Prisutan, Nije odgovorio, Ne dolazi), tvoj odgovor Dolazim / Ne dolazim, Raspored na karti i, za grupovođu, Novi lov grupe i vođenje lova. Nisu svi lovci grupe prisutni na svakom lovu: prisustvo se javlja za svaki lov posebno. Dalje su Lovci grupe (aktivnost u lovu, Na karti, Poruka, Gdje si?), Poruke grupe (vide ih lovci te grupe, lovovođa sekcije i lovočuvar revira, ne cijela sekcija) i Statistika grupe iz lovova grupe na telefonu. Dugme Cijela sekcija otvara raniji ekran sekcije. Lovovođa sekcije, lovočuvar i administrator ostaju na tabu sekcije. Poruke grupe traže da je na serveru pokrenuta migracija 046.'],
      ['Lov grupe na mapi', 'Kad tvoja grupa ima lov koji je u toku ili tek dolazi, na vrhu mape stoji traka Lov grupe (danas, sutra, u toku) sa brojem prisutnih. Dodir na traku otvara Moju grupu, gdje javljaš Dolazim ili Ne dolazim. Pitanje Dolaziš na lov dobijaju samo lovci te grupe; lov cijele sekcije pita sve članove sekcije. Traka se računa iz podataka na telefonu i radi bez interneta.'],
      ['Ulov po grupama', 'Kad prijaviš ulov društvu, prijava nosi i tvoju grupu. Lovovođa sekcije, lovočuvar i administrator u Meni → Pregled vide Po grupama. U tabu sekcije, u kartici Grupe, lovovođa sekcije vidi za svaku grupu koliko ima lovaca, lovova i koliko ih je bilo na zadnjem lovu grupe. Za prikaz grupe u prijavama treba pokrenuti migraciju 047, a bez nje prijave rade kao i prije.'],
      ['Uloge', 'Administrator (cijelo društvo), lovočuvar (svoj revir), lovovođa sekcije (svoja sekcija) i lovac. Uloga se uvijek određuje na serveru.'],
      ['Tab Sekcije (admin i lovočuvar)', 'Spisak lovaca svake sekcije je zadano sklopljen. Dodir na sekciju u spisku gore rasklapa njene lovce, drugi dodir ih sklapa; isto radi dodir na naslov "Lovci sekcije".'],
      ['Sekcije po revirima', 'Lovočuvar revira (i administrator) u Sekcije i pristup pravi nove sekcije u svom reviru, postavlja lovovođu sekcije i ovlaštene za pravljenje sekcija (oni smiju praviti sekcije u tom reviru). Članove sekcije dodaje i odobrava lovovođa sekcije. Sekciju u drugi revir premješta samo administrator.'],
    ],
  },
  {
    id: 'lov', naslov: 'Zajednički lov i sigurnost',
    uvod: 'Lovovođa sekcije u tabu sekcije dodirne "Novi lov" i u formi upiše naziv, datum, okupljanje i napomenu, izabere učesnike i po želji odmah pokrene lov. Članovi javljaju da su prisutni.',
    stavke: [
      ['Dodaj lov', 'Lovovođa sekcije (i administrator) u ploči + na mapi dodirne "Dodaj lov", izabere lovce sa spiska sekcije (pretraga, "Označi sve" ili "Kao zadnji lov") i za svakog dodirom bira Strijelac ili Pogonič. Upisuje se vrijeme i mjesto okupljanja. Zadano se lov odmah pokreće; ako se ne pokrene, ploča + do pokretanja nudi "Lov danas" sa dugmetom "Pokreni lov". Za pravljenje lova potreban je internet.'],
      ['Kraj lova', 'Na traci lova na karti (SOS, Lokacija, Tok, Kraj) dugme "Kraj": vođa, organizator ili lovovođa sekcije bira "Završi lov za sve" (drugi dodir potvrđuje). Svaki lovac može "Izađi iz lova na ovom telefonu" — prestaje slanje tvoje pozicije i traka nestaje samo kod tebe, a lov za ostale traje dok ga vođa ne završi. Lov stariji od jučer se više ne smatra aktivnim, čak i ako ga niko nije završio.'],
      ['Vođenje lova', 'Vođa lova (organizator, lovovođa sekcije ili administrator) u ekranu "Lov traje" ima "Dodaj lovce" (sa ulogom) i "Završi lov" (drugi dodir potvrđuje). Pregled pokazuje stanje pogona iz toka lova i ulov upisan u lovu, uz "Upiši odstrel".'],
      ['Lov traje', 'Dok traje lov u kojem si, ploča + umjesto "Dodaj lov" ima "Lov traje". Pregled: početak i trajanje, tvoja uloga i stan, vođa, napomena, zadnja poruka i slike. Lovci: ko dijeli lokaciju uživo, udaljenost i strana svijeta od tebe, a dodir na lovca pokazuje njegove poruke i slike iz lova i "Na karti". Poruke: razgovor svih u lovu, sa brzim porukama; broj nepročitanih se vidi na dugmetu u ploči +. Slike: dodaj sliku iz lova (šalje se kad bude interneta). Radi i bez interneta iz onoga što je na telefonu.'],
      ['Raspored', 'Meni → Zajednički lov: stanovi, učesnici i uloge. Raspored se preuzima na telefon i radi bez interneta. Lov napravljen u tabu sekcije još nema stanova: na karti tada piše "Raspored još nije postavljen", a vođa lova (organizator, lovovođa sekcije, administrator) ima dugme "Postavi stanove" (kasnije "Uredi raspored") — pomjeri kartu da križ na sredini bude na stanu i dodirne "Postavi stan ovdje". Za postavljanje treba internet.'],
      ['Dolaziš na lov?', 'Kad lovovođa sekcije napravi lov sekcije, svaki član sekcije dobije pitanje "Dolaziš na lov taj dan?" sa nazivom, datumom i okupljanjem: "Da, dolazim" te upisuje u lov, "Ne mogu" javlja da ne dolaziš, "Kasnije" pita ponovo pri sljedećem pokretanju. Lovovođa sekcije u tabu sekcije vidi koliko ih dolazi i ko ne dolazi. Bez interneta odgovor čeka na telefonu i šalje se kad se pojavi veza. Obavijest stiže dok je aplikacija otvorena ili radi u pozadini (nema push servisa).'],
      ['Sektori pucanja', 'Za svaki stan se računa smjer prema ostalim stanovima. Aplikacija upozorava kad je pravac zabranjen. To je pomoć, a ne zamjena za vođu lova.'],
      ['Tok lova', 'Komande vođe (početak pogona, kraj, okupljanje, prekid) stižu svima; svaki lovac javlja da je na stanu, da je napustio stan ili pauzu. PREKID se šalje i SMS-om. Učesnici su sažeti po stanju; ekran se zatvara sa × gore (ostaje vidljiv i kad listaš) ili "Zatvori tok lova" na dnu.'],
      ['SOS', 'Šalje se serveru (ako ima veze) i uvijek kao SMS ostalim učesnicima, sa koordinatama. U SMS-u pritisni Pošalji.'],
      ['Lokacija u lovu', 'Dok je lov u toku, pozicija se dijeli sa učesnicima; to se može isključiti. Kraj lova gasi dijeljenje.'],
      ['Arhiva', 'Meni → Arhiva lova: završeni lovovi sa učesnicima, rezultatom, slikama i tragom kretanja lovaca. Tab "Kalendar" pokazuje mjesec po mjesec dane sa lovom (zeleno); dodir na dan otvara lov.'],
      ['Brisanje lova', 'U detalju lova u arhivi administrator i lovovođa sekcije tog lova imaju "Obriši lov" (drugi dodir potvrđuje). Briše se lov za sve: raspored, učesnici, trag kretanja, tok i slike. Poruke i prijave ulova ostaju. Potreban je internet.'],
      ['Lov iz arhive na karti', 'U detalju lova "Prikaži lov na karti" crta tragove lovaca i slike lova (one koje imaju lokaciju). Sa desne strane karte su dugmad Tragovi i Slike — svako se posebno prikazuje ili sakriva — i Sakrij, koje skida lov sa karte. Dodir na sliku je otvara veliku.'],
    ],
  },
  {
    id: 'danas', naslov: 'Svjetlo, vrijeme, vjetar, Divljač, Pregled i statistika',
    uvod: 'Meni sadrži i pomoćne ekrane.',
    stavke: [
      ['Svjetlo, vrijeme, vjetar', 'Meni → Svjetlo, vrijeme, vjetar (ranije "Danas"): svjetlo od svitanja do sumraka na luku i vrijeme sa smjerom vjetra. Lovno vrijeme i lovostaj prikazuju se samo ako ih je administrator unio; inače piše da nisu uneseni.'],
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
            ['Minirana područja', 'Granice lovišta → Minirana područja (BHMAC): minski sumnjiva područja za Bosansku Krupu, Bužim i Cazin crveno na karti (crvena popuna, linija crvena). Aplikacija ih sama preuzme kad ima interneta i provjerava jednom sedmično; poslije se vide i bez interneta. Dodirni područje za podatke. Podaci su orijentacioni i NE zamjenjuju oznake na terenu ni upozorenja nadležnih: ne ulazi u minski sumnjivo područje.'],
            ['Neko dijeli lokaciju sa tobom', 'Kad te neki lovac izabere za dijeljenje lokacije, na dugmetu Moja lokacija se pojavi crvena značka sa brojem, a dobiješ i obavijest dok je aplikacija otvorena. U ploči Moja lokacija je na vrhu ponuda: Dijeli i ti (počinje dijeljenje i tvoje lokacije sa njim, na izabrano vrijeme) ili Ne sada (ponuda se skriva za to dijeljenje). Ništa se ne šalje bez tvog dodira.'],
      ['Ažuriranje', 'Kad se pri pokretanju pojavi traka "Nova verzija", dodirni "Ažuriraj": preuzimanje počinje odmah, traka pokazuje napredak, a kad završi dodirni "Instaliraj" (nije potrebno ići u Postavke). Postavke → Nalog → O aplikaciji: Provjeri ažuriranje ili Preuzmi zadnju verziju. Aplikacija sama preuzme novu verziju na telefon (vidi se napredak u %), sačuva APK fajl u Preuzimanja/Lovac (Android 10 i novije), pa otvori instalaciju; instalacija ide preko postojeće, podaci ostaju. Prvi put telefon traži dozvolu za instalaciju iz ove aplikacije: dozvoli i vrati se, instalacija kreće sama.'],
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
