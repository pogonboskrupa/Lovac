# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekat

Terenska aplikacija **Lovačko društvo "Grmeč"** za lovce tog društva (Unsko-sanski kanton, FBiH). Isporučuje se kao **APK** (Android WebView omotač oko web aplikacije). Webapp na GitHub Pages služi samo za razvoj i test — lovac stvarno koristi APK u lovištu, često bez signala.

Izmjena je gotova tek kad:
- radi u APK-u, ne samo u browseru;
- radi potpuno offline (karta, GPS, unos, pregled), a dijeli se kad se pojavi internet;
- ne kvari ništa što već radi.

Jezik: bosanski u UI-ju, komentarima i commit porukama ("historija", ne "istorija"; "sistem", ne "sustav"). Tehnički termini ostaju na engleskom. Tekst korisniku kaže "server", ne "GitHub/Supabase".

## Arhitektura

- **Front**: jedan `index.html` + JS moduli u `static/js/`. Leaflet i turf.js su lokalne kopije u `static/libs/` (nikad samo CDN). `sw.js` kešira app shell i pločice.
- **Android** (`android/`): `MainActivity` sa WebView-om koji servira assets kroz `WebViewAssetLoader`. Native mostovi (`addJavascriptInterface`): `AndroidGps` (foreground servis za snimanje), `AndroidShare`, `AndroidNotif` (WebView nema `window.Notification`), `AndroidUpdate` (APK update jednim tapom), `AndroidPrint`. Fiksan debug keystore je u repou — bez njega update preko postojeće instalacije pada ("App not installed").
- **Server**: Supabase (Postgres + RLS + Realtime). Migracije u `supabase/migrations/*.sql`, pokreću se **ručno** u SQL Editoru, moraju biti idempotentne (`IF NOT EXISTS`, `CREATE OR REPLACE`) i imati SQL test u `tests/sql/`.
- **Pristup**: provjerava se na serveru (RLS), nikad samo u JS-u. Uloga je kolona `is_admin` koju postavlja samo admin kroz SECURITY DEFINER funkciju; trigger štiti `is_admin`/`odobren` od samopromocije. Na svim tabelama sa podacima stoji RESTRICTIVE politika `je_odobren()`; svaka SECURITY DEFINER funkcija sama provjerava `je_odobren()`/`je_admin()`. Uloga se nikad ne izvodi iz imena.
- **Vidljivost zapisa** (objekti, opažanja, odstrel, tragovi): `privatno` (zadano) / `drustvo` / `izabrani` (`dijeli_sa uuid[]`). Admin vidi `drustvo`, ne vidi `privatno`. Provodi RLS.
- **Offline-first**: svaki upis ide prvo lokalno (localStorage za male, IndexedDB za velike podatke), zatim u red čekanja sa klijentskim UUID-om (idempotentno, retry/backoff, dedup), pa na server kad ima veze. Neposlano se nikad ne briše. Pokretanje sa keširanim profilom ulazi ODMAH; sesija se dohvata tiho u pozadini.
- **Admin spiskovi** (vrste, lovostaj, lovno vrijeme, vrste objekata): kod, naziv, redoslijed, aktivno; sklanjanje umjesto brisanja; klijent kešira i ima zadani spisak. Propisi (datumi, pravila) se NIKAD ne zakucavaju u kod — unosi ih admin, uz zapis ko je i kad promijenio.
- **CI** (GitHub Actions, `ubuntu-24.04`): JS testovi → SQL testovi → Playwright (paralelno) → build APK → emulator test → GitHub Release `vX.Y.Z` (latest, pa `releases/latest/download/app-debug.apk` uvijek vodi na zadnju verziju).

## Komande

```bash
npm test                                   # Node testovi (tests/js/**/*.test.mjs)
node --test tests/js/geo.test.mjs          # jedan Node test
npx playwright test --trace off            # browser testovi (sam diže scripts/serve.mjs na :8123)
npx playwright test tests/e2e/karta.spec.mjs --trace off -g "podloge"   # jedan browser test
npm run serve                              # webapp lokalno na http://localhost:8123
PGHOST=... PGUSER=... PGDATABASE=... bash scripts/sql-test.sh   # migracije 2x (idempotentnost) + tests/sql/*.sql
```

- SQL testovi rade nad običnim Postgres 16 + `tests/sql/setup/supabase_stub.sql` (imitira `auth.users`, `auth.uid()`, uloge `anon`/`authenticated`). Korisnik se glumi sa `set local role authenticated` + `set_config('request.jwt.claim.sub', ...)`. Svaki test fajl je u transakciji sa `rollback`.
- Lokalni Postgres: binarni fajlovi su u `/usr/lib/postgresql/16/bin`; initdb pokretati kao korisnik `postgres` u direktoriju van scratchpad-a (npr. `/var/tmp`).
- Java/Android se kompajlira samo u CI-ju (sandbox nema Android SDK). Emulator test (`scripts/emulator-smoke.sh`) traži `BOOT_OK` u logcat-u (`LovacJS` tag) — `boot.js` ga loguje na kraju pokretanja.
- Gradle `copyWeb` task kopira `index.html`, `sw.js` i `static/` u `android/app/src/main/assets/www/` (gitignored); APK servira sa `https://appassets.androidplatform.net/assets/www/`.
- `static/js/config.js`: `GITHUB_REPO` CI zamjenjuje stvarnim imenom repozitorija pri buildu; Supabase URL/key se upisuju ručno (vidi `docs/SERVER.md`).
- Moduli u `static/js/` ne diraju DOM pri importu, pa ih Node testovi direktno importuju (stvarni kod, ne kopije).

## Pravila rada

- **Verzija na TRI mjesta, uvijek zajedno**: `html/index.tpl.html` (`APP_VER = 'vX.Y.Z'`, pa `npm run build:html`), `sw.js` (`APP_VERSION`), `android/app/build.gradle` (`versionName` + `versionCode`, koji raste +1 pri svakoj izmjeni).
- **Šema brojeva**: Z ide 0→9, pa raste Y (v1.1.9 → v1.2.0, nikad v1.1.10). Isto važi za Y.
- **Svaka gotova izmjena koda = release**: bump, commit (bosanski, objašnjava UZROK), push, provjera da je CI zelen i da Release ima APK — tek onda javiti korisniku.
- **Testovi**:
  - Node testovi čitaju stvarni kod (izvlače funkcije iz izvora), ne prepisane kopije;
  - browser testovi idu kroz Playwright nad stvarnim Leafletom;
  - SQL testovi idu nad testnom bazom u CI-ju;
  - novi test mora pasti na starom kodu prije nego se proglasi dobrim.
- **Java**: CI je jedini kompajler. Java izmjena nije gotova dok CI ne prođe.
- **Migracije se pokreću ručno**: u upitima koristiti `select('*')`, ne nabrajati kolone koje možda još ne postoje.
- Sigurnosne funkcije (sektori pucanja u zajedničkom lovu) moraju imati testiranu geometriju; UI uvijek kaže da ne zamjenjuju pravila lova i vođu lova. Evidencija odstrela ne zamjenjuje službeni lovački dnevnik.

## Poznate zamke (ne ponavljati)

**Mreža**
- `navigator.onLine` laže `true` na mrtvoj vezi, a mrežni poziv tada VISI, ne pada. Svaki poziv mora imati rok preko `AbortController` + `setTimeout` (`AbortSignal.timeout()` ne postoji na starijim WebView-ima).
- Kvalitet veze se mjeri pasivno iz stvarnih zahtjeva (nema / slaba / dobra) i po tome se odlučuje.

**Pokretanje**
- Sigurnosne mreže pri pokretanju (`window.onerror`, `unhandledrejection`) ne smiju voditi na login kad postoji keširan profil.
- Pokretanje dira DOM koji još ne postoji: sva obnova ide kroz jednu funkciju koja čeka `DOMContentLoaded`, svaki korak ima svoj try/catch.

**Pohrana**
- Kvota localStorage (~5 MB): kritični upisi (trag, odstrel) idu kroz funkciju koja GLASNO javlja neuspjeh, nikad kroz goli `catch {}`. Veliki podaci idu u IndexedDB.

**Leaflet**
- Canvas pane iznad drugog guta sve klikove, a Leaflet nikad sam ne ukloni canvas renderer. Novi interaktivni sloj u višem pane-u traži hit-test fallback ili `interactive:false`. Prazan renderer treba osloboditi.
- Odgovor 200 koji nije slika (WMS greška kao XML) se ne kešira kao pločica — provjeriti `Content-Type`.
- Blob URL pločice se oslobađa tek na `tileunload`, ne na `onload`.
- Offline karta (MBTiles/SQLiteDB): veliki fajl čita native strana ili OPFS, nikad cijeli u memoriju. Ispod najnižeg nivoa u fajlu ne traže se pločice (stotine čitanja odjednom zamrznu telefon).
- GPS visina je iznad elipsoida (~45 m previše) — N.V. ide iz Terrarium DEM-a, GPS samo kao rezerva.

