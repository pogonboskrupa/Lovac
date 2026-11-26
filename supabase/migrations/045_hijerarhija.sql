-- 045: hijerarhija vodstva. Društvo: Lovovođa društva (1) i Lovočuvari (najviše 2, rade na cijelom području);
-- revir: Lovovođa revira (jedan po reviru; to je postojeći `revir_vodje`); sekcija: Lovovođa sekcije (`sekcije.grupovodja_id`);
-- ispod sekcije dolaze grupe sa grupovođom (grupa nema naziv, prepoznaje se po grupovođi); lovac je u jednoj grupi po sekciji.
-- Zavisi samo od 001–025; idempotentno.

-- ---------- uloge na nivou društva ----------
create table if not exists public.drustvo_uloge (
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  uloga text not null check (uloga in ('lovocuvar', 'lovovodja_drustva')),
  primary key (korisnik_id, uloga)
);

-- Najviše 2 lovočuvara i 1 lovovođa društva (isti korisnik ne broji dvaput).
create or replace function public.ogranici_drustvo_uloge()
returns trigger language plpgsql as $$
begin
  if new.uloga = 'lovocuvar' and (select count(*) from public.drustvo_uloge u where u.uloga = 'lovocuvar' and u.korisnik_id <> new.korisnik_id) >= 2 then
    raise exception 'Društvo može imati najviše 2 lovočuvara' using errcode = '23514';
  end if;
  if new.uloga = 'lovovodja_drustva' and (select count(*) from public.drustvo_uloge u where u.uloga = 'lovovodja_drustva' and u.korisnik_id <> new.korisnik_id) >= 1 then
    raise exception 'Društvo ima samo jednog lovovođu' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists ogranici on public.drustvo_uloge;
create trigger ogranici before insert or update on public.drustvo_uloge
  for each row execute function public.ogranici_drustvo_uloge();

-- Jedan lovovođa po reviru (samo NOVI upisi; postojeći redovi se ne diraju).
create or replace function public.jedan_vodja_revira()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.revir_vodje v where v.revir_id = new.revir_id and v.korisnik_id <> new.korisnik_id) then
    raise exception 'Revir već ima lovovođu; prvo ukloni postojećeg' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists jedan on public.revir_vodje;
create trigger jedan before insert on public.revir_vodje
  for each row execute function public.jedan_vodja_revira();

-- ---------- provjere uloga ----------
create or replace function public.je_lovovodja_drustva()
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (select 1 from public.drustvo_uloge u where u.korisnik_id = auth.uid() and u.uloga = 'lovovodja_drustva');
$$;

create or replace function public.je_lovocuvar_drustva()
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and exists (select 1 from public.drustvo_uloge u where u.korisnik_id = auth.uid() and u.uloga = 'lovocuvar');
$$;

-- Lovovođa revira (revir_vodje) ili neko iznad u lancu (lovovođa društva, admin).
create or replace function public.je_lovovodja_revira(p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_admin() or public.je_lovovodja_drustva() or public.je_vodja_revira(p_revir);
$$;

-- Lovočuvar: sada i oba lovočuvara društva (cijelo područje); stari po-revirski lovočuvari i dalje važe.
create or replace function public.je_lovocuvar_revira(p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_lovocuvar_drustva()
    or exists (select 1 from public.revir_lovocuvari r where r.revir_id = p_revir and r.korisnik_id = auth.uid())
    or exists (select 1 from public.sekcije s where s.revir_id = p_revir and s.lovocuvar_id = auth.uid()));
$$;

-- Rukovodstvo (kanal poruka): i sve nove uloge.
create or replace function public.je_rukovodstvo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin()
    or public.je_lovocuvar_drustva()
    or public.je_lovovodja_drustva()
    or exists (select 1 from public.revir_vodje v where v.korisnik_id = auth.uid())
    or exists (select 1 from public.grupovodje g where g.korisnik_id = auth.uid())
    or exists (select 1 from public.sekcije s where s.aktivno and (s.grupovodja_id = auth.uid() or s.lovocuvar_id = auth.uid()))
    or exists (select 1 from public.revir_lovocuvari r where r.korisnik_id = auth.uid()));
$$;

-- ---------- grupe ----------
create table if not exists public.grupe (
  id uuid primary key default gen_random_uuid(),
  sekcija_id uuid not null references public.sekcije (id) on delete cascade,
  grupovodja_id uuid not null references public.korisnici (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (sekcija_id, grupovodja_id)
);
create index if not exists grupe_sekcija on public.grupe (sekcija_id);

alter table public.sekcija_clanovi add column if not exists grupa_id uuid references public.grupe (id) on delete set null;

-- Ko smije praviti grupe i raspoređivati lovce: lovovođa sekcije, lovovođa revira, lovovođa društva, admin.
create or replace function public.moze_upravljati_grupama(p_sekcija uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_admin() or public.je_lovovodja_drustva()
    or exists (select 1 from public.sekcije s where s.id = p_sekcija and (s.grupovodja_id = auth.uid() or public.je_vodja_revira(s.revir_id))));
$$;

-- Lovac je u grupi iste sekcije u kojoj je član.
create or replace function public.provjeri_grupu_clana()
returns trigger language plpgsql as $$
begin
  if new.grupa_id is not null and not exists (select 1 from public.grupe g where g.id = new.grupa_id and g.sekcija_id = new.sekcija_id) then
    raise exception 'Grupa nije iz iste sekcije' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists grupa_iste_sekcije on public.sekcija_clanovi;
create trigger grupa_iste_sekcije before insert or update of grupa_id, sekcija_id on public.sekcija_clanovi
  for each row execute function public.provjeri_grupu_clana();

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['drustvo_uloge', 'grupe'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists samo_odobreni on public.%I', t);
    execute format('create policy samo_odobreni on public.%I as restrictive for all to authenticated using (public.je_odobren()) with check (public.je_odobren())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Ko su lovočuvari i lovovođa društva zna svaki član (lovac mora znati kome prijavljuje); mijenja samo admin.
drop policy if exists citanje on public.drustvo_uloge;
create policy citanje on public.drustvo_uloge for select to authenticated using (true);
drop policy if exists admin_pise on public.drustvo_uloge;
create policy admin_pise on public.drustvo_uloge for all to authenticated using (public.je_admin()) with check (public.je_admin());

-- Grupe vide članovi sekcije (i rukovodstvo iznad); prave ih i mijenjaju oni koji upravljaju grupama.
drop policy if exists citanje on public.grupe;
create policy citanje on public.grupe for select to authenticated using (public.je_clan_sekcije(sekcija_id) or public.moze_upravljati_grupama(sekcija_id));
drop policy if exists upravljanje on public.grupe;
create policy upravljanje on public.grupe for all to authenticated
  using (public.moze_upravljati_grupama(sekcija_id)) with check (public.moze_upravljati_grupama(sekcija_id));

revoke execute on function public.je_lovovodja_drustva(), public.je_lovocuvar_drustva(), public.je_lovovodja_revira(uuid),
  public.moze_upravljati_grupama(uuid) from public, anon;
grant execute on function public.je_lovovodja_drustva(), public.je_lovocuvar_drustva(), public.je_lovovodja_revira(uuid),
  public.moze_upravljati_grupama(uuid) to authenticated;
