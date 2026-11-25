-- 038: probni period je 24 sata (bio 7 dana), a zahtjev za pristup sekciji može odobriti i lovočuvar revira.
-- Probni period traje dok grupovođa, lovočuvar revira ili administrator ne prihvate lovca; poslije isteka
-- aplikacija traži odobrenje. Idempotentno.

-- Kolona iz 026: novi_korisnik je upisuje, pa bez nje registracija pada ("column probni_do does not exist")
-- kad je ova migracija pokrenuta prije 026.
alter table public.korisnici add column if not exists probni_do timestamptz;

create or replace function public.probni_sati()
returns int language sql immutable as $$ select 24 $$;

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
    case when (new.raw_user_meta_data ->> 'probni') = 'true' then now() + make_interval(hours => public.probni_sati()) end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Lovočuvar revira (ili grupovođa sekcije, ili admin) odobrava zahtjev lovca u sekciji; trigger
-- odobri_nalog_clana (026) tada trajno odobri i nalog. Samo za zahtjev koji stvarno čeka.
create or replace function public.odobri_zahtjev(p_sekcija uuid, p_korisnik uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (public.moze_upravljati_sekcijom(p_sekcija)
          or public.je_lovocuvar_revira((select s.revir_id from public.sekcije s where s.id = p_sekcija))) then
    raise exception 'Nemaš pravo odobriti zahtjev' using errcode = '42501';
  end if;
  update public.sekcija_clanovi set status = 'odobren'
   where sekcija_id = p_sekcija and korisnik_id = p_korisnik and status = 'ceka';
  if not found then
    raise exception 'Zahtjev ne postoji' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.odbij_zahtjev(p_sekcija uuid, p_korisnik uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not (public.moze_upravljati_sekcijom(p_sekcija)
          or public.je_lovocuvar_revira((select s.revir_id from public.sekcije s where s.id = p_sekcija))) then
    raise exception 'Nemaš pravo odbiti zahtjev' using errcode = '42501';
  end if;
  delete from public.sekcija_clanovi
   where sekcija_id = p_sekcija and korisnik_id = p_korisnik and status = 'ceka' and pozvao_id is null;
end;
$$;

revoke execute on function public.odobri_zahtjev(uuid, uuid), public.odbij_zahtjev(uuid, uuid) from public, anon;
grant execute on function public.odobri_zahtjev(uuid, uuid), public.odbij_zahtjev(uuid, uuid) to authenticated;