**DOM / kod**
- Pozicija u DOM-u nije indeks u nizu: svaki red sortirane liste nosi `data-id` na elementu.
- Jedan nezatvoren `<div>` sakrije sve iza sebe — test provjerava saldo `<div>` u `<body>`.
- Dvije funkcije istog imena: zadnja tiho pobjeđuje — test provjerava jedinstvenost imena funkcija.
- Regex unutar template stringa (worker kao string) traži udvostručen backslash.

**WebView / Android**
- Tastatura prekriva donje listove uz edge-to-edge: WebView ide u omotač kojem se postavlja donji padding = IME inset; u webapp-u `interactive-widget=resizes-content`.
- WebView nema `window.Notification` ni pouzdan `navigator.share` / `window.print` → native mostovi.
- `capture` atribut kamere WebView ignoriše → za "Uslikaj" ide `ACTION_IMAGE_CAPTURE` intent.
- `<input type=file>` u WebView-u ne radi bez `WebChromeClient.onShowFileChooser` (MainActivity: izbor slike + kamera u jednom chooser-u; dozvola za upis kameri ide kroz `ClipData`, jer se kroz `EXTRA_INITIAL_INTENTS` ne prenosi). CAMERA dozvola se namjerno NE deklariše: ako je u manifestu, `ACTION_IMAGE_CAPTURE` je traži.
- OEM battery manager ubija cijeli proces: pri prvom snimanju tražiti izuzeće od optimizacije baterije. Bez push servisa NE obećavati "javićemo i kad je app ugašena".

**Ažuriranje**
- U APK-u se service worker NE koristi (i odjavljuje se): cache-first SW bi nakon instalacije novog APK-a servirao stari app shell.
- Provjera nove verzije ide prvo preko `version.json` na grani `verzija` (CI ga objavljuje nakon Release-a, `raw.githubusercontent.com`), a GitHub API je rezerva: API ima limit 60/sat po IP-u, a mobilni operateri dijele IP. Neuspjela provjera se prikazuje kao greška, nikad kao "nema nove verzije". U Postavkama je uvijek dostupno "Preuzmi zadnju verziju".

**Snimanje traga**
- Pauza se pamti kao vremenski intervali (trajno); inače native replay ubaci tačke iz pauze ili odbaci tačke prije nje. Stop zatvara otvoren interval.
- Dijeljeni tajmer (crash-snimak više snimanja) gasi se tek kad NIJEDNO snimanje ne traje.
- Arhitektura: `GpsService` (foreground, `START_STICKY`, wake lock) piše SVE tačke u `GpsBuffer` (`filesDir/gps-buffer.jsonl`); JS (`snimanje.js`) čita od bajt-pomaka preko `AndroidGps.read(offset)` i filtrira po intervalima traga (start/kraj/pauze) u `trag.js mergePoints`. Bafer se briše tek kad nema aktivnog NI nedovršenog traga.
- `LocationListener` na Androidu ≤ 10 nema default metode: `onStatusChanged/onProviderEnabled/onProviderDisabled` moraju biti implementirane (inače AbstractMethodError).
- Emulator: logcat bafer je 16 MB, a BOOT_OK se čeka 150 s uz JEDAN ispisan ponovni pokušaj (hladan start WebView-a na emulatoru je ponekad spor).
- Emulator test snimanja: `am start -e autotest trag` → JS loguje `TRAG_TACAKA n` i `TRAG_SERVIS true|false` (iz `AndroidGps.isRunning()`), a skripta šalje `adb emu geo fix`. Autotest ne traži izuzeće od baterije (dijalog bi prekrio app).

**Pločice**
- Mrežno preuzimanje pločica ide kroz `createLimiter` (max 6 istovremeno, najnovije prvo, prekid na `tileunload`/`tileabort`); bez toga spor server i slab signal ugase sve zahtjeve odjednom. Keš pločica ima gornju granicu (`MAX_CACHED_TILES`).

**Zapisi i spiskovi**
- Objekti/opažanja/odstrel idu kroz `zapisi.js` (`newRecord`/`updateRecord`: klijentski UUID, `vidljivost: 'privatno'`, `rev` +1, `sinhronizovano: false`). Fotografije se smanjuju (`foto.js`, max 1600 px) i čuvaju u IndexedDB store-u `fotografije`; zapis čuva samo id-eve.
- Admin spiskovi (`spiskovi.js`): zadani spisak u kodu samo za nazive (vrste objekata/divljači); `lovostaj` i `lovno_vrijeme` nemaju zadane vrijednosti. Za naziv starog zapisa koristi `getSpisakAll` (i neaktivni redovi).
- Novi store u IndexedDB-u traži podizanje `DB_VERSION` u `db.js` (onupgradeneeded pravi samo store-ove koji fale).

**Sinhronizacija (red slanja)**
- `zapisi.saveRecord`/`deleteRecord` i `snimanje.saveTrack` (samo završen trag) stavljaju zapis u red (`sync.enqueue`, ključ `store:id`, dedup). Šalje se ZADNJA lokalna verzija (upsert `onConflict: 'id'`); brisanje ide kao nadgrobni zapis `obrisan: true`.
- Unos u redu se briše SAMO ako je isti `seq` kao poslani: zapis može ponovo ući u red (izmjena/brisanje) dok slanje traje — inače se nadgrobni zapis izgubi.
- Mreža sigurnosti: svako slanje prvo radi `reconcileQueue()` (vlastiti zapis sa `sinhronizovano: false` kojeg nema u redu ulazi u red). Brisanje: nadgrobni zapis se upisuje u red PRIJE lokalnog brisanja; ako upis u red ne uspije, zapis se ne briše.
- Ručno "Pošalji sad" (`force`) čeka tekuće slanje pa kreće ponovo (tekuće ne zna za nove zapise).
- Server (migracija 004, `cuvaj_rev`): stariji rev ne prepisuje noviji, vlasnik se ne mijenja. Tuđi zapisi stižu kroz `pullShared` (`tudji: true`), ne uređuju se i ne šalju nazad; kad ih vlasnik vrati na privatno, uklanjaju se lokalno.
- Fotografije se (još) NE šalju na server — ostaju na telefonu.
- Potraga (`vrsta: 'potraga'`) se šalje i dok traje (vodič psa krvara je prati); ostali tragovi tek kad su završeni. Potraga i obilazak mogu teći paralelno; panel prikazuje potragu.

**Slojevi (granice lovišta)**
- `slojevi.js`: KML/KMZ/GPX/SHP → GeoJSON u WGS84; ZIP čitač sa `DecompressionStream('deflate-raw')`; SHP u GK zoni 6 se preračunava (`geo.js gk6ToWgs84`, test protiv PROJ). Projekcija iz `.prj`, a bez njega po rasponu koordinata.
- Prikaz u pane-u `slojevi` (zIndex 350, ispod tragova/markera) sa VLASTITIM `L.svg` rendererom koji se uklanja kad nijedan sloj nije vidljiv.
- Admin objavljuje sloj (migracija 005 `slojevi`); spisak sa servera bira samo lake kolone (bez `geojson`), a preuzimanje jednog sloja ide sa `select('*')`.
- `onShowFileChooser`: za ne-slike (`accept` bez `image`) chooser je `*/*` bez kamere — KML/KMZ/GPX nemaju pouzdan MIME na Androidu.

**Offline karte i preuzimanje**
- MBTiles / RMaps SQLiteDB: `KarteBridge` kopira fajl u `filesDir/karte` u komadima; pločice servira `MbtilesPathHandler` na `/mbtiles/<id>/{z}/{x}/{y}` (Android SQLite, pločica po pločicu). MBTiles red je TMS (`2^z-1-y`), SQLiteDB ima `z = 17 - zoom`. Sloj ima `minZoom = minzoom` fajla.
- Preuzimanje područja: samo topo i satelit (OSM pravila zabranjuju masovno preuzimanje), najviše `MAX_PREDOWNLOAD_TILES` (2500); preuzimaju se i DEM pločice.
- Emulator test offline karte: CI pravi `test.mbtiles` (Python sqlite3), ubacuje ga sa `run-as`, a `-e autotest karte` loguje `KARTE_SPISAK` i `KARTE_PLOCICA`.

**Zajednički lov (SIGURNOSNO)**
- Geometrija u `sektori.js` (čista, test za svaki stepen): luk {od, do} u smjeru kazaljke, granice ZABRANJENE; automatski sektor prema SVAKOM drugom stanu lova (bez obzira na udaljenost), polovina širine = max(10°, atan(60 m / udaljenost)); ručni sektori od vođe; spajanje preko sjevera.
- Kompas (`lov.js headingCheck`) ima toleranciju ±10° na sigurniju stranu; UI uvijek kaže da ne zamjenjuje pravila lova ni vođu lova i da kompas može griješiti.
- Migracija 006: vođa lova je uloga PO REVIRU (`revir_vodje`, dodjeljuje admin); lov organizuje admin ili vođa tog revira; raspored vide samo učesnici, organizatori i admin. Telefoni su u tabeli `kontakti` (samo svoj red) i dostupni drugima jedino kroz `lov_telefoni()` za lov U TOKU — kolona u `korisnici` bi procurila svim lovcima.
- Raspored se preuzima u IndexedDB (`lovovi`) i radi offline; organizacija traži internet.
- Uživo (migracija 007): `lov_pozicije` i `sos` samo za učesnike i SAMO dok je lov `u_toku`; pozicije se šalju svakih 20 s, SOS se prima prozivkom (20 s) + Realtime kad je dostupan. Bez push servisa obavijest stiže samo dok je app otvorena — UI to kaže.
- SOS: dva kanala — server (ako ima veze) i UVIJEK SMS (`AndroidSms`, intent `smsto:`, lovac pritisne Pošalji; brojevi iz `lov_telefoni` keširani pri prikazu lova, bez mog broja). Tekst ima WGS84 + GK6 + link.
- Panel lova mora ostati nizak (prekriva stanove na karti): SOS je u donjem dijelu ekrana, izvještaj u spisku lovova.

