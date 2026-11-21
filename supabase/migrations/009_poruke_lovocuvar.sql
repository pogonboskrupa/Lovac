-- 009: lovočuvar po REVIRU (prati sve sekcije svog revira, samo čita) i poruke sekcije.
-- Idempotentno.
--
-- Pravila:
--  * grupovođa vodi sekciju; lovočuvar prati samo unutar svog revira (sve sekcije tog revira), bez upravljanja;
--  * poruke sekcije čitaju i pišu: članovi, grupovođa, lovočuvar tog revira i administrator;
--  * poruka se ne mijenja ni briše; autor je uvijek prijavljeni korisnik.

create table if not exists public.revir_lovocuvari (
  revir_id uuid not null references public.reviri (id) on delete cascade,
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  primary key (revir_id, korisnik_id)
);

alter table public.revir_lovocuvari enable row level security;
drop policy if exists samo_odobreni on public.revir_lovocuvari;
create policy samo_odobreni on public.revir_lovocuvari as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
drop policy if exists citanje on public.revir_lovocuvari;
create policy citanje on public.revir_lovocuvari for select to authenticated using (true);
drop policy if exists admin_pise on public.revir_lovocuvari;
create policy admin_pise on public.revir_lovocuvari for all to authenticated
  using (public.je_admin()) with check (public.je_admin());
revoke all on public.revir_lovocuvari from anon;
grant select, insert, update, delete on public.revir_lovocuvari to authenticated;

-- Lovočuvar sekcije: lovočuvar njenog REVIRA (ili ranije postavljen lovocuvar_id na samoj sekciji).
create or replace function public.je_lovocuvar_sekcije(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.sekcije s
     where s.id = p_sek
       and (s.lovocuvar_id = auth.uid()
            or exists (select 1 from public.revir_lovocuvari r where r.revir_id = s.revir_id and r.korisnik_id = auth.uid())));
$$;

create or replace function public.je_clan_sekcije(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or public.je_lovocuvar_sekcije(p_sek)
    or exists (select 1 from public.sekcije s where s.id = p_sek and s.grupovodja_id = auth.uid())
    or exists (select 1 from public.sekcija_clanovi c
                where c.sekcija_id = p_sek and c.korisnik_id = auth.uid() and c.status = 'odobren'));
$$;

drop policy if exists citanje on public.sekcija_clanovi;
create policy citanje on public.sekcija_clanovi for select to authenticated using (
  korisnik_id = auth.uid()
  or public.moze_upravljati_sekcijom(sekcija_id)
  or public.je_lovocuvar_sekcije(sekcija_id)
  or (status = 'odobren' and public.je_clan_sekcije(sekcija_id)));

-- ---------------------------------------------------------------------------
-- Poruke sekcije
-- ---------------------------------------------------------------------------
create table if not exists public.poruke (
  id uuid primary key default gen_random_uuid(), -- klijent šalje svoj UUID (offline unos)
  sekcija_id uuid not null references public.sekcije (id) on delete cascade,
  lov_id uuid references public.lovovi (id) on delete set null,
  autor_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  tekst text not null check (length(trim(tekst)) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.poruke alter column id set default gen_random_uuid();
create index if not exists poruke_sekcija_vrijeme on public.poruke (sekcija_id, created_at);

alter table public.poruke enable row level security;
drop policy if exists samo_odobreni on public.poruke;
create policy samo_odobreni on public.poruke as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
drop policy if exists citanje on public.poruke;
create policy citanje on public.poruke for select to authenticated using (public.je_clan_sekcije(sekcija_id));
drop policy if exists unos on public.poruke;
create policy unos on public.poruke for insert to authenticated
  with check (autor_id = auth.uid() and public.je_clan_sekcije(sekcija_id));
revoke all on public.poruke from anon;
revoke update, delete, truncate on public.poruke from authenticated;
grant select, insert on public.poruke to authenticated;

revoke execute on function public.je_lovocuvar_sekcije(uuid) from public, anon;
grant execute on function public.je_lovocuvar_sekcije(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'poruke') then
    execute 'alter publication supabase_realtime add table public.poruke';
  end if;
end $$;
