-- Test 035: lovočuvar i administrator mogu dijeliti lokaciju sa sekcijom; članovi je vide, administrator tuđe i dalje ne;
-- korisnik van sekcije i dalje ne dijeli.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000035a1', 'admin35@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000035b1', 'gv35@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000035c1', 'clan35@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000035d1', 'lc35@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000035d2', 'van35@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000035%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000035a1';
insert into public.revir_lovocuvari values ((select id from public.reviri where naziv = 'Krupa'), '00000000-0000-0000-0000-0000000035d1');
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000351', (select id from public.reviri where naziv = 'Krupa'), 'S35', '00000000-0000-0000-0000-0000000035b1');
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
  ('55555555-0000-4000-8000-000000000351', '00000000-0000-0000-0000-0000000035c1', 'odobren');

-- lovočuvar i admin dijele
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000035d1', true); end $$;
insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000351', 44.88, 16.15, now() + interval '1 hour');
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000035a1', true); end $$;
insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000351', 44.9, 16.2, now() + interval '1 hour');
-- admin vidi samo svoju (ne tuđe)
do $$ begin
  assert (select count(*) from public.sekcija_lokacije) = 1, 'admin vidi samo svoju lokaciju';
end $$;
-- van sekcije ne dijeli
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000035d2', true); end $$;
do $$ begin
  begin insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000351', 44.88, 16.15, now() + interval '1 hour');
    raise exception 'vanjski dijeli';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.sekcija_lokacije) = 0, 'vanjski ne vidi';
end $$;
-- član vidi lovočuvara i admina; grupovođa i lovočuvar također
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000035c1', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_lokacije) = 2, 'član vidi 2'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000035b1', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_lokacije) = 2, 'grupovođa vidi 2'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000035d1', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_lokacije) = 2, 'lovočuvar vidi 2'; end $$;
reset role;
rollback;
