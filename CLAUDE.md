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

- **Verzija na TRI mjesta, uvijek zajedno**: `index.html` (`APP_VER = 'vX.Y.Z'`), `sw.js` (`APP_VERSION`), `android/app/build.gradle` (`versionName` + `versionCode`, koji raste +1 pri svakoj izmjeni).
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
- Čip `#svjetlo-chip` na mapi: zora/dan/sumrak/noć iz `sunce.js daylightStatus` (pozicija = GPS, inače centar karte; svjetlo = izlazak–zalazak, sumrak do građanskog sutona). Dodir otvara "Danas".
- Istraživač (`istrazivac-ui.js`, dugme 3D): CSS nagib `#karta` (perspective + rotateX) je SAMO POGLED, pa su dragging/zoom dodirom isključeni (Leaflet ne preračunava perspektivu) i karta prati GPS; trake članova (smjer, strana svijeta, udaljenost) dolaze iz događaja `uzivo:pozicije` i vide se samo u tom modu. Strelice su sjever-gore, kao karta.
