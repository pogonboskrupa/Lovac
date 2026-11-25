# Provjera servera i rada bez interneta — 24. 11. 2026. (v1.1.7)

Provjera je urađena sa javnim (anon) ključem iz aplikacije. Ništa nije čitano iz podataka lovaca i ništa nije mijenjano:
- tabele su provjerene upitom `limit=0`;
- kolone su provjerene istim upitom samo sa tom kolonom;
- funkcije su pozvane sa nepostojećim id-em. Server tada samo javi da funkcija postoji ("permission denied") ili da je nema.

## 0. Dopuna — provjera 25. 11. 2026. (v1.3.3)

| Provjera | Rezultat |
|---|---|
| `lokacije_izabranih` (037) | **NE postoji** → "Dijeli lokaciju sa lovcima" ne može raditi dok se 037 ne pokrene |
| `korisnici.probni_do` (026) | **NE postoji** |
| `probni_sati()` (038) | **postoji** → 038 je pokrenuta BEZ 026: stara 038 je tražila kolonu `probni_do`, pa je **registracija novih lovaca padala**. Ispravljena 038/039 same dodaju kolonu — pokrenuti ispravljenu 038 (ili 026 pa 038) |
| `lov_odazivi` (034) | postoji |
| `dojave` (031), `slike_lovcima` (033), `je_stvarni_clan()` (033), `javne_sekcije()` (039) | **NE postoje** |

Preporuka: pokrenuti redom 025, 026, 027, 028, 029, 030, 031, 032, 033, 035, 036 (samo test, nije migracija — preskočiti), 037, 038, 039. Sve su idempotentne, pa ponovno pokretanje ne smeta.

## 1. Server radi

| Provjera | Rezultat |
|---|---|
| Prijava (`/auth/v1/health`) | **radi**, odgovor ~1 s (prvi zahtjev, server se budi) |
| Odziv baze (5 upita) | 141–159 ms |
| Anonimni pristup tabelama | **nijedna tabela nije čitljiva bez prijave** (sve vraćaju "permission denied") — RLS i prava su u redu |
| Registracija | otvorena (`disable_signup: false`), potvrda emaila isključena: bilo ko može napraviti nalog. To je namjerno, zato postoji probni period (026) — ali on **još nije na serveru**, pa novi nalog ostaje bez pristupa dok ga admin ne odobri |
| Ostali načini prijave | samo email (interni), bez Google/telefona — ispravno |

## 2. Koje migracije su pokrenute

| Migracija | Stanje na serveru | Kako je provjereno |
|---|---|---|
| 001–023 | **pokrenute** | sve tabele postoje (korisnici, lovovi, sekcije, poruke, kamere, lov_slike, profili, lokacija_zahtjevi, ulov_prijave, rejting_kriteriji…); funkcije `vidi_lov`, `je_clan_sekcije`, `je_rukovodstvo`, `je_lovocuvar_revira`, `slike_rok`, `statistika_ulov` postoje |
| 024 | ne može se pouzdano utvrditi (mijenja samo tijelo funkcija) | — preporuka: pokrenuti ponovo (idempotentna je) |
| 025 | **NIJE pokrenuta** | greška pri brisanju naloga `lovovi_organizator_id_fkey` (iz prakse); 032 ponavlja te ispravke |
| 026 probni period | **NIJE** | nema kolone `korisnici.probni_do`, nema `probni_dani()` |
| 027 zvanični objekti | vjerovatno NIJE (ide poslije 026; trigger se ne vidi spolja) | — |
| 028 trag lova | **NIJE** | nema `lov_tragovi.primljeno`, nema `lov_trag()` |
| 029 štedljivo čitanje | **NIJE** | nema `poruke.primljeno`, `lov_dogadjaji.primljeno` |
| 030 lovočuvar i sekcije | vjerovatno NIJE (mijenja politike) | — |
| 031 dojave | **NIJE** | tabela `dojave` ne postoji |
| 032 brisanje lova | **NIJE** | nema `moze_brisati_lov()` / `obrisi_lov()` |
| 033 slike lovcima | **NIJE** | tabela `slike_lovcima` ne postoji, nema `je_stvarni_clan()` |

