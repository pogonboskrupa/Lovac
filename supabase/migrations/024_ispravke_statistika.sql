-- Ispravke poslije pregleda koda (v0.5.4): (1) statistika računa godinu i mjesec po bosanskom vremenu, a ne po UTC-u
-- baze (ulov u 00:30 na 1. januar je u novoj godini); (2) odgovor na "Gdje si?" mora imati vrijednost (da/ne).
-- Funkcije se samo zamjenjuju (CREATE OR REPLACE), pa je migracija idempotentna.

-- Prijavljeni ulov po sekciji, vrsti i mjesecu (bez imena lovaca).
create or replace function public.statistika_ulov(p_sek uuid, p_revir uuid, p_od date, p_do date)
returns table (revir_id uuid, sekcija_id uuid, vrsta text, mjesec date, komada int, kg numeric)
language sql stable security definer set search_path = public as $$
  select s.revir_id, s.sekcija_id, u.vrsta, date_trunc('month', (u.vrijeme at time zone 'Europe/Sarajevo'))::date, count(*)::int, coalesce(sum(u.tezina), 0)::numeric
  from public.sekcije_opsega(p_sek, p_revir) s
  join public.ulov_prijave u on u.sekcija_id = s.sekcija_id and not u.povucena
    and (u.vrijeme at time zone 'Europe/Sarajevo')::date between coalesce(p_od, date '1900-01-01') and coalesce(p_do, date '2999-12-31')
  group by s.revir_id, s.sekcija_id, u.vrsta, date_trunc('month', (u.vrijeme at time zone 'Europe/Sarajevo'))::date;
$$;

-- Podaci za rejting po lovcu i sekciji (ocjenu računa klijent po težinama iz rejting_kriteriji).
create or replace function public.rejting_podaci(p_sek uuid, p_revir uuid, p_od date, p_do date)
returns table (korisnik_id uuid, sekcija_id uuid, revir_id uuid, lovova_odrzano int, lovova_ucesce int,
               mjeseci_lovova int, mjeseci_ucesce int, komada int, kg numeric, vrsta int, prijava_ukupno int, prijava_u_roku int)
language sql stable security definer set search_path = public as $$
  with sek as (select * from public.sekcije_opsega(p_sek, p_revir)),
  osobe as (
    select s.sekcija_id, s.revir_id, c.korisnik_id from sek s
      join public.sekcija_clanovi c on c.sekcija_id = s.sekcija_id and c.status = 'odobren'
    union
    select s.sekcija_id, s.revir_id, g.grupovodja_id from sek s
      join public.sekcije g on g.id = s.sekcija_id where g.grupovodja_id is not null),
  lov as (
    select l.id, l.sekcija_id, date_trunc('month', l.datum)::date as mjesec
    from public.lovovi l join sek on sek.sekcija_id = l.sekcija_id
    where l.status in ('u_toku', 'zavrsen')
      and l.datum between coalesce(p_od, date '1900-01-01') and coalesce(p_do, date '2999-12-31')),
  pr as (
    select u.* from public.ulov_prijave u join sek on sek.sekcija_id = u.sekcija_id
    where not u.povucena and (u.vrijeme at time zone 'Europe/Sarajevo')::date between coalesce(p_od, date '1900-01-01') and coalesce(p_do, date '2999-12-31'))
  select o.korisnik_id, o.sekcija_id, o.revir_id,
    (select count(*) from lov where lov.sekcija_id = o.sekcija_id)::int,
    (select count(*) from lov join public.lov_ucesnici u on u.lov_id = lov.id
       where lov.sekcija_id = o.sekcija_id and u.korisnik_id = o.korisnik_id)::int,
    (select count(distinct lov.mjesec) from lov where lov.sekcija_id = o.sekcija_id)::int,
    (select count(distinct lov.mjesec) from lov join public.lov_ucesnici u on u.lov_id = lov.id
       where lov.sekcija_id = o.sekcija_id and u.korisnik_id = o.korisnik_id)::int,
    (select count(*) from pr where pr.lovac_id = o.korisnik_id and pr.sekcija_id = o.sekcija_id)::int,
    (select coalesce(sum(pr.tezina), 0) from pr where pr.lovac_id = o.korisnik_id and pr.sekcija_id = o.sekcija_id)::numeric,
    (select count(distinct pr.vrsta) from pr where pr.lovac_id = o.korisnik_id and pr.sekcija_id = o.sekcija_id)::int,
    (select count(*) from pr where pr.lovac_id = o.korisnik_id and pr.sekcija_id = o.sekcija_id)::int,
    (select count(*) from pr where pr.lovac_id = o.korisnik_id and pr.sekcija_id = o.sekcija_id
       and pr.prijavljeno - pr.vrijeme <= interval '24 hours')::int
  from osobe o;
$$;


create or replace function public.cuvaj_lokacija_zahtjev()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.lokacija_zahtjevi z
               where z.od_id = new.od_id and z.za_id = new.za_id and z.created_at > now() - interval '2 minutes') then
      raise exception 'previse_zahtjeva' using errcode = 'P0001';
    end if;
    new.created_at := now();
    new.odgovor := null;
    new.odgovoreno := null;
    return new;
  end if;
  if new.id <> old.id or new.sekcija_id <> old.sekcija_id or new.od_id <> old.od_id
     or new.za_id <> old.za_id or new.created_at <> old.created_at then
    raise exception 'zahtjev se ne mijenja' using errcode = '42501';
  end if;
  if old.odgovor is not null then
    raise exception 'zahtjev je vec odgovoren' using errcode = '42501';
  end if;
  if new.odgovor is null then
    raise exception 'odgovor mora biti da ili ne' using errcode = '42501';
  end if;
  if old.created_at < now() - interval '15 minutes' then
    raise exception 'zahtjev je istekao' using errcode = '42501';
  end if;
  new.odgovoreno := now();
  return new;
end $$;
