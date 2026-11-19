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
- OEM battery manager ubija cijeli proces: pri prvom snimanju tražiti izuzeće od optimizacije baterije. Bez push servisa NE obećavati "javićemo i kad je app ugašena".

**Ažuriranje**
- U APK-u se service worker NE koristi (i odjavljuje se): cache-first SW bi nakon instalacije novog APK-a servirao stari app shell.
- Provjera nove verzije ide prvo preko `version.json` na grani `verzija` (CI ga objavljuje nakon Release-a, `raw.githubusercontent.com`), a GitHub API je rezerva: API ima limit 60/sat po IP-u, a mobilni operateri dijele IP. Neuspjela provjera se prikazuje kao greška, nikad kao "nema nove verzije". U Postavkama je uvijek dostupno "Preuzmi zadnju verziju".

**Snimanje traga**
- Pauza se pamti kao vremenski intervali (trajno); inače native replay ubaci tačke iz pauze ili odbaci tačke prije nje. Stop zatvara otvoren interval.
- Dijeljeni tajmer (crash-snimak više snimanja) gasi se tek kad NIJEDNO snimanje ne traje.

**Pločice**
- Mrežno preuzimanje pločica ide kroz `createLimiter` (max 6 istovremeno, najnovije prvo, prekid na `tileunload`/`tileabort`); bez toga spor server i slab signal ugase sve zahtjeve odjednom. Keš pločica ima gornju granicu (`MAX_CACHED_TILES`).

**UI**
- WebView ne prikazuje `confirm()`/`alert()` bez `onJsConfirm`/`onJsAlert` u `WebChromeClient`: potvrda opasnih radnji ide drugim dodirom na isto dugme.
- Odjava na mrtvoj vezi: `signOut` visi, pa se čeka najviše `SIGNOUT_GRACE_MS`, a lokalni `sb-*` ključevi se brišu uvijek; ekran se mijenja odmah.
- Dugme Nazad: `MainActivity` pita `window.__nazad()`; svaki novi overlay/list mora se zatvarati kroz `handleBack()` u `postavke.js`.
- Emoji ikonice izgledaju različito na OEM uređajima → SVG sprite (`<svg class="ic"><use href="#ic-…"/></svg>`).
- Dnevni mod / jako sunce: svaka nova boja mora proći kontrast 4.5:1 i u dnevnoj temi.
- Dodirne mete ≥ 44 px, polja ≥ 48 px, font polja ≥ 16 px (inače WebView zumira).

## Odluke vlasnika projekta

- Lovci istog imena i prezimena razlikuju se poljem **nadimak / broj člana** (neobavezno, dio internog emaila `ime.prezime[.nadimak]@lovci.grmec.app`, kolona `korisnici.nadimak`).
- Admin **NE vidi privatne** zapise.
- **SOS** ide svim aktivnim učesnicima lova koji je u toku tog dana.
- **Vođa lova** je posebna uloga po reviru/sekciji (društvo ima više revira), nije isto što i admin. Šema za revire i vođe dolazi u fazi 3.
- Supabase projekat (i kasnije repozitorij) će biti na drugom nalogu; URL/anon key vlasnik javlja kad napravi projekat. Granice lovišta (KML) i MBTiles stižu kasnije.