**Sekcije i pristup (migracija 008)**
- Struktura: reviri (Krupa, Otoka, Jezerski) → sekcije (jedan grupovođa i jedan lovočuvar po sekciji). `grupovodje(korisnik_id, revir_id)` određuje ko smije praviti sekcije u kojem reviru (postavlja admin). Admin pravi/uređuje sve; grupovođa pravi sekciju u SVOM reviru, a revir/grupovođu/lovočuvara mijenja samo admin (trigger `zastiti_sekciju`).
- Pristup: lovac traži (`sekcija_clanovi.status = 'ceka'`), grupovođa/admin odobrava; grupovođa može dodati spisak lovaca odmah kao `odobren`. Lovac se NE može sam odobriti niti dodati kao odobrenog. BEZ ODOBRENJA nema ulaza: `je_clan_sekcije()` daje pristup članovima i lovovima sekcije (`vidi_lov`).
- Lov može imati `sekcija_id`; grupovođa ga organizuje samo za svoju sekciju i samo u revir te sekcije. U RLS politici podupit sa istim imenom kolone (`revir_id`) je tautologija: kolone vanjske tabele se kvalifikuju (`lovovi.revir_id`) — SQL test to hvata.
- Klijent: `sekcije.js` (čista logika), `sekcije-ui.js` (ekran, keš u store `spiskovi/sekcije`); paneli "Upravljanje" pamte da su otvoreni (`otvoreno`), a lista se crta jednom poslije servera.

**Izvoz**
- CSV za Excel (`odstrel.js toCsv`): BOM, `;`, decimalni zarez, `\r\n`; ćelija koja počinje sa `= + - @` dobija `'` (zaštita od formula).
- PDF/štampa: `AndroidPrint.printHtml` (WebView u mostu mora živjeti dok sistem ne preuzme dokument); u browseru iframe `print()`. Izvještaj odstrela uvijek nosi napomenu da ne zamjenjuje službeni lovački dnevnik.

**Propisi, svjetlo, vjetar**
- Sunce: puni NOAA algoritam u `sunce.js` (test protiv Python `astral`, tolerancija 1 min). Lovno vrijeme = admin pravilo (`propisi.js pickRule`: posebno za vrstu, inače opšte); bez pravila UI kaže "nije unio administrator", nikad zadana vrijednost.
- Lovostaj: periodi 'MM-DD' se ponavljaju godišnje i mogu preći Novu godinu (`inPeriod`); vrsta bez ijednog reda = "Nije uneseno". Admin unosi datume kao dd.mm. (`parseDayMonth`).
- Vjetar (Open-Meteo, `timeformat=unixtime`): keš po ćeliji 0,05°; prikazuje se SAMO sat koji obuhvata sada (`currentWind`), uz starost prognoze. Smjer = odakle duva; konus mirisa ide prema smjer+180.
- DEM: Terrarium z13 u Cache API `dem-v1` (`dem.js terrainAt`); termika je samo pravilo palca i to UI kaže.
- U e2e testovima `serveTiles` blokira Open-Meteo i DEM (404); testovi koji ih trebaju ih sami rutiraju. Za vrijeme: `page.clock.setFixedTime` + `test.use({ timezoneId: 'Europe/Sarajevo' })`.

**Raspored ekrana i koordinate**
- Raspored (kao u referentnoj aplikaciji vlasnika): gore lijevo okvir sa MGI koordinatama + razmjerom 1:N + N.V., gore desno podloge, desno dole `+`/opažanje/snimaj/prati/lociranje, lijevo dole zoom sa nivoom, DONJA NAVIGACIJA Mapa/Karte/Meni/Postavke (`nav.js`). Ekrani (`.list-preko`) se otvaraju iznad mape i OSTAVLJAJU navigaciju slobodnom (`inset-bottom: var(--nav-h)`); dodir na tab zatvara sve kroz `handleBack()` pa tek onda otvara traženo.
- Podloga, keš pločica, offline karte (MBTiles) i preuzimanje područja su u tabu **Karte** (`#karte`), ne u Postavkama; događaj `karte:otvorene` osvježava njihov prikaz.
- Meni i "Dodaj" su ploče iznad navigacije (`#meni-spiskovi`, `#meni-dodaj`). Plutajući paneli (navigacija, mjerenje, panel lova) počinju od `--gore-2`; dno mape ide u `.mapa-dno` (kontrole iznad panela snimanja/uživo).
- MGI zona se bira po dužini (`gkZoneFor`: < 16,5° = zona 5, inače 6). Grmeč/Unsko-sanski kanton je u ZONI 5 (Y ~5,6 mil.); koordinate sa terena vlasnika su "MGI 5 Y 5605178, X 4959430". SHP uvoz prepoznaje zonu iz `.prj` ili po rasponu koordinata.

**UI**
- Gornja traka i desna kolona: `.ikona-dugme` ima `flex: none` — inače flex na uskom ekranu stisne dugmad ispod 44 px.
- WebView ne prikazuje `confirm()`/`alert()` bez `onJsConfirm`/`onJsAlert` u `WebChromeClient`: potvrda opasnih radnji ide drugim dodirom na isto dugme.
- Odjava na mrtvoj vezi: `signOut` visi, pa se čeka najviše `SIGNOUT_GRACE_MS`, a lokalni `sb-*` ključevi se brišu uvijek; ekran se mijenja odmah.
- Dugme Nazad: `MainActivity` pita `window.__nazad()`; svaki novi overlay/list registruje zatvaranje sa `registerBackHandler()` iz `ui.js` (zadnji registrovan ide prvi).
- Emoji ikonice izgledaju različito na OEM uređajima → SVG sprite (`<svg class="ic"><use href="#ic-…"/></svg>`).
- Dnevni mod / jako sunce: svaka nova boja mora proći kontrast 4.5:1 i u dnevnoj temi.
- Dodirne mete ≥ 44 px, polja ≥ 48 px, font polja ≥ 16 px (inače WebView zumira).

## Odluke vlasnika projekta

- Lovci istog imena i prezimena razlikuju se poljem **nadimak / broj člana** (neobavezno, dio internog emaila `ime.prezime[.nadimak]@lovci.grmec.app`, kolona `korisnici.nadimak`).
- Admin **NE vidi privatne** zapise.
- **SOS** ide svim aktivnim učesnicima lova koji je u toku tog dana.
- **Vođa lova** je posebna uloga po reviru/sekciji (društvo ima više revira), nije isto što i admin. Šema za revire i vođe dolazi u fazi 3.
- Supabase projekat (i kasnije repozitorij) će biti na drugom nalogu; URL/anon key vlasnik javlja kad napravi projekat. Granice lovišta (KML) i MBTiles stižu kasnije.

**Sekcija (tab), lovočuvar po reviru, poruke, Teren (migracija 009, v0.2.7)**
- Donja navigacija: Mapa / **ime sekcije** / Meni / Postavke. Tab "Karte" ne postoji; Karte i offline su stavka u Meniju (`karte:otvori`). Podloge na mapi: Topo, Satelit, Teren.
- Teren = `teren.mbtiles` iz GitHub Release-a sa tagom `karte` (NIKAD "latest", vidi `docs/KARTE.md`); preuzima ga `AndroidKarte.preuzmi` (samo https/github.com/releases/download).
- Lovočuvar je PO REVIRU (`revir_lovocuvari`, postavlja admin) i prati samo čitanjem sve sekcije tog revira; grupovođa vodi sekciju; lovac može biti član više sekcija.
- Ekran sekcije (`sekcija-ui.js` + čista logika `sekcija-podaci.js`, `poruke.js`): članovi i aktivnost u tekućem lovu (aktivan ≤ 10 min od pozicije), poruke, podaci o sekciji i lovu. Poruke: izlazna kutija u IndexedDB (`poruke`, `sinhronizovano:false`), slanje upsert `ignoreDuplicates`, osvježavanje 20 s otvoreno / 60 s u pozadini; obavijest samo dok je app otvorena.
- Zamka: IndexedDB `getAll` vraća po id-u (UUID) — poruke se uvijek sortiraju po `created_at`; sporije čitanje ne smije prepisati svježe (`reloadPoruke` sa brojačem).

**Dnevno svjetlo i Istraživač (v0.2.8)**
- Čip `#svjetlo-chip` na mapi: zora/dan/sumrak/noć iz `sunce.js daylightStatus` (pozicija = GPS, inače centar karte; svjetlo = izlazak–zalazak, sumrak do kraja sutona). Dodir otvara "Danas".
- Istraživač (`istrazivac-ui.js`, dugme 3D): CSS nagib `#karta` (perspective + rotateX) je SAMO POGLED, pa su dragging/zoom dodirom isključeni (Leaflet ne preračunava perspektivu) i karta prati GPS; trake članova (smjer, strana svijeta, udaljenost) dolaze iz događaja `uzivo:pozicije` i vide se samo u tom modu. Strelice su sjever-gore, kao karta.

