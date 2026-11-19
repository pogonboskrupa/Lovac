-- 008: sekcije unutar revira, grupovođe, lovočuvari i pristup sekciji uz odobrenje.
-- Idempotentno.
--
-- Pravila:
--  * tri revira (Krupa, Otoka, Jezerski); unutar revira su sekcije;
--  * sekcija ima jednog lovočuvara i jednog grupovođu;
--  * admin pravi i uređuje sekcije i određuje ko je grupovođa (po reviru);
--  * grupovođa može napraviti sekciju u SVOM reviru, sa spiskom lovaca;
--  * lovac traži pristup (status 'ceka'); odobrava grupovođa ili admin; BEZ ODOBRENJA nema ulaza
--    (server ne daje članove ni lovove sekcije).

insert into public.reviri (naziv) values ('Krupa'), ('Otoka'), ('Jezerski')
on conflict (naziv) do nothing;

create table if not exists public.grupovodje (
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  revir_id uuid not null references public.reviri (id),
  primary key (korisnik_id, revir_id)
);

create table if not exists public.sekcije (
  id uuid primary key default gen_random_uuid(),
  revir_id uuid not null references public.reviri (id),
  naziv text not null check (length(trim(naziv)) between 2 and 60),
  grupovodja_id uuid references public.korisnici (id) on delete set null,
  lovocuvar_id uuid references public.korisnici (id) on delete set null,
  aktivno boolean not null default true,
  created_by uuid default auth.uid(),
  promijenio uuid,
  promijenjeno timestamptz not null default now(),
  unique (revir_id, naziv)
);

create table if not exists public.sekcija_clanovi (
  sekcija_id uuid not null references public.sekcije (id) on delete cascade,
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  status text not null default 'ceka' check (status in ('ceka', 'odobren')),
  created_at timestamptz not null default now(),
  odlucio uuid,
  odlucio_at timestamptz,
  primary key (sekcija_id, korisnik_id)
);

