-- 045: hijerarhija vodstva. Društvo: Lovovođa društva (1) i Lovočuvari (najviše 2, rade na cijelom području);
-- revir: Lovovođa revira (jedan po reviru; to je postojeći `revir_vodje`); sekcija: Lovovođa sekcije (`sekcije.grupovodja_id`);
-- ispod sekcije dolaze grupe sa grupovođom (grupa nema naziv, prepoznaje se po grupovođi); lovac je u jednoj grupi po sekciji.
-- Zavisi samo od 001–025; idempotentno.

-- ---------- uloge na nivou društva ----------
create table if not exists public.drustvo_uloge (
  korisnik_id uuid not null references public.korisnici (id) on delete cascade,
  uloga text not null check (uloga in ('lovocuvar', 'lovovodja_drustva', 'predsjednik')),
  primary key (korisnik_id, uloga)
);
-- Starija verzija ove migracije nije imala 'predsjednik': ograničenje se zamjenjuje (idempotentno).
alter table public.drustvo_uloge drop constraint if exists drustvo_uloge_uloga_check;
alter table public.drustvo_uloge add constraint drustvo_uloge_uloga_check check (uloga in ('lovocuvar', 'lovovodja_drustva', 'predsjednik'));

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
  if new.uloga = 'predsjednik' and (select count(*) from public.drustvo_uloge u where u.uloga = 'predsjednik' and u.korisnik_id <> new.korisnik_id) >= 1 then
    raise exception 'Društvo ima samo jednog predsjednika' using errcode = '23514';
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
    or exists (select 1 from public.drustvo_uloge d where d.korisnik_id = auth.uid() and d.uloga = 'predsjednik')
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
create policy citanje on public.grupe for select to authenticated using (public.je_clan_sekcije(sekcija_id) or public.moze_upravljati_grupama(sekcija_id) or public.je_rukovodstvo());
drop policy if exists upravljanje on public.grupe;
create policy upravljanje on public.grupe for all to authenticated
  using (public.moze_upravljati_grupama(sekcija_id)) with check (public.moze_upravljati_grupama(sekcija_id));

revoke execute on function public.je_lovovodja_drustva(), public.je_lovocuvar_drustva(), public.je_lovovodja_revira(uuid),
  public.moze_upravljati_grupama(uuid) from public, anon;
grant execute on function public.je_lovovodja_drustva(), public.je_lovocuvar_drustva(), public.je_lovovodja_revira(uuid),
  public.moze_upravljati_grupama(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Faza 2: grupovođa mora biti odobren član te sekcije; raspoređivanje lovca u grupu.
-- ---------------------------------------------------------------------------
create or replace function public.provjeri_grupovodju()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.sekcija_clanovi c
                  where c.sekcija_id = new.sekcija_id and c.korisnik_id = new.grupovodja_id and c.status = 'odobren') then
    raise exception 'Grupovođa mora biti odobren član sekcije' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists grupovodja_clan on public.grupe;
create trigger grupovodja_clan before insert or update of grupovodja_id, sekcija_id on public.grupe
  for each row execute function public.provjeri_grupovodju();