**Dijeljenje lokacije u lovu (migracija 010, v0.2.9)**
- Status (veza, GPS tačnost, dnevno svjetlo) NIJE na mapi nego u Postavkama → Status (elementi zadržavaju id-eve); na mapi ostaje samo upozorenje kad veza nije dobra.
- Pozicija se šalje čim je u kešu lov `u_toku` u kojem sam učesnik (`lokacija.js pickActiveHunt`, provjera svakih 60 s), NE samo dok je raspored otvoren; kraj lova gasi slanje i briše moju zadnju poziciju.
- Ekran "Lokacija u lovu" (`lokacija-ui.js`, dugme Lokacija u traci uživo): uključi/isključi dijeljenje (zadano uključeno), učestalost 10/20/60 s, ko dijeli sa smjerom i udaljenošću, "Na karti" / "Vodi me". Isključivanje briše vlastitu poziciju (RLS politika `svoja_brisanje`); ako nema veze, brisanje se pamti (`lovac.lokacija.uklanjanje`) i ponavlja.
- Markeri članova su krugovi sa inicijalima (svježina: uživo ≤ 2 min, zastarjelo ≤ 10, bez signala ≤ 30, poslije se ne crtaju).

**Tok lova (migracija 011, v0.3.0)**
- `lov_dogadjaji` (samo čitanje i dodavanje, bez izmjene): komande `pocetak_pogona/kraj_pogona/okupljanje/prekid` šalje organizator/admin ili učesnik sa ulogom `vodja` (`je_vodja_lova`), a statuse `na_stanu/napustio_stan/pauza` svaki učesnik za sebe; samo dok je lov `u_toku`.
- Klijent `tok.js` (čista logika) + `tok-ui.js`: ekran "Tok lova" (dugme u traci uživo se pojavi čim je lov aktivan, `lov:aktivan`), izlazna kutija `lovac.tok.red` (upsert `ignoreDuplicates`; RLS odbijanje se odbacuje uz poruku), polling 15 s, baner + AndroidNotif za komande drugih (PREKID ostaje dok se ne potvrdi), dvostruki dodir za komande. Prekid traje do novog "Početak pogona". UI kaže da ne zamjenjuje pravila lova ni vođu lova.

**HTML izvor, CI i potpisni ključ (v0.3.1)**
- `index.html` je GENERISAN: izvor je `html/index.tpl.html` + `html/ekrani/<id>.html` (markeri `<!--@ekran:id-->`). Izmjene ekrana idu u `html/`, pa `npm run build:html`; test `html.test.mjs` pada ako se index.html razlikuje. Isto vrijedi za dodavanje ekrana: novi fajl u `html/ekrani/` + marker u šablonu.
- CI: push se NE otkazuje (grupa po `github.sha`), Release job je serijski, a `latest` i `version.json` dobija samo najviša verzija (`sort -V`). Time uzastopni pushevi ne gube Release.
- Potpisni ključ je u javnom repozitoriju — vidi `docs/SIGURNOST.md` (plan pri prebacivanju na novi nalog).

**Pretraga, statistika, pregled stana (v0.3.1)**
- `pretraga.js` (`matchesQuery`: bez dijakritika/velikih slova) u spiskovima odstrela, opažanja i objekata. Statistika odstrela (`odstrel-stat.js`, `odstrel-stat-ui.js`) računa nad lokalnim zapisima; zapis odstrela u lovu nosi `lov_id`, `revir_id`, `sekcija_id` (u `podaci` JSON-u, bez migracije), bez toga je "izvan lova". Godina je kalendarska — datumi lovne sezone se ne zakucavaju (propisi ih unosi admin).
- Pregled stana (`stan.js`, `stan-ui.js`): pravac telefona, sigurnosno stanje sektora, udaljenost, vjetar, svjetlo; dugme u panelu lova.
- PREKID lova šalje i SMS (`tok-ui.js smsPrekid`), brojevi iz `lov_telefoni`, bez mog broja.

**Meni (v0.3.2)**
- `#meni-spiskovi` je ploča iznad navigacije sa tri grupe (Lov, Evidencija, Karta) i pločicama (ikona, naziv, kratka informacija). Informacije (`meni-ui.js menuTexts`) dolaze iz lokalnih podataka pri otvaranju menija: lov u toku, broj odstrela ove godine, opažanja u 30 dana, objekti i popravke, tragovi, dnevno svjetlo. Id-evi dugmadi (`btn-lovovi`…) se ne mijenjaju — na njih se vežu moduli; opis je u `<id>-opis`.

**Postavke (v0.3.3)**
- Ekran je podijeljen u kartice (`.p-kartica`) sa profilom na vrhu (inicijali, uloge iz keša sekcija — `profil.js profileRoles`, nikad iz imena; veza i broj neposlanih). Dijeljenje lokacije i telefon su i ovdje (isti `getShareSettings/setShareSettings` kao ekran lokacije).
- Rezervna kopija (`rezerva.js`): izvoz mojih zapisa u JSON (bez fotografija, bez tuđih i obrisanih), uvoz samo DODAJE zapise kojih nema (nikad ne prepisuje) i šalje ih kroz red slanja. Služi i kao priprema za promjenu potpisnog ključa (docs/SIGURNOST.md).
- Odjava sa neposlanim zapisima traži drugi dodir; bez njih je jedan dodir kao i prije.

**Kreiranje naloga lovaca (migracija 012, v0.3.4)**
- Nalog se pravi SERVEROM: `kreiraj_korisnika(...)` (SECURITY DEFINER) upisuje u `auth.users` + `auth.identities` (bcrypt PIN, kolone tokena ne smiju biti NULL), jer klijent nikad ne drži `service_role` ključ i `signUp` bi zamijenio sesiju pravljača. Interni email računa KLIJENT (`syntheticEmail`, isti kod kao pri prijavi) i server samo provjerava oblik i domenu — tako se prijava i nalog nikad ne razilaze.
- Admin, lovočuvar revira sekcije i grupovođa sekcije prave odobren nalog i odmah ga dodaju u sekciju; običan odobreni član samo PREDLAŽE (nalog neodobren, zahtjev `ceka` sa `pozvao_id`, max 5 odjednom) dok grupovođa/admin ne pozove `odobri_pozvanog` (nalog + članstvo) ili `odbij_pozvanog` (briše nikad odobren nalog). Klijent za zahtjeve sa `pozvao_id` koristi te funkcije, ne tabelu.
- SQL stub `auth.users` ima dodatne kolone i `auth.identities`. PIN koji pravljač zna se mijenja u Postavke → Nalog (`changePin`).
- Lovac ne može sam sebi napraviti nalog u tuđoj sekciji ni odobriti predlog.

**Lov za danas i prisustvo (migracija 013, v0.3.5)**
- Grupovođa (ili admin) u tabu sekcije pravi lov jednim dodirom ("Novi lov za danas": naziv sa datumom, status `planiran`, sebe upisuje kao `vodja`), pokreće i završava ga, dodaje članove sa spiska i uklanja neprisutne (drugi dodir).
- Odobreni član sekcije sam javlja prisustvo ("Prisutan sam"): `lov_ucesnici.samoprijava = true`, uloga uvijek `strijelac`, samo dok je lov `planiran`/`u_toku` i samo u lovu SVOJE sekcije (`moze_prijaviti_prisustvo`). Odjaviti se može samo svoju samoprijavu; one koje je dodao grupovođa ne može. Lovočuvar prati, ne prijavljuje se.
- Kad grupovođa ukloni nekoga, `lov_uklonjeni` pamti da se ne može ponovo sam prijaviti dok ga grupovođa ponovo ne doda (trigger čisti zabranu). Radnje nad lovom traže internet; poslije svake se raspored ponovo preuzima.

**Tab sekcije — dizajn (v0.3.6)**
- Ekran je jedna kolona kartica: hero (uloga, brojevi članova/aktivnih/lovova), lijepljiva navigacija po dijelovima (Lov, Članovi, Poruke, Podaci — skroluje, ne mijenja panel, pa su svi elementi uvijek u DOM-u i vidljivi), kartica lova sa status značkom i brojevima, članovi sa avatarom (inicijali; obojen obrub = aktivnost) i dugmadima ispod teksta. Id-evi (`sk-lov`, `sk-clanovi`, `sk-poruke`…) se ne mijenjaju.

