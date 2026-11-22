-- Statistika po sekcijama, revirima i cijelom društvu + rejting lovaca po više kriterija.
-- Opseg: admin sve; lovočuvar svoj revir; grupovođa, lovočuvar i članovi svoju sekciju. Zbirke i rejting računaju SECURITY
-- DEFINER funkcije koje same provjeravaju opseg (izvan opsega vraćaju prazno), pa lovac vidi zbirke svoje sekcije bez
-- pristupa tuđim pojedinačnim prijavama. Težine kriterija unosi administrator (uz zapis ko je i kad promijenio). Idempotentno.

create table if not exists public.rejting_kriteriji (
  kod text primary key check (kod in ('odaziv', 'tacnost', 'redovnost', 'raznovrsnost', 'ulov')),
  naziv text not null,
  opis text not null default '',
  tezina int not null check (tezina between 0 and 100),
  granica numeric check (granica is null or granica > 0), -- gornja granica gdje ima smisla (broj komada, broj vrsta)
  aktivno boolean not null default true,
  redoslijed int not null default 0,
  izmijenio uuid references public.korisnici (id),
  izmijenjeno timestamptz not null default now()
);

-- Zadane težine (primarno lovački kriteriji); administrator ih može mijenjati.
insert into public.rejting_kriteriji (kod, naziv, opis, tezina, granica, redoslijed) values
  ('odaziv', 'Odaziv na lovove', 'Udio lovova sekcije na kojima je lovac bio na spisku učesnika', 40, null, 10),
  ('tacnost', 'Tačnost prijave ulova', 'Udio ulova prijavljenih društvu u roku od 24 sata', 25, null, 20),
  ('redovnost', 'Redovnost kroz sezonu', 'U koliko mjeseci sa lovovima je lovac učestvovao', 15, null, 30),
  ('raznovrsnost', 'Raznovrsnost prijavljenog ulova', 'Broj različitih vrsta (do gornje granice)', 10, 4, 40),
  ('ulov', 'Prijavljeni ulov', 'Broj prijavljenih komada, sa gornjom granicom da se ne nagrađuje pretjeran odstrel', 10, 10, 50)
on conflict (kod) do nothing;

alter table public.rejting_kriteriji enable row level security;
drop policy if exists samo_odobreni on public.rejting_kriteriji;
create policy samo_odobreni on public.rejting_kriteriji as restrictive for all to authenticated
  using (public.je_odobren()) with check (public.je_odobren());
revoke all on public.rejting_kriteriji from anon;
revoke all on public.rejting_kriteriji from authenticated;
grant select, insert, update on public.rejting_kriteriji to authenticated;
drop policy if exists citanje on public.rejting_kriteriji;
create policy citanje on public.rejting_kriteriji for select to authenticated using (true);
drop policy if exists unos on public.rejting_kriteriji;
create policy unos on public.rejting_kriteriji for insert to authenticated with check (public.je_admin());
drop policy if exists izmjena on public.rejting_kriteriji;
create policy izmjena on public.rejting_kriteriji for update to authenticated using (public.je_admin()) with check (public.je_admin());

create or replace function public.biljezi_rejting_kriterij()
returns trigger language plpgsql as $$
begin
  new.izmijenio := auth.uid();
  new.izmijenjeno := now();
  return new;
end $$;
drop trigger if exists biljezi_rejting_kriterij on public.rejting_kriteriji;
create trigger biljezi_rejting_kriterij before insert or update on public.rejting_kriteriji
  for each row execute function public.biljezi_rejting_kriterij();

-- Ko smije gledati opseg: sekcija (član, grupovođa, lovočuvar revira, admin), revir (lovočuvar, admin) ili društvo (admin).
create or replace function public.opseg_dozvoljen(p_sek uuid, p_revir uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.je_odobren() and (
    case when p_sek is not null then public.je_clan_sekcije(p_sek)
         when p_revir is not null then public.je_admin() or public.je_lovocuvar_revira(p_revir)
         else public.je_admin() end);
$$;

create or replace function public.sekcije_opsega(p_sek uuid, p_revir uuid)
returns table (sekcija_id uuid, revir_id uuid) language sql stable security definer set search_path = public as $$
  select s.id, s.revir_id from public.sekcije s
  where s.aktivno and public.opseg_dozvoljen(p_sek, p_revir)
    and (p_sek is null or s.id = p_sek) and (p_sek is not null or p_revir is null or s.revir_id = p_revir);
$$;

-- Prijavljeni ulov po sekciji, vrsti i mjesecu (bez imena lovaca).
create or replace function public.statistika_ulov(p_sek uuid, p_revir uuid, p_od date, p_do date)
returns table (revir_id uuid, sekcija_id uuid, vrsta text, mjesec date, komada int, kg numeric)
language sql stable security definer set search_path = public as $$
  select s.revir_id, s.sekcija_id, u.vrsta, date_trunc('month', u.vrijeme)::date, count(*)::int, coalesce(sum(u.tezina), 0)::numeric
  from public.sekcije_opsega(p_sek, p_revir) s
  join public.ulov_prijave u on u.sekcija_id = s.sekcija_id and not u.povucena
    and u.vrijeme >= coalesce(p_od, date '1900-01-01') and u.vrijeme < coalesce(p_do, date '2999-12-31') + 1
  group by s.revir_id, s.sekcija_id, u.vrsta, date_trunc('month', u.vrijeme)::date;
$$;

-- Lovovi i učešća po sekciji (održan = u toku ili završen).
create or replace function public.statistika_lovovi(p_sek uuid, p_revir uuid, p_od date, p_do date)
returns table (revir_id uuid, sekcija_id uuid, lovova int, ucesca int, clanova int)
language sql stable security definer set search_path = public as $$
  select s.revir_id, s.sekcija_id,
    (select count(*) from public.lovovi l where l.sekcija_id = s.sekcija_id and l.status in ('u_toku', 'zavrsen')
       and l.datum between coalesce(p_od, date '1900-01-01') and coalesce(p_do, date '2999-12-31'))::int,
    (select count(*) from public.lovovi l join public.lov_ucesnici u on u.lov_id = l.id
       where l.sekcija_id = s.sekcija_id and l.status in ('u_toku', 'zavrsen')
         and l.datum between coalesce(p_od, date '1900-01-01') and coalesce(p_do, date '2999-12-31'))::int,
    (select count(*) from public.sekcija_clanovi c where c.sekcija_id = s.sekcija_id and c.status = 'odobren')::int
  from public.sekcije_opsega(p_sek, p_revir) s;
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
    where not u.povucena and u.vrijeme >= coalesce(p_od, date '1900-01-01') and u.vrijeme < coalesce(p_do, date '2999-12-31') + 1)
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

revoke execute on function public.opseg_dozvoljen(uuid, uuid), public.sekcije_opsega(uuid, uuid),
  public.statistika_ulov(uuid, uuid, date, date), public.statistika_lovovi(uuid, uuid, date, date),
  public.rejting_podaci(uuid, uuid, date, date) from public, anon;
grant execute on function public.opseg_dozvoljen(uuid, uuid), public.sekcije_opsega(uuid, uuid),
  public.statistika_ulov(uuid, uuid, date, date), public.statistika_lovovi(uuid, uuid, date, date),
  public.rejting_podaci(uuid, uuid, date, date) to authenticated;