-- ---------------------------------------------------------------------------
-- Provjere (SECURITY DEFINER da politike ne ulaze u rekurziju)
-- ---------------------------------------------------------------------------
create or replace function public.je_grupovodja_revira(p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (
    select 1 from public.grupovodje g where g.korisnik_id = auth.uid() and g.revir_id = p_revir);
$$;

create or replace function public.moze_upravljati_sekcijom(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_admin() or exists (
    select 1 from public.sekcije s
     where s.id = p_sek and s.grupovodja_id = auth.uid() and public.je_odobren());
$$;

create or replace function public.je_clan_sekcije(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or exists (select 1 from public.sekcije s
                where s.id = p_sek and (s.grupovodja_id = auth.uid() or s.lovocuvar_id = auth.uid()))
    or exists (select 1 from public.sekcija_clanovi c
                where c.sekcija_id = p_sek and c.korisnik_id = auth.uid() and c.status = 'odobren'));
$$;

-- Običan korisnik (ni admin) ne može mijenjati revir, grupovođu ni lovočuvara; ko i kad upisuje server.
create or replace function public.zastiti_sekciju()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and not public.je_admin() then
    new.revir_id := old.revir_id;
    new.grupovodja_id := old.grupovodja_id;
    new.lovocuvar_id := old.lovocuvar_id;
    new.created_by := old.created_by;
  end if;
  new.promijenio := auth.uid();
  new.promijenjeno := now();
  return new;
end;
$$;

create or replace function public.zapisi_odluku()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status = 'odobren' and old.status <> 'odobren' then
    new.odlucio := auth.uid();
    new.odlucio_at := now();
  end if;
  if tg_op = 'INSERT' and new.status = 'odobren' then
    new.odlucio := auth.uid();
    new.odlucio_at := now();
  end if;
  -- Zahtjev se ne smije "preseliti" na drugu sekciju ni korisnika.
  if tg_op = 'UPDATE' then
    new.sekcija_id := old.sekcija_id;
    new.korisnik_id := old.korisnik_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists zastita on public.sekcije;
create trigger zastita before insert or update on public.sekcije
  for each row execute function public.zastiti_sekciju();
drop trigger if exists odluka on public.sekcija_clanovi;
create trigger odluka before insert or update on public.sekcija_clanovi
  for each row execute function public.zapisi_odluku();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['grupovodje', 'sekcije', 'sekcija_clanovi'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- grupovođe: admin sve; ostali vide samo svoj red
drop policy if exists admin_sve on public.grupovodje;
create policy admin_sve on public.grupovodje for all to authenticated using (public.je_admin()) with check (public.je_admin());
drop policy if exists svoje on public.grupovodje;
create policy svoje on public.grupovodje for select to authenticated using (korisnik_id = auth.uid());

-- sekcije: imena vide svi odobreni (da bi mogli tražiti pristup)
drop policy if exists citanje on public.sekcije;
create policy citanje on public.sekcije for select to authenticated using (true);
drop policy if exists unos on public.sekcije;
create policy unos on public.sekcije for insert to authenticated with check (
  public.je_admin()
  or (public.je_grupovodja_revira(revir_id) and grupovodja_id = auth.uid()));
drop policy if exists izmjena on public.sekcije;
create policy izmjena on public.sekcije for update to authenticated
  using (public.moze_upravljati_sekcijom(id)) with check (public.moze_upravljati_sekcijom(id));
-- brisanja nema: sekcija se sklanja (aktivno = false)
revoke delete on public.sekcije from authenticated;

-- članovi i zahtjevi
drop policy if exists citanje on public.sekcija_clanovi;
create policy citanje on public.sekcija_clanovi for select to authenticated using (
  korisnik_id = auth.uid()
  or public.moze_upravljati_sekcijom(sekcija_id)
  or exists (select 1 from public.sekcije s where s.id = sekcija_id and s.lovocuvar_id = auth.uid())
  or (status = 'odobren' and public.je_clan_sekcije(sekcija_id)));
drop policy if exists unos on public.sekcija_clanovi;
create policy unos on public.sekcija_clanovi for insert to authenticated with check (
  (korisnik_id = auth.uid() and status = 'ceka')
  or public.moze_upravljati_sekcijom(sekcija_id));
drop policy if exists odobrenje on public.sekcija_clanovi;
create policy odobrenje on public.sekcija_clanovi for update to authenticated
  using (public.moze_upravljati_sekcijom(sekcija_id)) with check (public.moze_upravljati_sekcijom(sekcija_id));
drop policy if exists brisanje on public.sekcija_clanovi;
create policy brisanje on public.sekcija_clanovi for delete to authenticated
  using (korisnik_id = auth.uid() or public.moze_upravljati_sekcijom(sekcija_id));

-- ---------------------------------------------------------------------------
-- Lovovi sekcije: grupovođa organizuje, članovi sekcije vide
-- ---------------------------------------------------------------------------
alter table public.lovovi add column if not exists sekcija_id uuid references public.sekcije (id);

create or replace function public.moze_organizovati(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_admin() or exists (
    select 1 from public.lovovi l
     where l.id = p_lov
       and (public.je_vodja_revira(l.revir_id)
            or (l.sekcija_id is not null and public.moze_upravljati_sekcijom(l.sekcija_id))));
$$;

create or replace function public.vidi_lov(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_ucesnik(p_lov) or public.moze_organizovati(p_lov) or exists (
    select 1 from public.lovovi l
     where l.id = p_lov and l.sekcija_id is not null and public.je_clan_sekcije(l.sekcija_id));
$$;

drop policy if exists unos on public.lovovi;
create policy unos on public.lovovi for insert to authenticated with check (
  organizator_id = auth.uid() and (
    public.je_admin()
    or public.je_vodja_revira(revir_id)
    or (sekcija_id is not null and public.moze_upravljati_sekcijom(sekcija_id)
        and exists (select 1 from public.sekcije s where s.id = lovovi.sekcija_id and s.revir_id = lovovi.revir_id))));
drop policy if exists izmjena on public.lovovi;
create policy izmjena on public.lovovi for update to authenticated
  using (public.moze_organizovati(id))
  with check (
    public.je_admin()
    or public.je_vodja_revira(revir_id)
    or (sekcija_id is not null and public.moze_upravljati_sekcijom(sekcija_id)
        and exists (select 1 from public.sekcije s where s.id = lovovi.sekcija_id and s.revir_id = lovovi.revir_id)));

revoke execute on function public.je_grupovodja_revira(uuid), public.moze_upravljati_sekcijom(uuid),
  public.je_clan_sekcije(uuid), public.zastiti_sekciju(), public.zapisi_odluku() from public, anon;
grant execute on function public.je_grupovodja_revira(uuid), public.moze_upravljati_sekcijom(uuid),
  public.je_clan_sekcije(uuid) to authenticated;