**Veličina teksta i Moj pas (v0.3.7)**
- Za starije lovce: Postavke → Veličina teksta (Normalno / Veliko / Najveće, `prikaz.js`, `data-velicina` na `<html>`). CSS `zoom` se primjenjuje na SADRŽAJ `.list-preko > *` i `.meni-grupe > *`, ne na okvir (inače `inset-bottom: var(--nav-h)` izlazi iz mjere i donja navigacija se pomjera); meni prelazi u jednu kolonu. Leaflet/mapa se ne zumira (pokvarilo bi koordinate dodira).
- Moj pas (`pas.js`, `pas-ui.js`): aplikacija NE čita ogrlice ni AirTag/Xiaomi tagove (nema javnog API-ja; to su tuđe mreže/aplikacije). Lovac zalijepi poziciju koju ogrlica pošalje (koordinate, MGI Y/X, link karte, geo:, stepeni/minute) i dobije marker, trag (do 50 tačaka), udaljenost i smjer od sebe, "Vodi me". Radi bez interneta, sprema se lokalno (`lovac.pas`); pozicija starija od 10 min se označava kao stara. Kratki linkovi (goo.gl…) se ne mogu razriješiti offline.

**Čistija mapa i "Moja lokacija" (migracija 014, v0.3.8)**
- Okvir gore lijevo ima JEDAN red: N.V. + sistem + koordinate centra karte. Dodir mijenja sistem WGS84 → MGI 5 → MGI 6 → WGS84 (`geo.js nextCoordMode/formatCoordMode`, pamti se `lovac.koord`); razmjer i drugi koordinatni red su uklonjeni. Kopiranje koordinata je u ploči "Moja lokacija".
- Desno na mapi samo `+` (`#btn-dodaj`) i `#btn-moja-lokacija`. Dodir na lokaciju centrira na mene (bez animacije — animirani zum koji traje ignoriše sljedeći `setView`) i otvara ploču `#lok-ploca`: GPS status, koordinate, Centriraj / Prati me / Snimaj trag / Opažanje / Istraživač 3D / Kopiraj (id-evi dugmadi su isti kao prije, pa moduli rade nepromijenjeno; ploča se zatvara poslije radnji sa `data-zatvori`) i dijeljenje lokacije sa sekcijom.
- Dijeljenje sa sekcijom (`lokacija-sekcija.js`, `lokacija-sekcija-ui.js`): 1 h / 4 h / do kraja dana (server dozvoljava ≤ 24 h), šalje se `sekcija_lokacije` svakih 10/20/60 s (isto podešavanje kao u lovu), prekid i istek brišu red. Vide ga članovi, grupovođa i lovočuvar te sekcije, ADMIN NE (nije dio sekcije); marker je teal sa inicijalima, spisak sa smjerom i udaljenošću je u ploči.
- E2e testovi koji kliknu dugmad iz ploče koriste `lok(page, '#btn-...')` iz `tests/e2e/helpers.mjs`.

**Rukovodstvo i slika na poziciji (migracija 015, v0.3.9)**
- Komunikacija: lovočuvar revira sa članovima sekcije i grupovođom sekcije razgovara kroz kanal SEKCIJE (`je_clan_sekcije` uključuje lovočuvara svog revira — čita i piše). Grupovođe i lovočuvari međusobno (i admin) imaju kanal Rukovodstvo: ista tabela `poruke`, `kanal = 'rukovodstvo'`, `sekcija_id` null, politike preko `je_rukovodstvo()`; članovi ga ne vide. Klijent: kartica "Rukovodstvo" u tabu sekcije (`isLeadership`), nepročitane ulaze u značku, izlazna kutija i `flushOutbox` nose `kanal`.
- Slika na poziciji (`slike.js`, `slike-ui.js`, "+" → Slika na poziciji): kategorija Čeka / Lovački objekat / Ulov / Drugo, fotografija (smanjena kao i ostale, `fotografije` store) + kvadratna sličica 112 px kao dataURL u zapisu (`slike` store, DB_VERSION 6), pozicija GPS ili nišan. Na karti je sličica sa obrubom u boji kategorije; dodir daje opis, udaljenost, "Veća slika" i brisanje (drugi dodir briše i fotografiju). Slike ostaju NA TELEFONU (ne šalju se na server, kao ni ostale fotografije).

**Kamere i tačke na tragu (migracija 016, v0.4.0)**
- Kamere (`kamere.js`, `kamere-ui.js`, "+" → Kamera): lokaciju vide i unose SAMO lovočuvari revira (`je_lovocuvar_revira`; ni grupovođa, ni član, ni admin — admin sebe može postaviti za lovočuvara). Offline-first: zapis u IndexedDB (`kamere`, DB_VERSION 7) sa `sinhronizovano:false`, upsert kad ima veze, pull svakih 60 s; ko nije lovočuvar nema dugme, markere ni keš (briše se). Skidanje = `aktivno=false` (drugi dodir), revir se ne mijenja (trigger).
- Tokom snimanja traga panel ima "Dodaj tačku" (naziv neobavezan; `snimanje.addWaypoint` → `tackeInteresa` u zapisu traga, ide na server sa tragom) i "Dodaj sliku" (događaj `slika:nova` → forma slike sa `trag_id`). Tačke se crtaju ljubičastim rombom.

**Arhiva lova i trag kretanja (migracija 017, v0.4.1)**
- Server upisuje `lovovi.pocetak` (prelazak u `u_toku`) i `kraj` (`zavrsen`) kroz trigger `vrijeme_lova`; `rezultat` (tekst) piše upravljač lova (RLS `izmjena`). Arhiva (`arhiva.js`, `arhiva-ui.js`, Meni → Arhiva lova): lovovi `u_toku` i `zavrsen` iz keša `lovovi`, pretraga, detalj (učesnici, `lov_odstrel` = šta se lovilo, rezultat, slike, trag). Detalji se keširaju u store `arhiva` (DB_VERSION 8).
- Slike lova: `lov_slike` (metapodaci + sličica 112 px) i `lov_slike_podaci` (smanjena slika 900 px, dataURL ≤ ~1,2 MB); dodaju učesnici i upravljač (i poslije kraja lova), najviše 40 po lovu; izlazna kutija `arhiva_red` (IndexedDB) šalje kad ima veze. Brišu autor i upravljač.
- Trag kretanja: dok je lov `u_toku` i dijeljenje lokacije uključeno, `uzivo-ui` svakih par sekundi pamti tačku (min 15 m ili 90 s) u lokalni bafer `lovac.lovtrag.bafer.<lov>` i šalje pakete u `lov_tragovi` (`ignoreDuplicates`); bez dijeljenja nema traga. Checkbox "Prikaži trag kretanja lovaca sekcije" je u kartici lova (tab sekcije) — samo prikaz, snima se uvijek; panel lova na karti ostaje nizak, pa tamo nema checkboxa. Iz arhive dugme "Prikaži trag kretanja lovaca na karti" crta tragove sa bojom i imenom svakog lovca (legenda iznad karte).

**Kontrole uz navigaciju, dugmad, kratki tragovi (v0.4.2)**
- Mapa: zoom `+/−` (bez prikaza nivoa), `+` i "Moja lokacija" su tačno 56 px široki i sjede 8 px iznad donje navigacije; Leaflet atribucija je pomaknuta između lijeve i desne kolone (`.leaflet-bottom.leaflet-right { left/right: 72px }`), pa kontrole ne moraju stajati iznad nje.
- Dugmad dijele isti izgled (`.dugme`, `.ikona-dugme`: radijus 12/16 px, blagi sjaj, pritisak `:active`) — bez `color-mix`/gradijenata (stariji WebView).
- Panel snimanja je kompaktan: jedan red informacija + jedan red od 4 dugmeta (Tačka, Slika, Pauza, Završi); potraga ima drugi red od 3.
- Trag kraći od `MIN_TRACK_M` = 50 m se NE čuva (ni lokalno ni na serveru) pri završetku i pri "završi" oporavljenog traga; potraga je izuzeta. Toast: "Trag je kraći od 50 m … i nije sačuvan".

**Slike na serveru, štedljivo (migracija 018, v0.4.3)**
- Besplatni Supabase ima malo prostora, pa se čuva SLIČICA trajno, a VELIKA slika (900 px) samo `slike_rok()` = 14 dana (promjena roka samo u toj SQL funkciji). Poslije roka velika slika se briše (`slike_zapisa.slika = null`, `lov_slike_podaci` red nestaje), a ostaje sličica; klijent jednom dnevno zove `ocisti_istekle_slike()` (`fotosync.js`).
- `slike_zapisa` (objekti, opažanja, odstrel): vidljivost slike = vidljivost zapisa (`vidi_zapis` je SECURITY INVOKER pa važe RLS politike zapisa; privatno vidi samo vlasnik, admin ne). Šalju se samo fotografije vlastitih, SINHRONIZOVANIH zapisa (3 po krugu, 60 s); `lovac.foto.poslane` pamti poslano. `foto.js photoUrl` za fotografiju kojeg nema na telefonu poziva `fotosync` (preuzima sa servera i kešira; ako je velika istekla, `samoMala`).
- Slike lova (`lov_slike_podaci`) imaju isti rok; pregledane velike slike se keširaju u store `arhiva` (`slika:<id>`) pa se vide i poslije isteka. "Slika na poziciji" (`slike` store) ostaje samo na telefonu.

