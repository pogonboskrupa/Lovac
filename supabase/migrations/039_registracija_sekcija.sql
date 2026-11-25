-- 039: pri registraciji lovac sam bira revir i sekciju; admin (ili lovočuvar/grupovođa) prihvata ili prebacuje u drugu.
-- Izbor je samo ZAHTJEV (sekcija_clanovi.status = 'ceka'): bez odobrenja nema ulaza u sekciju.
-- Idempotentno.

-- Kolona iz 026: novi_korisnik je upisuje, pa bez nje registracija pada ("column probni_do does not exist")
-- kad je ova migracija pokrenuta prije 026.
alter table public.korisnici add column if not exists probni_do timestamptz;

create or replace function public.probni_sati()
returns int language sql immutable as $$ select 24 $$;

-- Spisak za ekran registracije (prije prijave): samo nazivi aktivnih sekcija i revira, bez ikakvih podataka o ljudima.
create or replace function public.javne_sekcije()
returns table (sekcija_id uuid, naziv text, revir_id uuid, revir text)
language sql stable security definer
set search_path = public
as $$
  select s.id, s.naziv, s.revir_id, r.naziv
    from public.sekcije s join public.reviri r on r.id = s.revir_id
   where s.aktivno
   order by r.naziv, s.naziv;
$$;
revoke execute on function public.javne_sekcije() from public;
grant execute on function public.javne_sekcije() to anon, authenticated;

-- Samoregistracija sa izabranom sekcijom pravi zahtjev za pristup (nalog i dalje ostaje probni 24 h).
create or replace function public.novi_korisnik()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_sek uuid;
begin
  insert into public.korisnici (id, ime, prezime, nadimak, drustvo_id, probni_do)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'ime'), ''), '?'), 40),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'prezime'), ''), '?'), 40),
    left(nullif(trim(new.raw_user_meta_data ->> 'nadimak'), ''), 20),
    (select d.id from public.drustva d order by d.created_at limit 1),
    case when (new.raw_user_meta_data ->> 'probni') = 'true' then now() + make_interval(hours => public.probni_sati()) end
  )
  on conflict (id) do nothing;

  if (new.raw_user_meta_data ->> 'probni') = 'true' and (new.raw_user_meta_data ->> 'sekcija') ~* '^[0-9a-f-]{36}$' then
    select s.id into v_sek from public.sekcije s
     where s.id = (new.raw_user_meta_data ->> 'sekcija')::uuid and s.aktivno;
    if v_sek is not null then
      insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status)
      values (v_sek, new.id, 'ceka')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- Prebacivanje zahtjeva (lovac se greškom prijavio u pogrešnu sekciju): admin, grupovođa ili lovočuvar izvorne sekcije.
create or replace function public.premjesti_zahtjev(p_iz uuid, p_u uuid, p_korisnik uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (public.je_admin()
          or public.moze_upravljati_sekcijom(p_iz)
          or public.je_lovocuvar_revira((select s.revir_id from public.sekcije s where s.id = p_iz))) then
    raise exception 'Nemaš pravo prebaciti zahtjev' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sekcije s where s.id = p_u and s.aktivno) then
    raise exception 'Sekcija ne postoji' using errcode = 'P0002';
  end if;
  delete from public.sekcija_clanovi
   where sekcija_id = p_iz and korisnik_id = p_korisnik and status = 'ceka';
  if not found then
    raise exception 'Zahtjev ne postoji' using errcode = 'P0002';
  end if;
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status)
  values (p_u, p_korisnik, 'ceka')
  on conflict do nothing;
end;
$$;

revoke execute on function public.premjesti_zahtjev(uuid, uuid, uuid) from public, anon;
grant execute on function public.premjesti_zahtjev(uuid, uuid, uuid) to authenticated;
