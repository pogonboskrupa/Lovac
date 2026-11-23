-- 026: probni period od 7 dana za lovca koji se SAM registruje.
-- Dok traje, aplikacija radi (vlastiti zapisi, karte, spiskovi, zahtjev za pristup sekciji), a stalni pristup daje
-- administrator (Korisnici → Odobri) ili grupovođa kad ga primi u svoju sekciju.
-- Probni lovac NE vidi zapise podijeljene sa društvom ni spisak članova: bilo ko može napraviti nalog, pa bi inače
-- 7 dana gledao lokacije hranilišta, čeka i opažanja.
-- Nalozi koje pravi grupovođa/admin (kreiraj_korisnika) su odmah odobreni i nemaju probni period.
-- Idempotentno.

alter table public.korisnici add column if not exists probni_do timestamptz;

-- Trajanje se mijenja samo ovdje.
create or replace function public.probni_dani()
returns int language sql immutable as $$ select 7 $$;

-- Samoregistracija iz aplikacije šalje probni=true; rok uvijek postavlja server (klijent ne bira trajanje).
create or replace function public.novi_korisnik()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.korisnici (id, ime, prezime, nadimak, drustvo_id, probni_do)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'ime'), ''), '?'), 40),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'prezime'), ''), '?'), 40),
    left(nullif(trim(new.raw_user_meta_data ->> 'nadimak'), ''), 20),
    (select d.id from public.drustva d order by d.created_at limit 1),
    case when (new.raw_user_meta_data ->> 'probni') = 'true' then now() + make_interval(days => public.probni_dani()) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Odobren ILI u probnom periodu: koristi se u RESTRICTIVE politikama svih tabela (aplikacija radi).
create or replace function public.je_odobren()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select k.odobren or coalesce(k.probni_do > now(), false) from public.korisnici k where k.id = auth.uid()), false);
$$;

-- Stvarno odobren član društva (bez probnog perioda): za podatke društva.
create or replace function public.je_clan_drustva()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select k.odobren from public.korisnici k where k.id = auth.uid()), false);
$$;

revoke execute on function public.je_clan_drustva() from public, anon;
grant execute on function public.je_clan_drustva() to authenticated;

-- Zapisi podijeljeni sa društvom: samo stvarni članovi.
do $$
declare t text;
begin
  foreach t in array array['objekti', 'opazanja', 'odstrel', 'tragovi'] loop
    execute format('drop policy if exists citanje on public.%I', t);
    execute format($p$create policy citanje on public.%I for select to authenticated using (
      vlasnik_id = auth.uid()
      or (vidljivost = 'drustvo' and public.je_clan_drustva())
      or (vidljivost = 'izabrani' and auth.uid() = any (dijeli_sa))
    )$p$, t);
  end loop;
end $$;

-- Spisak članova: probni lovac vidi samo sebe.
drop policy if exists korisnici_citanje on public.korisnici;
create policy korisnici_citanje on public.korisnici
  for select to authenticated
  using (
    id = auth.uid()
    or public.je_admin()
    or (public.je_clan_drustva() and odobren)
  );

-- probni_do mijenja samo server (kao odobren).
create or replace function public.zastiti_korisnika()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') and (
       new.id is distinct from old.id
    or new.is_admin is distinct from old.is_admin
    or new.odobren is distinct from old.odobren
    or new.probni_do is distinct from old.probni_do
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

-- Opoziv prekida i probni period (inače bi opozvan lovac radio do isteka roka).
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
     set odobren = p_odobren, probni_do = null, promijenio = auth.uid(), promijenjeno = now()
   where id = p_korisnik;
  if not found then
    raise exception 'Korisnik ne postoji' using errcode = 'P0002';
  end if;
end;
$$;

-- Grupovođa (ili admin) koji primi lovca u sekciju time odobrava i njegov nalog.
-- Ko smije postaviti status 'odobren' već provjeravaju RLS politike sekcija_clanovi.
create or replace function public.odobri_nalog_clana()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status = 'odobren' and (tg_op = 'INSERT' or old.status is distinct from 'odobren') then
    update public.korisnici
       set odobren = true, probni_do = null, promijenio = auth.uid(), promijenjeno = now()
     where id = new.korisnik_id and not odobren;
  end if;
  return new;
end;
$$;

revoke execute on function public.odobri_nalog_clana() from public, anon, authenticated;

drop trigger if exists odobri_nalog_clana on public.sekcija_clanovi;
create trigger odobri_nalog_clana
  after insert or update of status on public.sekcija_clanovi
  for each row execute function public.odobri_nalog_clana();