**Profil lovca i statistika (migracija 019, v0.4.4)**
- Postavke imaju tabove Opšte / Profil lovca; Profil ima podtabove Profil / Statistika. Profil: avatar (96 px), pas (ime + slika 192 px), prateća oprema (puška, optika… max 30, VIDI SAMO VLASNIK — `profili_oprema`) i broj telefona (premješten iz kartice lokacije; `initKontakt` i dalje veže po id-evima). `profil-ui.js` čuva lokalno (`lovac.profil.lovac`, `neposlano`) i šalje serijski (broj izmjena `rev`: izmjena tokom slanja traži novi krug); ime psa se pamti na `input` da ga ne pregazi crtanje.
- Avatari svih članova (`profili`, samo avatar+ime psa, keš u `arhiva/avatari`) se prikazuju u listi članova sekcije (`avatarOf`).
- Statistika (`statistika.js`, čista): lovovi i sati iz keša `lovovi` (učesnik, `pocetak/kraj`), ulov/težina/najveći/po vrstama iz MOJIH `odstrel` zapisa, tragovi (km, potrage posebno), opažanja (grla), objekti; filter po godini. Računa se iz podataka na telefonu.

**Logo sekcije i kartice sekcija (migracija 020, v0.4.5)**
- Logo (`sekcija-logo.js`): automatski crtan SVG štit sa inicijalima, boja iz haša naziva (isti naziv = isti logo, bez pohrane), ili učitana slika 128 px (`sekcije.logo`, grupovođa/admin kroz "Upravljanje sekcijom" → Logo sekcije; "Automatski logo" vraća). Prikazuje se u navigaciji (umjesto ikone grupe), u heroju taba sekcije i na karticama u "Sekcije i pristup". SVG elementi nemaju svojstvo `hidden` — koristi se atribut.
- Kartice "Sekcije i pristup": logo, naziv, revir, status pristupa, brojevi (članova, zahtjevi za upravljače), tekst Grupovođa/Lovočuvar, članovi u `<details>`, dugmad jedno ispod drugog.

**Redizajn Moji tragovi, Zajednički lov, Moj pas (v0.4.6)**
- Moji tragovi: hero (broj, km, sati), filter Svi/Obilasci/Potrage, pretraga (`matchesQuery`), kartice sa vrstom traga, jednim glavnim dugmetom "Prikaži na karti" i mrežom od 3 sporedna dugmeta; prvi `.sitno` u kartici je i dalje sažetak (datum · dužina · trajanje).
- Zajednički lov: kartice grupisane (Danas i u toku / Planirani / Završeni) sa logom sekcije, značkom stanja i brojevima (učesnika, stanova, moja uloga); `data-id` i `data-akcija` ostaju.
- Moj pas: ime i slika iz profila lovca (`lovac.profil.lovac`), strelica ka psu (smjer minus kompas), prečica u Profil lovca. Koordinate sa manje od 3 decimale se ne prepoznaju (da se ne miješaju sa drugim brojevima).

**Evidencija i luk svjetla (v0.4.7)**
- Odstrel, Opažanja i Objekti imaju isti izgled kao Moji tragovi: hero sa tri broja (`ods-hero-*`, `op-stat-*`, `obj-stat-*`; `ods-stat-*` je već ekran statistike odstrela) i kartice (`.tr-kartica.ev-kartica` uz staru klasu `trag-red`, `data-id` i `data-akcija` ostaju). Brojevi se računaju iz lokalnih zapisa.
- Ekran Danas ima luk svjetla (`svjetlo-luk.js` čista geometrija, crtanje u `danas-ui.js drawArc`): zora / dan / sumrak od svitanja do sutona, tačka "Sada" (izvan tog raspona stoji na rubu, sivo). Vremena su u četiri JEDNAKA stupca ispod luka — zora i sumrak traju ~30 min, pa bi oznake na samim tačkama ležale jedna na drugoj. U UI-ju se ne koristi izraz "građanski sumrak".

**Kontrole uz navigaciju, "Gdje si?", sakrivanje trake (migracija 021, v0.4.8)**
- `.mapa-dno` ima `bottom: calc(var(--nav-h) - 4px)`: prazan `.donji-dio` unutar flex kolone sa `gap` dodaje još 8 px, pa je stvarni razmak do navigacije ~4 px (test mjeri ≤ 6 px).
- Gornja traka (`#koord-okvir`): dva dugmeta u jednoj tabletici — `#btn-nv` (visina; dodir SAKRIVA visinu i koordinate, ostaje samo ikona planine) i `#koord-traka` (koordinate; dodir mijenja sistem). Isti izbor je prekidač `#btn-koord-prikazi` u ploči podloga (`traka.js`, pamti se `lovac.traka.sakrivena`). Raniji posebni dugmić sa strelicom je uklonjen.
- "Gdje si?" (`ping.js`, `ping-ui.js`, tabela `lokacija_zahtjevi`): pita član/grupovođa/lovočuvar sekcije člana ili grupovođu iste sekcije (dugme u listi članova taba sekcije). Primalac dobija dijalog Da/Ne (poll 15 s, obavijest samo dok je app otvorena); "Da" ne šalje lokaciju direktno nego pokreće isto dijeljenje sa sekcijom kao ručno (1 h, događaj `lokacija:dijeli-sada`), pa važi ista vidljivost (lovočuvar i članovi, ne admin). Zahtjev važi 15 min, isti par najviše jednom u 2 min (trigger + lokalna zaštita), zahtjev i odgovor traže internet sa obje strane. Pošiljalac dobija toast i obavijest o odgovoru i mapa se centrira na lovca (`lokacija:prikazi-clana`).

**Danas: Vrijeme i vjetar, kulminacija u podne (v0.4.9)**
- Ekran Danas ima dva taba: "Svjetlo i lov" (luk, svjetlo, lovno vrijeme, lovostaj) i "Vrijeme i vjetar" (`vrijeme.js` čista logika, crtanje u `danas-ui.js`): temperatura, opis, min/max i padavine za danas, kompas sa strelicom (u koju stranu vjetar DUVA = smjer + 180; tekst kaže i "iz kojeg smjera"), sati do kraja dana. Prognoza je ista Open-Meteo prognoza kao za vjetar na čeki (`windFor(..., { needWeather: true })`, keš po ćeliji 0,05°); keš iz ranijih verzija nema temperaturu pa se ponovo preuzima. Bez veze i bez keša kaže "Prognoza nije dostupna", bez izmišljenih brojeva.
- Luk svjetla: vrh je u PODNE (`sun.podne`), ne u sredini između svitanja i sutona — prije podneva se penje, poslije spušta (`svjetlo-luk.js arcPoint(f, g, vrh)`); pet jednakih stupaca ispod luka: Svitanje, Izlazak, Podne, Zalazak, Suton.

**Divljač (v0.5.0)**
- Meni → Divljač (`divljac.js` statični sadržaj + `divljac-ui.js`): sedam vrsta (divlja svinja, srndać, mrki medvjed, vuk, čagalj, fazan, zec) sa karticama koje se rastvaraju: izgled, biologija i razmnožavanje, ponašanje i prehrana, tragovi, značajno za lov; pretraga bez dijakritika. Brojke su orijentacione.
- Propisi se NE zakucavaju: u tekstu nema datuma lovostaja ni lovnog vremena (test to hvata). Pod brojkama svake vrste piše lovostaj iz spiska koji unosi administrator (`seasonStatus`), a bez unosa "Nije uneseno". Za zaštićene vrste (medvjed, vuk) tekst samo upućuje na propise i odobrenje, bez tvrdnji o statusu u FBiH. Čagalj nema zadani kod u spisku vrsta (`cagalj`), pa mu lovostaj postoji tek kad ga administrator doda.

**Bogatija Divljač (v0.5.1)**
- Svaka vrsta ima dodatne dijelove (Spol i dob, Zdravlje i bolesti, Poslije odstrela; "Značajno za lov" je uvijek zadnje), biološki kalendar po mjesecima (parenje, mladi, rogovi, zimski san — izričito "nije lovostaj") i dnevnu aktivnost (zora/dan/sumrak/noć, nivo 0–3). Podaci su u `DOPUNE` u `divljac.js`, a crtanje u `divljac-ui.js`. Sadržaj je orijentacioni i treba ga pregledati lovočuvar/iskusan lovac.

**Četiri profila, prijava ulova i Pregled (migracija 022, v0.5.2)**
- Uloge su administrator, lovočuvar (po reviru), grupovođa (po sekciji) i lovac; `pregled.js viewerRole` ih izvodi iz keša sekcija (admin > lovočuvar > grupovođa > lovac), nikad iz imena. Dizajn: `docs/superpowers/specs/2026-11-22-uloge-i-pregled-design.md`.
- Ulov postaje vidljiv rukovodstvu tek kad ga lovac ZVANIČNO prijavi (dugme "Prijavi društvu" na kartici odstrela, `prijave-ui.js`): red u tabeli `ulov_prijave` nosi samo vrsta, kategoriju, težinu, vrijeme, revir/sekciju/lov i lovca — bez tačne lokacije i napomena. Zapis odstrela ostaje privatan; admin i dalje NE vidi privatne zapise.
- Server (RLS): vidi admin (sve revire), lovočuvar revira, grupovođa sekcije i vlasnik. Prijavljuje član/grupovođa sekcije u tom reviru (admin bilo gdje); prijava se ne mijenja, vlasnik je može samo POVUĆI (konačno; povučena se ne vraća, isti id se ne može ponovo poslati). Izlazna kutija u localStorage (`lovac.prijave.red`), idempotentan upsert (`ignoreDuplicates`), šalje se kad ima veze; povlačenje traži internet.
- Meni → Pregled (`pregled-ui.js`): hero sa ulogom i opsegom, brojevi, godina, "Društvo u brojkama" (samo admin), po revirima (admin/lovočuvar), po sekcijama i lovcima (svi osim lovca), po vrstama, po mjesecima, zadnje prijave. Lovac vidi "Moje prijave" sa povlačenjem (drugi dodir). Podaci se keširaju u IndexedDB (`arhiva/pregled-prijave`) pa radi i offline. Pri otvaranju se sekcije osvježe sa servera (uloga zavisi od njih).

