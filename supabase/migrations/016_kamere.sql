-- Lokacije kamera (fotozamki): vide i unose ih SAMO lovočuvari revira u kojem je kamera (krađa i uznemiravanje divljači).
-- Ni grupovođa, ni član, ni administrator (admin može sebe postaviti za lovočuvara revira ako treba). Kamera se skida
-- (aktivno = false), ne briše. Idempotentno.

create table if not exists public.kamere (
  id uuid primary key,
  revir_id uuid not null references public.reviri (id),
  naziv text not null check (char_length(trim(naziv)) between 1 and 80),
  napomena text check (napomena is null or char_length(napomena) <= 500),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  aktivno boolean not null default true,
  autor_id uuid not null default auth.uid() references public.korisnici (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.je_lovocuvar_revira(p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    exists (select 1 from public.revir_lovocuvari r where r.revir_id = p_revir and r.korisnik_id = auth.uid())
    or exists (select 1 from public.sekcije s where s.revir_id = p_revir and s.lovocuvar_id = auth.uid()));
$$;

alter table public.kamere enable row level security;
drop policy if exists samo_odobreni on public.kamere;
create policy samo_odobreni on public.kamere as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.kamere from anon;
revoke all on public.kamere from authenticated;
grant select, insert, update on public.kamere to authenticated;

drop policy if exists citanje on public.kamere;
create policy citanje on public.kamere for select to authenticated using (public.je_lovocuvar_revira(revir_id));
drop policy if exists unos on public.kamere;
create policy unos on public.kamere for insert to authenticated
  with check (autor_id = auth.uid() and public.je_lovocuvar_revira(revir_id));
drop policy if exists izmjena on public.kamere;
create policy izmjena on public.kamere for update to authenticated
  using (public.je_lovocuvar_revira(revir_id))
  with check (public.je_lovocuvar_revira(revir_id));

-- Revir i autor se ne mijenjaju naknadno (kamera se ne "seli" u tuđi revir).
create or replace function public.zastiti_kameru()
returns trigger language plpgsql as $$
begin
  new.revir_id := old.revir_id;
  new.autor_id := old.autor_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists zastita on public.kamere;
create trigger zastita before update on public.kamere for each row execute function public.zastiti_kameru();

revoke execute on function public.je_lovocuvar_revira(uuid), public.zastiti_kameru() from public, anon;
grant execute on function public.je_lovocuvar_revira(uuid) to authenticated;
