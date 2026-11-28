-- 053: dijeljenje lokacije (van lova) ide unutar GRUPE. Lovac i grupovođa koji su u grupi dijele samo sa svojom grupom;
-- rang iznad (lovovođa sekcije, lovovođa i lovočuvar revira, uloge udruženja) vidi sve grupe u svom opsegu.
-- Ko nije ni u jednoj grupi (vodstvo, administrator) i dalje dijeli sa cijelom sekcijom (`grupa_id` je null).
-- Grupu postavlja SERVER (okidač), klijent je ne bira. Zavisi od 001–025 i 045 (grupe). Idempotentno.

alter table public.sekcija_lokacije add column if not exists grupa_id uuid references public.grupe (id) on delete cascade;

-- Grupa u kojoj dijelim: moja grupa u toj sekciji (član ili grupovođa grupe); inače null (cijela sekcija).
create or replace function public.moja_grupa_u_sekciji(p_sek uuid, p_korisnik uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.grupa_id from public.sekcija_clanovi c
      where c.sekcija_id = p_sek and c.korisnik_id = p_korisnik and c.status = 'odobren' and c.grupa_id is not null),
    (select g.id from public.grupe g where g.sekcija_id = p_sek and g.grupovodja_id = p_korisnik limit 1));
$$;

-- Rang iznad grupe: lovovođa sekcije, lovovođa/lovočuvar revira, uloge udruženja (predsjednik, lovovođa, lovočuvari).
create or replace function public.vodstvo_sekcije(p_sek uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    exists (select 1 from public.drustvo_uloge d where d.korisnik_id = auth.uid())
    or exists (select 1 from public.sekcije s where s.id = p_sek
      and (s.grupovodja_id = auth.uid() or s.lovocuvar_id = auth.uid()
        or public.je_vodja_revira(s.revir_id) or public.je_lovocuvar_revira(s.revir_id))));
$$;

-- Ko vidi red: vlasnik; grupa (članovi i grupovođa te grupe); vodstvo sekcije. Red bez grupe = stari način (cijela sekcija).
create or replace function public.vidi_lokaciju_reda(p_sek uuid, p_grupa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_grupa is null then public.vidi_lokacije_sekcije(p_sek) or public.vodstvo_sekcije(p_sek)
    else public.vodstvo_sekcije(p_sek)
      or public.moja_grupa_u_sekciji(p_sek, auth.uid()) = p_grupa
  end;
$$;

create or replace function public.postavi_grupu_lokacije()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.grupa_id := public.moja_grupa_u_sekciji(new.sekcija_id, new.korisnik_id);
  return new;
end $$;
drop trigger if exists grupa_lokacije on public.sekcija_lokacije;
create trigger grupa_lokacije before insert or update on public.sekcija_lokacije
  for each row execute function public.postavi_grupu_lokacije();

-- Promjena grupe prekida dijeljenje: stari red bi inače ostao vidljiv staroj grupi.
create or replace function public.ocisti_lokaciju_pri_promjeni_grupe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.grupa_id is distinct from old.grupa_id then
    delete from public.sekcija_lokacije where sekcija_id = new.sekcija_id and korisnik_id = new.korisnik_id;
  end if;
  return null;
end $$;
drop trigger if exists lokacija_grupa_promjena on public.sekcija_clanovi;
create trigger lokacija_grupa_promjena after update of grupa_id on public.sekcija_clanovi
  for each row execute function public.ocisti_lokaciju_pri_promjeni_grupe();

drop policy if exists citanje on public.sekcija_lokacije;
create policy citanje on public.sekcija_lokacije for select to authenticated
  using (do_ > now() and (korisnik_id = auth.uid() or public.vidi_lokaciju_reda(sekcija_id, grupa_id)));

revoke execute on function public.moja_grupa_u_sekciji(uuid, uuid), public.vodstvo_sekcije(uuid), public.vidi_lokaciju_reda(uuid, uuid) from public, anon;
grant execute on function public.moja_grupa_u_sekciji(uuid, uuid), public.vodstvo_sekcije(uuid), public.vidi_lokaciju_reda(uuid, uuid) to authenticated;