**Statistika i rejting (migracija 023, v0.5.3)**
- Meni → Statistika i rejting (`statistika-ui.js`, čista logika `statistika-opsega.js` i `rejting.js`). Opseg po ulozi: admin društvo/revir/sekcija, lovočuvar svoj revir (i njegove sekcije), grupovođa i lovac svoju sekciju. Zbirke i podaci za rejting dolaze iz SECURITY DEFINER funkcija (`statistika_ulov`, `statistika_lovovi`, `rejting_podaci`) koje SAME provjeravaju opseg (`opseg_dozvoljen`; izvan opsega vraćaju prazno), pa lovac vidi zbirke i ljestvicu svoje sekcije, a pojedinačne tuđe prijave i dalje ne (RLS na `ulov_prijave`). Odluka vlasnika: članovi sekcije vide ljestvicu svoje sekcije.
- Rejting (0–100, ponderisani prosjek kriterija koji imaju podatke): odaziv na lovove (40), tačnost prijave u 24 h (25), redovnost kroz mjesece (15), raznovrsnost vrsta (10, granica 4), prijavljeni ulov (10, granica 10 — gornja granica da se ne nagrađuje pretjeran odstrel). Težine i granice su u `rejting_kriteriji`: seed iz migracije, mijenja samo admin (trigger bilježi ko i kad), klijent ima iste zadane vrijednosti dok sa servera ne stignu. Rangiraju se samo lovci sa bar jednim održanim lovom sekcije u periodu; isti rezultat = isto mjesto. Potrage i privatni zapisi (opažanja, objekti, tragovi) NISU u rejtingu jer ih server ne smije dijeliti.
- Odaziv je približan: učešća (iz `lov_ucesnici`, dakle spiska koji vodi grupovođa) podijeljena sa održanim lovovima i članovima. Keš u IndexedDB-u (`arhiva/stat:<opseg>:<godina>`) pa se vidi zadnje stanje bez veze.

**Logo i ispravke poslije pregleda koda (migracija 024, v0.5.4)**
- Logo društva (izvor `docs/logo/grmec-logo-izvor.png`): `static/img/logo-192.png` (favicon, ekran prijave) i `logo-512.png`; ikona aplikacije je `drawable-nodpi/ic_launcher_fg.png` (logo ~68 % od 432 px, prozirni uglovi) na pozadini `launcher_pozadina` (`values/launcher.xml`). XML i PNG sa ISTIM imenom resursa ne smiju postojati zajedno (build pada) — test `ikona.test.mjs`. Izgled ikone na pravom uređaju se provjerava tek poslije CI buildа.
- Izlazna kutija prijava (`prijave-ui.js flushReports`): paket pa, kad server odbije (`isRejection`: 42501/403/RLS), red po red — odbijen red se izbacuje i pamti kao `odbijena`, ostali se šalju; mrežna greška ostavlja red. Slanje se okida i kad se veza vrati (`onQualityChange`), ne samo tajmerom.
- Zbirni ekrani koji čitaju cijelu tabelu idu kroz `collectPages` (server vraća najviše ~1000 redova po zahtjevu).
- Slanje traga lova: `tick` je serijalizovan (`ticking`), a poslije svakog paketa se iz TRENUTNOG bafera izbacuju samo poslane tačke (`removeSentPoints`).
- Rokovi koje postavlja server (zahtjev "Gdje si?" 15 min) računaju se po satu servera: `net.js noteServerDate/serverNow` (zaglavlje `Date` odgovora), ne po satu telefona.
- Statistika (024) računa godinu i mjesec po `Europe/Sarajevo`, ne po UTC-u baze.

**Pločice na slaboj vezi i ploča "Moja lokacija" (v0.5.5)**
- Leaflet sam NE ponavlja pločicu koja nije stigla, pa na sporoj vezi (~1 KB/s, VPN) dijelovi karte ostanu crni. `tiles.js loadTileWithRetry` ponavlja do 3 puta (odgode 1,5 / 4 / 9 s), rok pokušaja raste (`tileTimeoutMs`: dobra veza 12 s, slaba 20 s, +50 % po pokušaju) i staje čim pločica napusti ekran. Kad se ≥ 4 pločice ne učitaju ni poslije ponavljanja, jednom u minuti stiže poruka (`plocice:greska` → toast u `map.js`) sa uputom da preuzme područje za rad bez interneta.
- Ploča `#lok-ploca` ima `overflow-y: auto` i `max-height` do donje navigacije (`100dvh - gore - --nav-h`); prije je `.meni { overflow: hidden }` odsijecao dio sa dijeljenjem sekcije na nižim ekranima. Svaka nova ploča iznad navigacije mora imati vlastiti max-height i listanje.

**Redizajn Moji tragovi, Objekti i Divljač (v0.5.6)**
- Moji tragovi: svaka kartica ima sličicu oblika rute (`tragovi-pregled.js routePath`, SVG putanja, lon skaliran sa cos(lat)), brojke (km/h, tačaka, tačaka interesa), naslove mjeseci (samo uz redoslijed "Najnovije"; `.tr-mjesec` NIJE `.trag-red`, pa testovi koji broje kartice rade), izbor perioda (sve / ova godina / 30 dana / 7 dana) i redoslijeda (najnovije / najduže / najdugotrajnije) i stupce kilometara zadnjih 7 dana u heroju. Prvi `.sitno` u kartici je i dalje sažetak.
- Objekti: pravilo APLIKACIJE (ne propis) "dugo bez obilaska" = 30+ dana ili nije upisan obilazak (`objekti.js OBILAZAK_KASNI_DANA`, `visitStatus`), četvrti broj u heroju, filteri Svi / Treba popravka / Dugo bez obilaska, filter po vrsti (samo kad ima 2+ vrste, sa brojem), redoslijed (najbliži / po nazivu / najdavnije obiđeni) i brze akcije na kartici: "Vodi me" i "Obiđen danas" (`data-akcija`; klik na ostatak kartice i dalje otvara detalj).
- Divljač: mreža pločica sa emblemom (boja + dva slova, `ODLIKE` u `divljac.js`; bijeli znak na tamnim bojama), filter grupe (Krupna / Sitna / Zvijeri), traka "U <mjesecu> u prirodi" iz biološkog kalendara (`monthEvents`; izričito nije lovostaj) i detalj vrste sa tabovima Pregled / Biologija / Ponašanje / Lov i zdravlje (`DETALJ_TABOVI`: svaki dio sadržaja ide u TAČNO jedan tab, test to hvata); kalendar označava tekući mjesec. Dugme Nazad: detalj → spisak → zatvoreno.

**Odstrel i Opažanja — pregled (v0.5.7)**
- Čista logika u `evidencija.js`: emblem vrste (`speciesBadge`: boja i znak iz Divljači, inače boja iz haša koda + prva dva slova), stupci zadnjih 12 mjeseci (`lastMonths`), najveći komad, sortiranja, grupisanje po mjesecima (`groupByMonthOf`; naslov mjeseca je `li.tr-mjesec`, pa testovi broje `li[data-id]`), filter odstrela po prijavi društvu (Svi / Neprijavljeni / Prijavljeni, iz `reportStateOf`) i doba dana opažanja (`observationLight`: zora / dan / sumrak / noć iz položaja sunca na lokaciji opažanja, bez interneta; test ne smije zavisiti od vremenske zone računara — vrijeme se zadaje u UTC-u).
- Odstrel: četvrti broj "najveći (kg)", filter prijave i redoslijed (najnovije / najteže), stupci 12 mjeseci, emblem na kartici, dugme "Na karti" (zatvara spisak i centrira). Izvoz CSV/PDF i dalje koristi filtere perioda/vrste/pretrage, ne filter prijave ni redoslijed.
- Opažanja: četvrti broj "zadnje viđeno", stupci "Kad je divljač viđena" (grla po dobu dana), chip doba dana i emblem na kartici, redoslijed (najnovije / najviše grla), grupe po mjesecima sa brojem grla.

