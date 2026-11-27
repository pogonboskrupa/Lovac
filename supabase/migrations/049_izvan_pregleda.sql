-- 049: korisnici koji koriste aplikaciju, ali se ne prikazuju u pregledima (Članovi i grupe, Struktura LD Grmeč).
-- Postavlja SAMO administrator (npr. administrator koji nije lovac, ili probni/testni nalog). Ne mijenja pristup, ulogu
-- ni vidljivost zapisa: samo se ne pojavljuje u spiskovima članova za vodstvo. Čitaju svi odobreni. Idempotentno;
-- zavisi samo od je_admin()/je_odobren() iz 001.

create table if not exists public.izvan_pregleda (
  korisnik_id uuid primary key references public.korisnici (id) on delete cascade,
  postavio uuid references public.korisnici (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.izvan_pregleda enable row level security;
drop policy if exists samo_odobreni on public.izvan_pregleda;
create policy samo_odobreni on public.izvan_pregleda as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.izvan_pregleda from anon;
revoke all on public.izvan_pregleda from authenticated;
grant select, insert, delete on public.izvan_pregleda to authenticated;

drop policy if exists citanje on public.izvan_pregleda;
create policy citanje on public.izvan_pregleda for select to authenticated using (public.je_odobren());
drop policy if exists unos on public.izvan_pregleda;
create policy unos on public.izvan_pregleda for insert to authenticated with check (public.je_admin());
drop policy if exists brisanje on public.izvan_pregleda;
create policy brisanje on public.izvan_pregleda for delete to authenticated using (public.je_admin());
