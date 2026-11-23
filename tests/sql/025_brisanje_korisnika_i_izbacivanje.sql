-- Test 025: admin briše korisnika koji ima lovove/kamere/izmjene rejtinga; izbačen član ne ostaje u lovu ni u dijeljenju.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000025a1', 'admin25@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000025b1', 'gv25@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000025c1', 'clan25@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000025c2', 'clan25b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000025d1', 'novi25@t', '{"ime":"Novi","prezime":"Korisnik"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000025a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000025b1', '00000000-0000-0000-0000-0000000025c1', '00000000-0000-0000-0000-0000000025c2');

-- Postavka: grupovođa sa sekcijom, lovom u toku, kamerom i izmjenom rejtinga.
insert into public.grupovodje values ('00000000-0000-0000-0000-0000000025b1', (select id from public.reviri where naziv = 'Krupa'));
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000251', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 25', '00000000-0000-0000-0000-0000000025b1');
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
  ('55555555-0000-4000-8000-000000000251', '00000000-0000-0000-0000-0000000025c1', 'odobren'),
  ('55555555-0000-4000-8000-000000000251', '00000000-0000-0000-0000-0000000025c2', 'odobren');
insert into public.lovovi (id, revir_id, naziv, datum, organizator_id, sekcija_id, status) values
  ('77777777-0000-4000-8000-000000000251', (select id from public.reviri where naziv = 'Krupa'), 'Lov 25', current_date,
   '00000000-0000-0000-0000-0000000025b1', '55555555-0000-4000-8000-000000000251', 'planiran'),
  ('77777777-0000-4000-8000-000000000252', (select id from public.reviri where naziv = 'Krupa'), 'Završen lov 25', current_date - 3,
   '00000000-0000-0000-0000-0000000025b1', '55555555-0000-4000-8000-000000000251', 'zavrsen');
insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values
  ('77777777-0000-4000-8000-000000000251', '00000000-0000-0000-0000-0000000025c1', 'strijelac'),
  ('77777777-0000-4000-8000-000000000251', '00000000-0000-0000-0000-0000000025c2', 'strijelac'),
  ('77777777-0000-4000-8000-000000000252', '00000000-0000-0000-0000-0000000025c1', 'strijelac');
insert into public.sekcija_lokacije (sekcija_id, korisnik_id, lat, lon, do_) values
  ('55555555-0000-4000-8000-000000000251', '00000000-0000-0000-0000-0000000025c1', 44.8, 16.1, now() + interval '1 hour');
insert into public.revir_lovocuvari (revir_id, korisnik_id) values ((select id from public.reviri where naziv = 'Krupa'), '00000000-0000-0000-0000-0000000025b1');
insert into public.kamere (id, revir_id, naziv, lat, lon, autor_id) values
  ('88888888-0000-4000-8000-000000000251', (select id from public.reviri where naziv = 'Krupa'), 'Kamera 25', 44.8, 16.1, '00000000-0000-0000-0000-0000000025b1');
update public.rejting_kriteriji set izmijenio = '00000000-0000-0000-0000-0000000025b1' where kod = (select kod from public.rejting_kriteriji limit 1);

-- 1) Admin ga opoziva (ostaje u bazi, bez pristupa) pa briše: lov, kamera i rejting ostaju, autor je prazan.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000025a1', true); end $$;
select public.admin_odobri('00000000-0000-0000-0000-0000000025b1', false);
do $$ begin
  if (select odobren from public.korisnici where id = '00000000-0000-0000-0000-0000000025b1') then raise exception 'opoziv nije radio'; end if;
end $$;
select public.admin_obrisi_korisnika('00000000-0000-0000-0000-0000000025b1');
reset role;
do $$ begin
  if exists (select 1 from public.korisnici where id = '00000000-0000-0000-0000-0000000025b1') then raise exception 'korisnik nije obrisan'; end if;
  if (select organizator_id from public.lovovi where id = '77777777-0000-4000-8000-000000000251') is not null then raise exception 'organizator mora biti prazan'; end if;
  if (select count(*) from public.kamere where id = '88888888-0000-4000-8000-000000000251' and autor_id is null) <> 1 then raise exception 'kamera mora ostati bez autora'; end if;
  if exists (select 1 from public.rejting_kriteriji where izmijenio = '00000000-0000-0000-0000-0000000025b1') then raise exception 'izmijenio mora biti prazan'; end if;
end $$;

-- 2) Novi korisnik (neodobren) se može obrisati bez posljedica.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000025a1', true); end $$;
select public.admin_obrisi_korisnika('00000000-0000-0000-0000-0000000025d1');
reset role;
do $$ begin
  if exists (select 1 from public.korisnici where id = '00000000-0000-0000-0000-0000000025d1') then raise exception 'novi korisnik nije obrisan'; end if;
end $$;

-- 3) Admin ne može obrisati sam sebe, a običan član ne može brisati nikoga.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000025a1', true); end $$;
do $$ begin
  begin perform public.admin_obrisi_korisnika('00000000-0000-0000-0000-0000000025a1'); raise exception 'admin je obrisao sebe';
  exception when sqlstate '22023' then null; end;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000025c1', true); end $$;
do $$ begin
  begin perform public.admin_obrisi_korisnika('00000000-0000-0000-0000-0000000025c2'); raise exception 'član je obrisao korisnika';
  exception when sqlstate '42501' then null; end;
  begin perform public.admin_odobri('00000000-0000-0000-0000-0000000025c2', false); raise exception 'član je opozvao korisnika';
  exception when sqlstate '42501' then null; end;
end $$;
reset role;

-- 4) Grupovođa (nova, jer je ranija obrisana) izbacuje člana: nestaje iz planiranih lovova sekcije i iz dijeljenja,
--    a završen lov (historija) ostaje. Prije toga admin postavlja novog grupovođu.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000025a1', true); end $$;
insert into public.grupovodje values ('00000000-0000-0000-0000-0000000025c2', (select id from public.reviri where naziv = 'Krupa')) on conflict do nothing;
delete from public.sekcija_clanovi where sekcija_id = '55555555-0000-4000-8000-000000000251' and korisnik_id = '00000000-0000-0000-0000-0000000025c2';
update public.sekcije set grupovodja_id = '00000000-0000-0000-0000-0000000025c2' where id = '55555555-0000-4000-8000-000000000251';
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000025c2', true); end $$;
delete from public.sekcija_clanovi where sekcija_id = '55555555-0000-4000-8000-000000000251' and korisnik_id = '00000000-0000-0000-0000-0000000025c1';
reset role;
do $$ begin
  if exists (select 1 from public.sekcija_clanovi where sekcija_id = '55555555-0000-4000-8000-000000000251' and korisnik_id = '00000000-0000-0000-0000-0000000025c1')
    then raise exception 'član nije izbačen'; end if;
  if exists (select 1 from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000251' and korisnik_id = '00000000-0000-0000-0000-0000000025c1')
    then raise exception 'izbačeni član je ostao u planiranom lovu'; end if;
  if not exists (select 1 from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000252' and korisnik_id = '00000000-0000-0000-0000-0000000025c1')
    then raise exception 'historija završenog lova mora ostati'; end if;
  if exists (select 1 from public.sekcija_lokacije where korisnik_id = '00000000-0000-0000-0000-0000000025c1')
    then raise exception 'izbačeni član i dalje dijeli lokaciju sa sekcijom'; end if;
end $$;

rollback;