-- Lovca u grupu (ili iz grupe, p_grupa = null) stavljaju oni koji upravljaju grupama (lovovođa sekcije, revira,
-- društva, admin) i grupovođa grupe u koju lovac ulazi / iz koje izlazi. Lovac je u jednoj grupi po sekciji (jedna kolona).
create or replace function public.dodijeli_grupu(p_sekcija uuid, p_korisnik uuid, p_grupa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_stara uuid;
begin
  if not public.je_odobren() then raise exception 'Nema pristupa' using errcode = '42501'; end if;
  select c.grupa_id into v_stara from public.sekcija_clanovi c
   where c.sekcija_id = p_sekcija and c.korisnik_id = p_korisnik and c.status = 'odobren';
  if not found then raise exception 'Lovac nije odobren član sekcije' using errcode = '23514'; end if;
  if not (public.moze_upravljati_grupama(p_sekcija)
          or exists (select 1 from public.grupe g where g.grupovodja_id = auth.uid() and g.id in (coalesce(p_grupa, v_stara), coalesce(v_stara, p_grupa)))) then
    raise exception 'Nemaš pravo raspoređivati u grupe' using errcode = '42501';
  end if;
  update public.sekcija_clanovi set grupa_id = p_grupa where sekcija_id = p_sekcija and korisnik_id = p_korisnik;
end;
$$;
revoke execute on function public.dodijeli_grupu(uuid, uuid, uuid) from public, anon;
grant execute on function public.dodijeli_grupu(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Faza 3: lov po grupi, dopuštenje grupovođe višima, prijem članova viših rukovodilaca.
-- ---------------------------------------------------------------------------
-- Dopuštenje grupovođe: bez njega lov za grupu ne organizuju lovovođa sekcije, lovovođa društva ni admin.
alter table public.grupe add column if not exists dozvola_visih boolean not null default false;
alter table public.lovovi add column if not exists grupa_id uuid references public.grupe (id) on delete set null;

-- Dopuštenje mijenja samo grupovođa te grupe (ne i oni koji grupu uređuju); nova grupa je uvijek bez dopuštenja.
create or replace function public.zastiti_dozvolu_grupe()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.dozvola_visih := false;
  elsif new.dozvola_visih is distinct from old.dozvola_visih and old.grupovodja_id is distinct from auth.uid() then
    new.dozvola_visih := old.dozvola_visih;
  end if;
  return new;
end;
$$;
drop trigger if exists dozvola_grupe on public.grupe;
create trigger dozvola_grupe before insert or update on public.grupe
  for each row execute function public.zastiti_dozvolu_grupe();

create or replace function public.dozvoli_visim(p_grupa uuid, p_dozvola boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.je_odobren() then raise exception 'Nema pristupa' using errcode = '42501'; end if;
  update public.grupe set dozvola_visih = p_dozvola where id = p_grupa and grupovodja_id = auth.uid();
  if not found then raise exception 'Samo grupovođa grupe daje dopuštenje' using errcode = '42501'; end if;
end;
$$;
revoke execute on function public.dozvoli_visim(uuid, boolean) from public, anon;
grant execute on function public.dozvoli_visim(uuid, boolean) to authenticated;

create or replace function public.provjeri_grupu_lova()
returns trigger language plpgsql as $$
begin
  if new.grupa_id is not null and not exists (select 1 from public.grupe g where g.id = new.grupa_id and g.sekcija_id = new.sekcija_id) then
    raise exception 'Grupa nije iz sekcije lova' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists grupa_lova on public.lovovi;
create trigger grupa_lova before insert or update of grupa_id, sekcija_id on public.lovovi
  for each row execute function public.provjeri_grupu_lova();

-- Ko smije praviti/voditi lov: lovovođa revira uvijek u svom reviru; lov cijele sekcije lovovođa sekcije, lovovođa društva i admin;
-- lov grupe grupovođa te grupe, a viši (lovovođa sekcije, društva, admin) samo uz dopuštenje grupovođe.
create or replace function public.moze_praviti_lov(p_revir uuid, p_sekcija uuid, p_grupa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    public.je_vodja_revira(p_revir)
    or (p_grupa is null and (public.je_admin() or public.je_lovovodja_drustva()
        or (p_sekcija is not null and public.moze_upravljati_sekcijom(p_sekcija)
            and exists (select 1 from public.sekcije s where s.id = p_sekcija and s.revir_id = p_revir))))
    or (p_grupa is not null and p_sekcija is not null
        and exists (select 1 from public.grupe g join public.sekcije s on s.id = g.sekcija_id
                     where g.id = p_grupa and g.sekcija_id = p_sekcija and s.revir_id = p_revir
                       and (g.grupovodja_id = auth.uid() or (g.dozvola_visih and public.moze_upravljati_grupama(p_sekcija))))));
$$;

create or replace function public.moze_organizovati(p_lov uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lovovi l where l.id = p_lov and public.moze_praviti_lov(l.revir_id, l.sekcija_id, l.grupa_id));
$$;

drop policy if exists unos on public.lovovi;
create policy unos on public.lovovi for insert to authenticated
  with check (organizator_id = auth.uid() and public.moze_praviti_lov(revir_id, sekcija_id, grupa_id));
drop policy if exists izmjena on public.lovovi;
create policy izmjena on public.lovovi for update to authenticated
  using (public.moze_organizovati(id)) with check (public.moze_praviti_lov(revir_id, sekcija_id, grupa_id));

-- Članove prima svaki rukovodilac: lovovođa sekcije, lovovođa revira, lovovođa društva i admin
-- (raspoređivanje u grupu ide posebno, kroz dodijeli_grupu).
create or replace function public.moze_primati_clanove(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.moze_upravljati_sekcijom(p_sek) or (public.je_odobren() and exists (
    select 1 from public.sekcije s where s.id = p_sek and (public.je_vodja_revira(s.revir_id) or public.je_lovovodja_drustva())));
$$;
revoke execute on function public.moze_praviti_lov(uuid, uuid, uuid), public.moze_primati_clanove(uuid) from public, anon;
grant execute on function public.moze_praviti_lov(uuid, uuid, uuid), public.moze_primati_clanove(uuid) to authenticated;

drop policy if exists citanje on public.sekcija_clanovi;
create policy citanje on public.sekcija_clanovi for select to authenticated using (
  korisnik_id = auth.uid()
  or public.moze_primati_clanove(sekcija_id)
  or public.je_lovocuvar_sekcije(sekcija_id)
  or (status = 'odobren' and public.je_clan_sekcije(sekcija_id)));
drop policy if exists unos on public.sekcija_clanovi;
create policy unos on public.sekcija_clanovi for insert to authenticated with check (
  (korisnik_id = auth.uid() and status = 'ceka') or public.moze_primati_clanove(sekcija_id));
drop policy if exists odobrenje on public.sekcija_clanovi;
create policy odobrenje on public.sekcija_clanovi for update to authenticated
  using (public.moze_primati_clanove(sekcija_id)) with check (public.moze_primati_clanove(sekcija_id));
drop policy if exists brisanje on public.sekcija_clanovi;
create policy brisanje on public.sekcija_clanovi for delete to authenticated
  using (korisnik_id = auth.uid() or public.moze_primati_clanove(sekcija_id));
