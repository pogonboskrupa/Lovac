-- Arhiva lova: početak/kraj lova (bilježi server), rezultat (tekst grupovođe), trag kretanja učesnika tokom lova,
-- slike lova (mala sličica + smanjena slika, unose učesnici i grupovođa). Vide svi koji vide lov (vidi_lov).
-- Idempotentno.

alter table public.lovovi add column if not exists pocetak timestamptz;
alter table public.lovovi add column if not exists kraj timestamptz;
alter table public.lovovi add column if not exists rezultat text check (rezultat is null or char_length(rezultat) <= 2000);

create or replace function public.biljezi_vrijeme_lova()
returns trigger language plpgsql as $$
begin
  if new.status = 'u_toku' and old.status is distinct from 'u_toku' then
    new.pocetak := coalesce(new.pocetak, now());
  end if;
  if new.status = 'zavrsen' and old.status is distinct from 'zavrsen' then
    new.pocetak := coalesce(new.pocetak, old.pocetak, now());
    new.kraj := coalesce(new.kraj, now());
  end if;
  return new;
end;
$$;
drop trigger if exists vrijeme_lova on public.lovovi;
create trigger vrijeme_lova before update on public.lovovi for each row execute function public.biljezi_vrijeme_lova();

-- Trag kretanja: tačke učesnika dok lov traje (šalje klijent u paketima); ostaju u arhivi lova.
create table if not exists public.lov_tragovi (
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  t timestamptz not null,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  primary key (lov_id, korisnik_id, t)
);

-- Slike lova: metapodaci + sličica, a velika slika u zasebnoj tabeli (lista ne vuče velike podatke).
create table if not exists public.lov_slike (
  id uuid primary key,
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.korisnici (id) on delete cascade,
  mala text not null check (char_length(mala) <= 40000),
  opis text check (opis is null or char_length(opis) <= 300),
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);
create table if not exists public.lov_slike_podaci (
  id uuid primary key references public.lov_slike (id) on delete cascade,
  slika text not null check (char_length(slika) <= 1200000)
);

create or replace function public.moze_dodati_u_lov(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (public.je_ucesnik(p_lov) or public.moze_organizovati(p_lov));
$$;

create or replace function public.vidi_sliku_lova(p_slika uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lov_slike s where s.id = p_slika and public.vidi_lov(s.lov_id));
$$;

create or replace function public.moja_slika_lova(p_slika uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lov_slike s where s.id = p_slika and s.autor_id = auth.uid());
$$;

do $$
declare t text;
begin
  foreach t in array array['lov_tragovi', 'lov_slike', 'lov_slike_podaci'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
  end loop;
end $$;
grant select, insert on public.lov_tragovi to authenticated;
grant select, insert, delete on public.lov_slike to authenticated;
grant select, insert on public.lov_slike_podaci to authenticated;

drop policy if exists citanje on public.lov_tragovi;
create policy citanje on public.lov_tragovi for select to authenticated using (public.vidi_lov(lov_id));
drop policy if exists unos on public.lov_tragovi;
create policy unos on public.lov_tragovi for insert to authenticated
  with check (korisnik_id = auth.uid() and public.je_ucesnik(lov_id) and public.lov_u_toku(lov_id));

drop policy if exists citanje on public.lov_slike;
create policy citanje on public.lov_slike for select to authenticated using (public.vidi_lov(lov_id));
drop policy if exists unos on public.lov_slike;
create policy unos on public.lov_slike for insert to authenticated
  with check (autor_id = auth.uid() and public.moze_dodati_u_lov(lov_id));
drop policy if exists brisanje on public.lov_slike;
create policy brisanje on public.lov_slike for delete to authenticated
  using (autor_id = auth.uid() or public.moze_organizovati(lov_id));

drop policy if exists citanje on public.lov_slike_podaci;
create policy citanje on public.lov_slike_podaci for select to authenticated using (public.vidi_sliku_lova(id));
drop policy if exists unos on public.lov_slike_podaci;
create policy unos on public.lov_slike_podaci for insert to authenticated with check (public.moja_slika_lova(id));

revoke execute on function public.biljezi_vrijeme_lova(), public.moze_dodati_u_lov(uuid), public.vidi_sliku_lova(uuid), public.moja_slika_lova(uuid) from public, anon;
grant execute on function public.moze_dodati_u_lov(uuid), public.vidi_sliku_lova(uuid), public.moja_slika_lova(uuid) to authenticated;
