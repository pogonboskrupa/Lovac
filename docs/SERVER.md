# Postavljanje servera (Supabase)

1. Projekat na supabase.com (region Frankfurt, `eu-central-1`).
2. **Authentication → Sign In / Providers → Email**: uključi Email, **isključi "Confirm email"**
   (lovac nema pravi email — interni je `ime.prezime[.nadimak]@lovci.grmec.app`), minimalna lozinka 6.
3. **SQL Editor**: pokreni redom SVE fajlove iz `supabase/migrations/` (svaki se smije pokrenuti ponovo):

   | Fajl | Šta donosi |
   |---|---|
   | `001_korisnici.sql` | korisnici, odobrenje, uloge, admin funkcije |
   | `002_nadimak.sql` | nadimak / broj člana |
   | `003_spiskovi.sql` | vrste objekata, vrste divljači, lovostaj, lovno vrijeme |
   | `004_podaci.sql` | dijeljenje objekata, opažanja, odstrela i tragova |
   | `005_slojevi.sql` | granice lovišta/revira koje objavljuje admin |
   | `006_lov.sql` | zajednički lov: reviri, vođe, lovovi, stanovi, sektori, telefoni |
   | `007_lov_uzivo.sql` | pozicije učesnika, SOS, odstrel u lovu |

   Nova verzija aplikacije može tražiti novu migraciju — u opisu Release-a piše koja.
4. Prvi admin: registruj se u aplikaciji, pa u SQL Editoru:
   ```sql
   update public.korisnici set is_admin = true, odobren = true
   where ime = 'TvojeIme' and prezime = 'TvojePrezime';
   ```
   Ostale lovce odobravaš u aplikaciji: Postavke → Administracija → Korisnici i odobrenja.
5. **Project Settings → API Keys**: Project URL i publishable/anon key su u `static/js/config.js`.
   **Nikad** ne stavljaj `service_role`/`secret` key u repo ili aplikaciju.
6. (Preporučeno) **Database → Replication / Realtime**: migracija 007 sama dodaje `sos` i `lov_pozicije`
   u `supabase_realtime` ako publikacija postoji; tada SOS stiže odmah, inače kroz prozivku (do 20 s).

## Šta admin unosi u aplikaciji (Postavke → Administracija → Propisi i spiskovi)
- **Lovostaj** po vrsti (i spolu/dobi): periodi otvorenog lova dd.mm.–dd.mm., izvor propisa.
- **Lovno vrijeme**: minuta prije izlaska / poslije zalaska sunca (opšte ili po vrsti).
- **Vrste divljači** i **vrste lovačkih objekata** (sklanjanje umjesto brisanja).
- **Reviri i vođe lova**: Spiskovi → Zajednički lov → Reviri i vođe lova.

Aplikacija ne sadrži nijedan datum lovostaja ni pravilo lovnog vremena — bez unosa admina piše "nije uneseno".

## Selidba repozitorija na drugi nalog
- Link za ažuriranje APK-a CI upisuje automatski iz imena repozitorija; `version.json` ide na granu `verzija`.
- Fiksni debug ključ (`android/app/debug.keystore`) mora ostati isti, inače instalirani APK-ovi ne mogu primiti update.
- U novom repou: Settings → Pages → Source: **GitHub Actions** (za webapp), i Settings → Actions → Workflow permissions: **Read and write**.
