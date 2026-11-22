-- Test 012: ko smije praviti naloge (admin/lovočuvar revira/grupovođa direktno, član samo predlaže), odobravanje i odbijanje.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000012a1', 'admin12@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000012b1', 'gv12@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000012c1', 'clan12@t', '{"ime":"Clan","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000012c2', 'van12@t', '{"ime":"Van","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000012d1', 'lcK12@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000012d2', 'lcO12@t', '{"ime":"Lovocuvar","prezime":"Otoke"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000012a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000012b1', '00000000-0000-0000-0000-0000000012c1', '00000000-0000-0000-0000-0000000012c2',
  '00000000-0000-0000-0000-0000000012d1', '00000000-0000-0000-0000-0000000012d2');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000012d1'), (otoka, '00000000-0000-0000-0000-0000000012d2');
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000121', krupa, 'Krupa A', '00000000-0000-0000-0000-0000000012b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000121', '00000000-0000-0000-0000-0000000012c1', 'odobren');
end $$;
reset role;

-- Grupovođa: direktno odobren nalog i članstvo; lozinka je bcrypt hash, ne PIN.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012b1', true); end $$;
do $$
declare r jsonb; n int;
begin
  r := public.kreiraj_korisnika('Mujo', 'Mujić', '127', '123456', 'mujo.mujic.127@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
  if (r ->> 'odobren')::boolean is not true then raise exception 'FAIL: nalog grupovođe nije odobren'; end if;
end $$;
reset role;
do $$
declare u record;
begin
  select * into u from auth.users where email = 'mujo.mujic.127@lovci.grmec.app';
  if u.id is null then raise exception 'FAIL: nema naloga'; end if;
  if u.encrypted_password = '123456' or u.encrypted_password is null or left(u.encrypted_password, 4) <> '$2a$' then raise exception 'FAIL: lozinka nije bcrypt'; end if;
  if extensions.crypt('123456', u.encrypted_password) <> u.encrypted_password then raise exception 'FAIL: PIN se ne poklapa sa hashom'; end if;
  if not exists (select 1 from auth.identities where user_id = u.id and provider = 'email') then raise exception 'FAIL: nema identiteta'; end if;
  if not exists (select 1 from public.korisnici k where k.id = u.id and k.odobren and k.nadimak = '127' and k.ime = 'Mujo') then raise exception 'FAIL: profil'; end if;
  if not exists (select 1 from public.sekcija_clanovi c where c.korisnik_id = u.id and c.status = 'odobren' and c.pozvao_id = '00000000-0000-0000-0000-0000000012b1') then
    raise exception 'FAIL: članstvo';
  end if;
end $$;

-- Lovočuvar revira Krupa: direktno; lovočuvar Otoke: ne smije (druga sekcija/revir).
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012d1', true); end $$;
do $$ begin
  perform public.kreiraj_korisnika('Pero', 'Perić', '', '654321', 'pero.peric@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012d2', true); end $$;
do $$ begin
  begin
    perform public.kreiraj_korisnika('Ivo', 'Ivić', '', '654321', 'ivo.ivic@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
    raise exception 'FAIL: lovočuvar druge sekcije napravio nalog';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Neodobren ili vanjski korisnik ne smije; neispravni podaci i duplikat se odbijaju.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012c2', true); end $$;
do $$ begin
  begin
    perform public.kreiraj_korisnika('Ana', 'Anić', '', '654321', 'ana.anic@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
    raise exception 'FAIL: korisnik izvan sekcije napravio nalog';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012b1', true); end $$;
do $$ begin
  begin perform public.kreiraj_korisnika('Ana', 'Anić', '', '12345', 'ana.anic@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
    raise exception 'FAIL: kratak PIN'; exception when invalid_parameter_value then null; end;
  begin perform public.kreiraj_korisnika('Ana', 'Anić', '', '123456', 'ana@drugi.com', '55555555-0000-4000-8000-000000000121');
    raise exception 'FAIL: tuđa domena'; exception when invalid_parameter_value then null; end;
  begin perform public.kreiraj_korisnika('Mujo', 'Mujić', '127', '123456', 'mujo.mujic.127@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
    raise exception 'FAIL: duplikat'; exception when unique_violation then null; end;
end $$;
reset role;

-- Član predlaže: nalog NIJE odobren, zahtjev čeka; ne može sam sebe ni njega odobriti.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012c1', true); end $$;
do $$
declare r jsonb;
begin
  r := public.kreiraj_korisnika('Sead', 'Sedić', '', '111111', 'sead.sedic@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
  if (r ->> 'odobren')::boolean then raise exception 'FAIL: predlog član odmah odobren'; end if;
  begin
    perform public.odobri_pozvanog('55555555-0000-4000-8000-000000000121', (r ->> 'id')::uuid);
    raise exception 'FAIL: član odobrio predlog';
  exception when insufficient_privilege then null;
  end;
  -- limit od 5 neodobrenih predloga (jedan je već napravljen)
  for i in 1..4 loop
    perform public.kreiraj_korisnika('Lovac', 'Broj' || i, '', '111111', 'lovac.broj' || i || '@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
  end loop;
  begin
    perform public.kreiraj_korisnika('Lovac', 'Previse', '', '111111', 'lovac.previse@lovci.grmec.app', '55555555-0000-4000-8000-000000000121');
    raise exception 'FAIL: premašen limit predloga';
  exception when program_limit_exceeded then null;
  end;
end $$;
reset role;
do $$ begin
  if (select odobren from public.korisnici where ime = 'Sead') then raise exception 'FAIL: predloženi nalog odobren'; end if;
end $$;

-- Grupovođa odobrava (nalog + članstvo) ili odbija (nalog se briše).
-- (ID-evi se čitaju kao vlasnik baze: neodobrene korisnike RLS ne pokazuje.)
create temp table ids12 as select
  (select id from public.korisnici where ime = 'Sead') as sead,
  (select id from public.korisnici where prezime = 'Broj1') as broj1;
grant select on ids12 to authenticated;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012b1', true); end $$;
do $$
declare sead uuid := (select sead from ids12);
        broj1 uuid := (select broj1 from ids12);
begin
  perform public.odobri_pozvanog('55555555-0000-4000-8000-000000000121', sead);
  perform public.odbij_pozvanog('55555555-0000-4000-8000-000000000121', broj1);
end $$;
reset role;
do $$
declare sead uuid := (select id from public.korisnici where ime = 'Sead');
begin
  if not (select odobren from public.korisnici where id = sead) then raise exception 'FAIL: nalog nije odobren'; end if;
  if not exists (select 1 from public.sekcija_clanovi where korisnik_id = sead and status = 'odobren') then raise exception 'FAIL: članstvo nije odobreno'; end if;
  if exists (select 1 from auth.users where email = 'lovac.broj1@lovci.grmec.app') then raise exception 'FAIL: odbijen nalog nije obrisan'; end if;
end $$;

-- Anon nema pristup funkciji.
do $$ begin
  if has_function_privilege('anon', 'public.kreiraj_korisnika(text,text,text,text,text,uuid)', 'execute') then raise exception 'FAIL: anon izvršava'; end if;
end $$;

rollback;
