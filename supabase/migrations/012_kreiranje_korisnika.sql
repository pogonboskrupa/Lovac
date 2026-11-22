-- Kreiranje naloga za lovce (ime, prezime, nadimak + PIN) i dodavanje u sekciju.
--  * admin, lovočuvar revira sekcije i grupovođa sekcije: nalog je odmah odobren i član sekcije;
--  * obični odobreni član sekcije: može PREDLOŽITI lovca — nalog nastaje, ali ne može ući dok grupovođa (ili admin)
--    ne odobri (zahtjev u sekcija_clanovi sa pozvao_id); najviše 5 neodobrenih predloga po članu.
-- Nalog se pravi direktno u auth.users (SECURITY DEFINER), jer klijent ne smije koristiti service_role ključ.
-- Idempotentno: smije se pokrenuti više puta.

create extension if not exists pgcrypto with schema extensions;

alter table public.sekcija_clanovi add column if not exists pozvao_id uuid references public.korisnici (id) on delete set null;

create or replace function public.kreiraj_korisnika(p_ime text, p_prezime text, p_nadimak text, p_pin text, p_email text, p_sekcija uuid)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, auth
as $$
declare
  v_me uuid := auth.uid();
  v_direct boolean;
  v_member boolean;
  v_id uuid := gen_random_uuid();
  v_col text;
begin
  if v_me is null or not public.je_odobren() then
    raise exception 'Samo odobreni korisnici mogu praviti naloge' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sekcije s where s.id = p_sekcija and s.aktivno) then
    raise exception 'Sekcija ne postoji' using errcode = 'P0002';
  end if;
  v_direct := public.je_admin() or public.je_lovocuvar_sekcije(p_sekcija) or public.moze_upravljati_sekcijom(p_sekcija);
  v_member := exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sekcija and c.korisnik_id = v_me and c.status = 'odobren');
  if not v_direct and not v_member then
    raise exception 'Nemaš pravo da praviš naloge za ovu sekciju' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_ime, ''))) not between 2 and 40 or length(trim(coalesce(p_prezime, ''))) not between 2 and 40
     or length(coalesce(p_nadimak, '')) > 20 then
    raise exception 'Ime, prezime ili nadimak nisu ispravni' using errcode = '22023';
  end if;
  if p_pin !~ '^[0-9]{6,8}$' then
    raise exception 'PIN mora imati 6 do 8 cifara' using errcode = '22023';
  end if;
  if p_email !~ '^[a-z0-9-]+\.[a-z0-9-]+(\.[a-z0-9-]+)?@lovci\.grmec\.app$' then
    raise exception 'Neispravan interni email' using errcode = '22023';
  end if;
  if exists (select 1 from auth.users u where u.email = p_email) then
    raise exception 'Korisnik s tim imenom i prezimenom već postoji. Upiši nadimak ili broj člana.' using errcode = '23505';
  end if;
  if not v_direct and (select count(*) from public.sekcija_clanovi c where c.pozvao_id = v_me and c.status = 'ceka') >= 5 then
    raise exception 'Imaš previše predloga koji čekaju odobrenje grupovođe' using errcode = '54000';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
          extensions.crypt(p_pin, extensions.gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('ime', trim(p_ime), 'prezime', trim(p_prezime), 'nadimak', trim(coalesce(p_nadimak, ''))),
          now(), now());

  -- Prijava traži da tekstualne kolone tokena nisu NULL; koje postoje zavisi od verzije servisa.
  for v_col in select column_name from information_schema.columns
                where table_schema = 'auth' and table_name = 'users'
                  and column_name in ('confirmation_token', 'recovery_token', 'email_change', 'email_change_token_new',
                                      'email_change_token_current', 'phone_change', 'phone_change_token', 'reauthentication_token') loop
    execute format('update auth.users set %1$I = coalesce(%1$I, '''') where id = $1', v_col) using v_id;
  end loop;

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());

  update public.korisnici set nadimak = nullif(trim(coalesce(p_nadimak, '')), ''),
         odobren = v_direct, promijenio = v_me, promijenjeno = now()
   where id = v_id;
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status, pozvao_id)
  values (p_sekcija, v_id, case when v_direct then 'odobren' else 'ceka' end, v_me);

  return jsonb_build_object('id', v_id, 'email', p_email, 'odobren', v_direct);
end;
$$;

-- Grupovođa/admin odobrava predloženog lovca: i članstvo i sam nalog.
create or replace function public.odobri_pozvanog(p_sekcija uuid, p_korisnik uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.moze_upravljati_sekcijom(p_sekcija) then
    raise exception 'Samo grupovođa sekcije ili admin odobrava' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sekcija and c.korisnik_id = p_korisnik
                  and c.status = 'ceka' and c.pozvao_id is not null) then
    raise exception 'Nema predloga za ovog lovca' using errcode = 'P0002';
  end if;
  update public.sekcija_clanovi set status = 'odobren' where sekcija_id = p_sekcija and korisnik_id = p_korisnik;
  update public.korisnici set odobren = true, promijenio = auth.uid(), promijenjeno = now() where id = p_korisnik;
end;
$$;

-- Odbijanje predloga briše nalog koji nikad nije bio odobren (nema podataka koje bi trebalo čuvati).
create or replace function public.odbij_pozvanog(p_sekcija uuid, p_korisnik uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.moze_upravljati_sekcijom(p_sekcija) then
    raise exception 'Samo grupovođa sekcije ili admin odbija' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sekcija_clanovi c where c.sekcija_id = p_sekcija and c.korisnik_id = p_korisnik
                  and c.status = 'ceka' and c.pozvao_id is not null) then
    raise exception 'Nema predloga za ovog lovca' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.korisnici k where k.id = p_korisnik and k.odobren) then
    delete from public.sekcija_clanovi where sekcija_id = p_sekcija and korisnik_id = p_korisnik;
  else
    delete from auth.users where id = p_korisnik;
  end if;
end;
$$;

revoke execute on function public.kreiraj_korisnika(text, text, text, text, text, uuid) from public, anon;
revoke execute on function public.odobri_pozvanog(uuid, uuid) from public, anon;
revoke execute on function public.odbij_pozvanog(uuid, uuid) from public, anon;
grant execute on function public.kreiraj_korisnika(text, text, text, text, text, uuid) to authenticated;
grant execute on function public.odobri_pozvanog(uuid, uuid) to authenticated;
grant execute on function public.odbij_pozvanog(uuid, uuid) to authenticated;
