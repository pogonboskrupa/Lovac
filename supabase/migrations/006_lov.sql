-- 006: zajednički lov — reviri, vođe lova po reviru, lovovi, učesnici, stanovi, ručni sektori.
-- Idempotentno.
--
-- Pravila:
--  * vođa lova je posebna uloga PO REVIRU (dodjeljuje je admin), nije admin;
--  * lov organizuje (pravi, mijenja, postavlja stanove) admin ili vođa tog revira;
--  * lov, raspored i sektore vide samo učesnici tog lova, organizatori i admin;
--  * broj telefona (za SOS SMS) vide samo učesnici lova koji je U TOKU. Zato je u posebnoj
--    tabeli: kolona u `korisnici` bila bi vidljiva svim odobrenim lovcima.

create table if not exists public.kontakti (
  korisnik_id uuid primary key default auth.uid() references public.korisnici (id) on delete cascade,
  telefon text not null check (telefon ~ '^\+?[0-9 ]{6,20}$')
);

create table if not exists public.reviri (
  id uuid primary key default gen_random_uuid(),
  naziv text not null unique,
  aktivno boolean not null default true,
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

create table if not exists public.revir_vodje (
  revir_id uuid not null references public.reviri (id) on delete cascade,
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  primary key (revir_id, korisnik_id)
);

create table if not exists public.lovovi (
  id uuid primary key default gen_random_uuid(),
  revir_id uuid not null references public.reviri (id),
  naziv text not null,
  datum date not null,
  status text not null default 'planiran' check (status in ('planiran', 'u_toku', 'zavrsen')),
  napomena text,
  organizator_id uuid not null default auth.uid() references public.korisnici (id),
  created_at timestamptz not null default now(),
  promijenio uuid,
  promijenjeno timestamptz not null default now()
);

create table if not exists public.lov_ucesnici (
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  uloga text not null default 'strijelac' check (uloga in ('strijelac', 'pogonic', 'vodja')),
  primary key (lov_id, korisnik_id)
);

create table if not exists public.stanovi (
  id uuid primary key default gen_random_uuid(),
  lov_id uuid not null references public.lovovi (id) on delete cascade,
  broj int not null,
  naziv text,
  lat double precision,
  lon double precision,
  korisnik_id uuid references public.korisnici (id) on delete set null,
  napomena text,
  unique (lov_id, broj)
);

-- Ručno zabranjeni pravci (put, kuće...). Pravci prema drugim stanovima računa aplikacija.
create table if not exists public.sektori (
  id uuid primary key default gen_random_uuid(),
  stan_id uuid not null references public.stanovi (id) on delete cascade,
  od_azimut double precision not null check (od_azimut >= 0 and od_azimut < 360),
  do_azimut double precision not null check (do_azimut >= 0 and do_azimut <= 360),
  razlog text not null
);

-- ---------------------------------------------------------------------------
-- Provjere (SECURITY DEFINER da RLS politike ne ulaze u rekurziju; svaka sama provjerava odobrenje)
-- ---------------------------------------------------------------------------
create or replace function public.je_vodja_revira(p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.revir_vodje v where v.revir_id = p_revir and v.korisnik_id = auth.uid());
$$;

create or replace function public.moze_organizovati(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_admin() or exists (
    select 1 from public.lovovi l where l.id = p_lov and public.je_vodja_revira(l.revir_id));
$$;

create or replace function public.je_ucesnik(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.lov_ucesnici u where u.lov_id = p_lov and u.korisnik_id = auth.uid());
$$;

create or replace function public.vidi_lov(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_ucesnik(p_lov) or public.moze_organizovati(p_lov);
$$;

-- Telefoni učesnika za SOS: samo za učesnika lova koji je u toku.
create or replace function public.lov_telefoni(p_lov uuid)
returns table (korisnik_id uuid, ime text, prezime text, telefon text)
language sql stable security definer set search_path = public as $$
  select k.id, k.ime, k.prezime, c.telefon
    from public.lov_ucesnici u
    join public.korisnici k on k.id = u.korisnik_id
    join public.kontakti c on c.korisnik_id = u.korisnik_id
    join public.lovovi l on l.id = u.lov_id
   where u.lov_id = p_lov
     and l.status = 'u_toku'
     and public.je_ucesnik(p_lov);
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['kontakti', 'reviri', 'revir_vodje', 'lovovi', 'lov_ucesnici', 'stanovi', 'sektori'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- kontakt: samo svoj (drugi lovci ga dobijaju isključivo kroz lov_telefoni za lov u toku)
drop policy if exists svoj on public.kontakti;
create policy svoj on public.kontakti for all to authenticated
  using (korisnik_id = auth.uid()) with check (korisnik_id = auth.uid());

-- reviri i vođe: čitaju svi odobreni, mijenja samo admin
drop policy if exists citanje on public.reviri;
create policy citanje on public.reviri for select to authenticated using (true);
drop policy if exists admin_pise on public.reviri;
create policy admin_pise on public.reviri for all to authenticated using (public.je_admin()) with check (public.je_admin());
drop trigger if exists izmjena on public.reviri;
create trigger izmjena before insert or update on public.reviri for each row execute function public.zapisi_izmjenu();

drop policy if exists citanje on public.revir_vodje;
create policy citanje on public.revir_vodje for select to authenticated using (true);
drop policy if exists admin_pise on public.revir_vodje;
create policy admin_pise on public.revir_vodje for all to authenticated using (public.je_admin()) with check (public.je_admin());

-- lovovi
drop policy if exists citanje on public.lovovi;
create policy citanje on public.lovovi for select to authenticated using (public.vidi_lov(id));
drop policy if exists unos on public.lovovi;
create policy unos on public.lovovi for insert to authenticated
  with check (organizator_id = auth.uid() and (public.je_admin() or public.je_vodja_revira(revir_id)));
drop policy if exists izmjena on public.lovovi;
create policy izmjena on public.lovovi for update to authenticated
  using (public.moze_organizovati(id)) with check (public.je_admin() or public.je_vodja_revira(revir_id));
drop policy if exists brisanje on public.lovovi;
create policy brisanje on public.lovovi for delete to authenticated using (public.moze_organizovati(id) and status = 'planiran');
drop trigger if exists izmjena on public.lovovi;
create trigger izmjena before insert or update on public.lovovi for each row execute function public.zapisi_izmjenu();

-- učesnici, stanovi, sektori: čitaju oni koji vide lov, piše organizator
drop policy if exists citanje on public.lov_ucesnici;
create policy citanje on public.lov_ucesnici for select to authenticated using (public.vidi_lov(lov_id));
drop policy if exists organizator on public.lov_ucesnici;
create policy organizator on public.lov_ucesnici for all to authenticated
  using (public.moze_organizovati(lov_id)) with check (public.moze_organizovati(lov_id));

drop policy if exists citanje on public.stanovi;
create policy citanje on public.stanovi for select to authenticated using (public.vidi_lov(lov_id));
drop policy if exists organizator on public.stanovi;
create policy organizator on public.stanovi for all to authenticated
  using (public.moze_organizovati(lov_id)) with check (public.moze_organizovati(lov_id));

drop policy if exists citanje on public.sektori;
create policy citanje on public.sektori for select to authenticated using (
  exists (select 1 from public.stanovi s where s.id = stan_id and public.vidi_lov(s.lov_id)));
drop policy if exists organizator on public.sektori;
create policy organizator on public.sektori for all to authenticated
  using (exists (select 1 from public.stanovi s where s.id = stan_id and public.moze_organizovati(s.lov_id)))
  with check (exists (select 1 from public.stanovi s where s.id = stan_id and public.moze_organizovati(s.lov_id)));

revoke execute on function public.je_vodja_revira(uuid), public.moze_organizovati(uuid), public.je_ucesnik(uuid),
  public.vidi_lov(uuid), public.lov_telefoni(uuid) from public, anon;
grant execute on function public.je_vodja_revira(uuid), public.moze_organizovati(uuid), public.je_ucesnik(uuid),
  public.vidi_lov(uuid), public.lov_telefoni(uuid) to authenticated;