**Sekcije i pristup — pregled (v0.5.8)**
- Ekran "Sekcije i pristup": hero (moje sekcije / za odobrenje / ukupno), filteri Moje / Za odobrenje / Bez pristupa / Sve (zadani je "Moje" čim lovac ima sekciju, inače "Sve"; izbor se pravi tek kad su sekcije stigle, jer prazan keš ne smije zaključati "Sve"), pretraga (naziv, revir, grupovođa, članovi) i panel "Čeka tvoje odobrenje" na vrhu sa Odobri/Odbij bez otvaranja "Upravljanja". Zahtjevi su `li` sa `data-id` (sekcija) i `data-uid` (lovac) unutar `#sekcije-spisak`, pa ih hvata isti rukovalac kao kartice.
- Čista logika u `sekcije.js`: `isMine` (admin je "u svakoj" sekciji sa punim pristupom, pa su za njega "moje" samo one gdje je izričito grupovođa/član), `approvalsForMe`, `sectionsOverview`, `filterSections`, `menuSummary`. Pločica u Meniju pokazuje "N zahtjeva čeka tvoje odobrenje" / "Tvoj zahtjev čeka odobrenje" / "Moje sekcije: N" iz keša sekcija.
- Blok "Grupovođe i lovočuvari po revirima" (samo admin) je sklopiv (`#uloge-detalji`); testovi ga prvo otvaraju.

**Postavke — tabovi i spremnost (v0.5.9)**
- Četiri taba (`#p-tabovi`, `data-ptab`): Opšte (veličina teksta, izgled, lokacija u lovu, status), Podaci (spremnost, slanje, rezervna kopija), Nalog (administracija, PIN, odjava, O aplikaciji) i Profil lovca. `profil-ui.js setTab` prikazuje tačno jedan od `p-opste/p-podaci/p-nalog/p-profil`; e2e testovi koji diraju elemente iz drugog taba prvo kliknu tab. Id-evi elemenata se nisu mijenjali.
- Kartica "Spremnost za rad bez interneta" (`postavke-pregled.js` čista logika, crtanje u `postavke.js renderReadiness`, događaj `postavke:podaci`): veza, zadnje uspješno slanje (`lovac.sync.zadnje`, upisuje `sync.flushQueue` kad je poslano ≥ 1), pohrana telefona (`navigator.storage.estimate`, upozorenje od 80 %; "Zaštiti pohranu" zove `storage.persist()` u try/catch), broj pločica i podsjetnik za rezervnu kopiju (`lovac.rezerva.zadnja`; nikad ili 30+ dana kad ima podataka). Funkcija `syncAgeText` se ne smije zvati `ageText` (već postoji u `vjetar.js`).

**Istraživač, ploča lokacije, Karte i Slojevi (v0.6.0)**
- Istraživač: blaži nagib (rotateX 40°, scale 1.6) da vrh ne guta kartu; u modu se sakrivaju status-red, svjetlo i lovno-chip, a traka članova ide više i ima dugme "Izađi iz 3D" (`[data-izlaz]`, iste je visine ≥ 44 px) — izlaz više ne traži ploču lokacije.
- Ploča "Moja lokacija" je niža: dugmad u 3 kolone (ikona iznad teksta) i `max-height` najviše 48 % visine ekrana, ostatak se lista.
- Karte i offline: hero (pločica u kešu, offline karata, veličina fajlova) + savjet o spremnosti (`pregled-karata.js offlineHero/offlineAdvice`; bez aplikacije fajlovi su "—", nikad izmišljeni) i kartice: Podloga, Preuzmi područje, Teren, Offline karte, Keš. Id-evi se nisu mijenjali.
- Slojevi: hero (slojeva, prikazanih, elemenata), "Prikaži sve / Sakrij sve" (od 2 sloja), boja sloja i starost izvora na kartici (`layersSummary`, `layerSource`).
- Admin dugmad iz Postavki (Propisi, Korisnici…) su u tabu Nalog — testovi prvo kliknu `#p-tabovi [data-ptab="nalog"]`.

**Sekcija — istaknuti lovci (v0.6.1)**
- Kartica "Lovci sekcije" je PRVA u tabu (ispred tekućeg lova): okvir u boji naglaska, brojevi (aktivnih / bez signala / vodstvo), filter Svi / Aktivni / Vodstvo sa brojem, pretraga bez dijakritika (`matchesQuery`) i redovi sa većim avatarom, značkom uloge (Grupovođa/Lovočuvar/Član) i obrubom za vodstvo. U heroju je traka lica (prvih 7, ostatak "+N") sa obrubom po aktivnosti. Čista logika: `sekcija-podaci.js huntersCounts/filterHunters/faceStrip`. Redoslijed redova se NE mijenja (vodstvo, pa članovi po prezimenu); filter/pretraga ga samo sužavaju. Nav dugme ka kartici se sada zove "Lovci", id ostaje `sk-k-clanovi`.

**"Čeka slanje" predugo (v0.6.2)**
- Uzrok: svaki neuspjeh slanja (i na mrtvoj vezi) je povećavao broj pokušaja, pa je odgoda rasla do 30 min i zapisi nisu išli čak ni kad se signal vrati. Sada: greška VEZE (`isNetworkFailure`: istek roka, "Failed to fetch"…) ne povećava `pokusaja`, ponovo se pokušava za 15 s i prekida krug (ostali zapisi bi također visili); odbijanje servera (npr. 503/RLS) i dalje raste, ali do najviše 10 min; kad se veza vrati (`onQualityChange`), `syncNow({ force: true })` ignoriše odgode.
- Svaki poziv slanja i `pullShared` imaju vlastiti rok (`withDeadline`, `abortSignal`) povrh roka u `fetchWithTimeout`, da jedno viseće slanje ne drži `flushing` zauvijek.

**Zapisi drugog naloga i RLS odbijanje (v0.6.3)**
- Uzrok "Čeka slanje: 12 … violates row-level security policy (USING expression) for table tragovi": lokalna baza nije vezana za nalog, pa je lovac koji se prijavi na telefonu drugog lovca naslijedio njegove neposlane zapise i red slanja; slali su se kao zapisi NOVOG korisnika, a server (ispravno) odbija izmjenu tuđeg reda. Poruka sa "USING" znači UPDATE nad redom koji pripada drugom vlasniku.
- Sada: `enqueue` bilježi vlasnika (`red.vlasnik`, `zapis.vlasnik_lokalni`), slanje i `reconcileQueue` preskaču zapise drugog naloga (`belongsToOther`), a `queueCount` ih ne broji. Zapisi bez oznake (stariji) ostaju "moji".
- RLS odbijanje (`isPolicyRejection`, ne mrtva veza i ne 503) se NE ponavlja zauvijek: unos u redu dobija `odbijen: true`, ne broji se u "Čeka slanje", a u Postavke → Podaci pojavi se "Server nije prihvatio N zapisa" sa dugmetom "Skini odbijene iz reda" (`dropRejected`: zapis ostaje na telefonu sa `odbijeno: true`, red ga više ne vraća). Ništa se ne briše.
- NIJE riješeno: lokalni spiskovi (objekti, odstrel…) i dalje pokazuju zapise prethodnog naloga na istom telefonu; razdvajanje po nalogu zahtijeva poseban pregled.

**Kompas "Pravac gledanja" (v0.6.4)**
- Ploča "Moja lokacija" ima kompas (`kompas.js` čista logika, `kompas-ui.js`): ruža sa S/I/J/Z se okreće suprotno od smjera telefona, pa je pravac gledanja uvijek na vrhu, uz tekst "JI 135°". Smjer dolazi iz `gps.js currentHeading` (`deviceorientationabsolute`; GPS smjer kretanja je rezerva i izvor se ispisuje), glađenje je kružno (`smoothHeading`: 359° → 1° ne prolazi kroz 180°). Bez senzora piše "Kompas nije dostupan na ovom telefonu", nikad izmišljen smjer. UI uvijek kaže da kompas može griješiti i ne zamjenjuje pravila lova ni vođu lova.

**Istraživač: okretanje karte (v0.6.5)**
- U Istraživaču se karta okreće sa dva prsta ili dugmadima desno (`#istrazivac-kontrole`: ulijevo/udesno za 15°, "Karta prati pravac gledanja", "Sjever gore"). Rotacija je dio CSS transforma pogleda (`rotacija.js mapTransformCss`: perspective → rotateX → rotateZ → scale), Leaflet se NE rotira (koordinate dodira bi bile pogrešne); izlaz iz moda vraća transform na prazno. Strelice članova se računaju relativno na smjer koji je na ekranu "gore" (`upBearing(rot)`), pa pokazuju pravi smjer i kad je karta okrenuta. Gest preko ±180° ne skače (`gestureDelta`). Traka članova je u jednom redu, a okvir koordinata se u modu sakriva da gornji dio ne zauzima kartu.

**Istraživač 3D — pregled (v0.6.6)**
- Čista logika `istrazivac-pregled.js`: nagib pogleda (blag 25° / srednji 40° / strm 55°, dugme u koloni kontrola kruži i pamti `lovac.ist.nagib`), svježina pozicije člana (`freshnessOf`: uživo ≤ 2 min, zastarjelo ≤ 10, inače bez signala — isti pragovi kao markeri na karti), sažetak trake (`barSummary`: broj članova i najbliži sa stranom svijeta i udaljenošću) i HUD "Gore: JI 135° · nagib 40°" (`upLabel`).
- Traka: "Izađi iz 3D", sažetak, pa čipovi članova sa licem (inicijali, obrub po svježini), strelicom koja slijedi rotaciju i istaknutim najbližim (`data-najblizi`). Dugme "Centriraj na mene" (`#btn-ist-ja`) vraća praćenje poslije pomjeranja ka članu. Kolona kontrola ima 6 dugmadi od 46 px i mora stati iznad desne kolone mape.