### Šta to znači za lovce danas

| Funkcija u aplikaciji | Ponašanje bez migracije |
|---|---|
| Brisanje naloga (admin) | pada na stranom ključu (025) |
| Brisanje lova u arhivi | javlja grešku (032) |
| Novi nalog (samoregistracija) | čeka odobrenje admina, nema 7 dana probe (026) |
| Zvanični objekti društva | oznaka se ne provodi na serveru (027) |
| Trag kretanja lovaca | radi preko rezervnog čitanja tabele: sporije i skuplje, a kod velikog lova vidi se samo prvih 1000 tačaka (028) |
| Poruke i tok lova | rade preko rezervnog kursora po vremenu (029) — malo više prometa |
| Lovočuvar pravi sekcije | server odbija (030) |
| Prijavi lovočuvaru | dojava **čeka na telefonu** i šalje se tek kad se pokrene 031 (ništa se ne gubi) |
| Slike lovcima | slika **čeka na telefonu** i šalje se tek kad se pokrene 033. Ova provjera je našla grešku: bez tabele bi se slika trajno označila kao "nije poslana". Ispravljeno u v1.1.7 (`missingOnServer`) |

## 3. Šta uraditi (redom)

1. U Supabase → SQL Editor pokrenuti, jednu po jednu, **024, 025, 026, 027, 028, 029, 030, 031, 032, 033** (`supabase/migrations/`). Sve su idempotentne: ponovno pokretanje ne smeta.
2. Poslije 032: obrisati stari nalog koji više ne koristiš (Postavke → Nalog → Korisnici → Obriši, drugi dodir).
3. Ponoviti ovu provjeru: nijedan red u tabeli iz tačke 2 više ne smije biti "NIJE".

### Sitnica (nije hitno)

Funkcija `je_odobren()` iz 001 se može pozvati i bez prijave. Vraća samo `false`, pa ne otkriva ništa, ali je čistije zabraniti joj anonimni poziv (`revoke execute ... from anon`). Ostale provjerene funkcije su već zatvorene za anonimne pozive.

## 4. Rad bez interneta i na slabom signalu (automatski testovi, v1.1.7)

Svi testovi prolaze: **358 Node, 296 browser (Playwright), SQL** (migracije dvaput — idempotentnost — i 33 test fajla). Za offline i slab signal važni su:

| Test | Šta provjerava |
|---|---|
| `offline-tok.spec.mjs` | pokretanje bez veze ulazi odmah na kartu; GPS nišan, Moja lokacija, snimanje traga i opažanje rade; 5 min bez veze ništa se ne gubi; kad server proradi, sve se samo pošalje |
| `offline-lov.spec.mjs` | Lov traje (poruka, slika), Tok lova, Prijavi lovočuvaru, Moja lokacija — bez veze i na slabom signalu (40 % zahtjeva pada, 30 % visi) otvaraju se iz keša za ≤ 3 s, a poslije sve stigne na server **tačno jednom** |
| `pokretanje-slab-signal.spec.mjs` | 6 vrsta loše veze: aplikacija nikad sama ne izbaci lovca na prijavu |
| `slike-lovcima.spec.mjs` | slika bez interneta čeka i ode jednom; primljena ostaje na telefonu i briše se sa servera |
| `opterecenje.spec.mjs` | budžet prometa za besplatni server: u lovu < 40 zahtjeva i < 60 KB po minuti, u mirovanju < 15 i < 25 KB |
| `simulacija-lov.spec.mjs` | 7 sekcija × 10 lovaca istovremeno dijele poziciju i trag |

Šta testovi NE mogu potvrditi (treba telefon): stvarni GPS u šumi, gašenje aplikacije od strane baterije (OEM), dijalog instalacije nove verzije, brzinu preuzimanja Terena na mobilnim podacima.

## 5. Statistika i rejting od 2026.

Od v1.1.7 statistika i rejting računaju samo podatke od **1. 1. 2026.** Izbor godina počinje od 2026., a "Sve" znači "od 2026." (`statistika-opsega.js EVIDENCIJA_OD`).
