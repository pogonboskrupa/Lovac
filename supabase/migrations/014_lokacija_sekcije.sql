-- Dijeljenje lokacije sa sekcijom (van lova): član ili grupovođa sekcije uključi dijeljenje na ograničeno vrijeme
-- (najviše 24 h); lokaciju vide samo članovi, grupovođa i lovočuvar te sekcije, i to samo dok dijeljenje traje.
-- Administrator je NE vidi (nije dio sekcije). Idempotentno.

create table if not exists public.sekcija_lokacije (
  sekcija_id uuid not null references public.sekcije (id) on delete cascade,
  korisnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  acc double precision,
  t timestamptz not null default now(),
  do_ timestamptz not null,
  primary key (sekcija_id, korisnik_id)
);

-- Ko smije dijeliti i ko smije gledati (bez administratora koji nije u sekciji).
create or replace function public.moze_dijeliti_sekciji(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    exists (select 1 from public.sekcije s where s.id = p_sek and s.aktivno and s.grupovodja_id = auth.uid())
    or exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sek and c.korisnik_id = auth.uid() and c.status = 'odobren'));
$$;

create or replace function public.vidi_lokacije_sekcije(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.moze_dijeliti_sekciji(p_sek) or public.je_lovocuvar_sekcije(p_sek);
$$;

alter table public.sekcija_lokacije enable row level security;
drop policy if exists samo_odobreni on public.sekcija_lokacije;
create policy samo_odobreni on public.sekcija_lokacije as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.sekcija_lokacije from anon;
revoke all on public.sekcija_lokacije from authenticated;
grant select, insert, update, delete on public.sekcija_lokacije to authenticated;

drop policy if exists citanje on public.sekcija_lokacije;
create policy citanje on public.sekcija_lokacije for select to authenticated
  using (do_ > now() and (korisnik_id = auth.uid() or public.vidi_lokacije_sekcije(sekcija_id)));

drop policy if exists unos on public.sekcija_lokacije;
create policy unos on public.sekcija_lokacije for insert to authenticated
  with check (korisnik_id = auth.uid() and public.moze_dijeliti_sekciji(sekcija_id) and do_ <= now() + interval '24 hours 5 minutes');

drop policy if exists izmjena on public.sekcija_lokacije;
create policy izmjena on public.sekcija_lokacije for update to authenticated
  using (korisnik_id = auth.uid())
  with check (korisnik_id = auth.uid() and public.moze_dijeliti_sekciji(sekcija_id) and do_ <= now() + interval '24 hours 5 minutes');

drop policy if exists brisanje on public.sekcija_lokacije;
create policy brisanje on public.sekcija_lokacije for delete to authenticated using (korisnik_id = auth.uid());

revoke execute on function public.moze_dijeliti_sekciji(uuid), public.vidi_lokacije_sekcije(uuid) from public, anon;
grant execute on function public.moze_dijeliti_sekciji(uuid), public.vidi_lokacije_sekcije(uuid) to authenticated;
