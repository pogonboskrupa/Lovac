# Postavljanje servera (Supabase)

1. Napravi projekat na supabase.com (region: Frankfurt, `eu-central-1`, najbliži BiH).
2. **Authentication → Sign In / Providers → Email**:
   - uključi Email provider;
   - **isključi "Confirm email"** (lovac nema pravi email — interni je `ime.prezime[.nadimak]@lovci.grmec.app`);
   - minimalna dužina lozinke: 6 (PIN je 6–8 cifara).
3. **SQL Editor**: pokreni redom sve fajlove iz `supabase/migrations/` (svaki se smije pokrenuti ponovo).
4. U aplikaciji se registruj kao prvi korisnik, pa u SQL Editoru postavi sebe za administratora:
   ```sql
   update public.korisnici set is_admin = true, odobren = true
   where ime = 'TvojeIme' and prezime = 'TvojePrezime';
   ```
   (SQL Editor radi kao vlasnik baze, pa ga zaštita od samopromocije propušta. Iz aplikacije to nije moguće.)
5. **Project Settings → API**: kopiraj `Project URL` i `anon public` key u `static/js/config.js`
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`). Anon key je javan po dizajnu; pristup čuva RLS.
   **Nikad** ne stavljaj `service_role` key u repo ili aplikaciju.

## Selidba repozitorija na drugi nalog
- Link za ažuriranje APK-a CI upisuje automatski iz imena repozitorija.
- Fiksni debug ključ (`android/app/debug.keystore`) mora ostati isti, inače instalirani APK-ovi ne mogu primiti update.
- U novom repou: Settings → Pages → Source: **GitHub Actions** (za webapp), i Settings → Actions → Workflow permissions: **Read and write**.
