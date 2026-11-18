-- 001: društva, korisnici, uloge i odobrenje.
-- Idempotentno: smije se pokrenuti više puta u SQL Editoru.
--
-- Pravila:
--  * uloga (is_admin) i odobrenje (odobren) su kolone; mijenja ih samo admin kroz
--    SECURITY DEFINER funkcije (ili vlasnik baze u SQL Editoru);
--  * trigger blokira samopromociju za sve API uloge (anon/authenticated);
--  * neodobren korisnik vidi samo svoj red (da ekran "čeka odobrenje" radi).

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.drustva (
  id uuid primary key default gen_random_uuid(),
  naziv text not null unique,
  created_at timestamptz not null default now()
);

insert into public.drustva (naziv) values ('Lovačko društvo "Grmeč"')
on conflict (naziv) do nothing;

create table if not exists public.korisnici (
  id uuid primary key references auth.users (id) on delete cascade,
  ime text not null,
  prezime text not null,
  is_admin boolean not null default false,
  odobren boolean not null default false,
  drustvo_id uuid references public.drustva (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  promijenio uuid,
  promijenjeno timestamptz
);

alter table public.korisnici enable row level security;

-- ---------------------------------------------------------------------------
-- Provjere pristupa (koriste ih politike svih ostalih tabela)
-- ---------------------------------------------------------------------------
create or replace function public.je_odobren()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select k.odobren from public.korisnici k where k.id = auth.uid()), false);
$$;

create or replace function public.je_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select k.odobren and k.is_admin from public.korisnici k where k.id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Nov nalog u auth.users -> red u korisnici (neodobren, bez uloge)
-- ---------------------------------------------------------------------------
create or replace function public.novi_korisnik()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.korisnici (id, ime, prezime, drustvo_id)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'ime'), ''), '?'), 40),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'prezime'), ''), '?'), 40),
    (select d.id from public.drustva d order by d.created_at limit 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists na_novi_auth_korisnik on auth.users;
create trigger na_novi_auth_korisnik
  after insert on auth.users
  for each row execute function public.novi_korisnik();

-- ---------------------------------------------------------------------------
-- Zaštita od samopromocije. API zahtjevi rade kao anon/authenticated;
-- SECURITY DEFINER funkcije i SQL Editor rade kao vlasnik, pa prolaze.
-- ---------------------------------------------------------------------------
create or replace function public.zastiti_korisnika()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id is distinct from old.id
    or new.is_admin is distinct from old.is_admin
    or new.odobren is distinct from old.odobren
    or new.drustvo_id is distinct from old.drustvo_id
    or new.promijenio is distinct from old.promijenio
    or new.promijenjeno is distinct from old.promijenjeno
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Ulogu i odobrenje mijenja samo administrator'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists zastita_korisnika on public.korisnici;
create trigger zastita_korisnika
  before update on public.korisnici
  for each row execute function public.zastiti_korisnika();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
drop policy if exists korisnici_citanje on public.korisnici;
create policy korisnici_citanje on public.korisnici
  for select to authenticated
  using (
    id = auth.uid()
    or public.je_admin()
    or (public.je_odobren() and odobren)
  );

drop policy if exists korisnici_izmjena_svog on public.korisnici;
create policy korisnici_izmjena_svog on public.korisnici
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Nema insert/delete politike: red pravi trigger, briše admin funkcija.
revoke all on public.korisnici from anon;
revoke insert, delete, truncate on public.korisnici from authenticated;
grant select, update on public.korisnici to authenticated;

alter table public.drustva enable row level security;
drop policy if exists drustva_citanje on public.drustva;
create policy drustva_citanje on public.drustva
  for select to authenticated using (public.je_odobren());
revoke all on public.drustva from anon;
revoke insert, update, delete, truncate on public.drustva from authenticated;
grant select on public.drustva to authenticated;

-- ---------------------------------------------------------------------------
-- Admin funkcije. Svaka sama provjerava je_admin().
-- ---------------------------------------------------------------------------
create or replace function public.admin_odobri(p_korisnik uuid, p_odobren boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.je_admin() then
    raise exception 'Samo administrator' using errcode = '42501';
  end if;
  if p_korisnik = auth.uid() and not p_odobren then
    raise exception 'Administrator ne može opozvati sam sebe' using errcode = '22023';
  end if;
  update public.korisnici
     set odobren = p_odobren, promijenio = auth.uid(), promijenjeno = now()
   where id = p_korisnik;
  if not found then
    raise exception 'Korisnik ne postoji' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_postavi_ulogu(p_korisnik uuid, p_admin boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.je_admin() then
    raise exception 'Samo administrator' using errcode = '42501';
  end if;
  if not p_admin and (
    select count(*) from public.korisnici where is_admin and odobren and id <> p_korisnik
  ) = 0 then
    raise exception 'Mora ostati bar jedan administrator' using errcode = '22023';
  end if;
  update public.korisnici
     set is_admin = p_admin, promijenio = auth.uid(), promijenjeno = now()
   where id = p_korisnik;
  if not found then
    raise exception 'Korisnik ne postoji' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_reset_pin(p_korisnik uuid, p_pin text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not public.je_admin() then
    raise exception 'Samo administrator' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{6,8}$' then
    raise exception 'PIN mora imati 6 do 8 cifara' using errcode = '22023';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = p_korisnik;
  if not found then
    raise exception 'Korisnik ne postoji' using errcode = 'P0002';
  end if;
  update public.korisnici set promijenio = auth.uid(), promijenjeno = now() where id = p_korisnik;
end;
$$;

create or replace function public.admin_obrisi_korisnika(p_korisnik uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.je_admin() then
    raise exception 'Samo administrator' using errcode = '42501';
  end if;
  if p_korisnik = auth.uid() then
    raise exception 'Administrator ne može obrisati sam sebe' using errcode = '22023';
  end if;
  delete from auth.users where id = p_korisnik;
end;
$$;

revoke execute on function
  public.admin_odobri(uuid, boolean),
  public.admin_postavi_ulogu(uuid, boolean),
  public.admin_reset_pin(uuid, text),
  public.admin_obrisi_korisnika(uuid),
  public.novi_korisnik(),
  public.zastiti_korisnika()
from public, anon;

grant execute on function
  public.admin_odobri(uuid, boolean),
  public.admin_postavi_ulogu(uuid, boolean),
  public.admin_reset_pin(uuid, text),
  public.admin_obrisi_korisnika(uuid),
  public.je_odobren(),
  public.je_admin()
to authenticated;
