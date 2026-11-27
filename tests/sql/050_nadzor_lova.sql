-- Test 050: vodstvo vidi lovove u toku u svom opsegu (raspored, pozicije, trag); običan član tuđe sekcije i vodstvo tuđeg revira ne.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000050a1', 'pred50@t', '{"ime":"Petar","prezime":"Predsjednik"}'),
  ('00000000-0000-0000-0000-0000000050a2', 'rv50@t', '{"ime":"Ranko","prezime":"VodjaRevira"}'),
  ('00000000-0000-0000-0000-0000000050a3', 'rvtudj50@t', '{"ime":"Tuđ","prezime":"VodjaRevira"}'),
  ('00000000-0000-0000-0000-0000000050c1', 'clan50@t', '{"ime":"Clan","prezime":"Prvi"}'),
  ('00000000-0000-0000-0000-0000000050c2', 'drugi50@t', '{"ime":"Clan","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000050ff', 'adm50@t', '{"ime":"Ado","prezime":"Admin"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000050%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000050ff';
insert into public.reviri (id, naziv) values ('50000000-0000-4000-8000-000000000001', 'R50a'), ('50000000-0000-4000-8000-000000000002', 'R50b');
insert into public.sekcije (id, revir_id, naziv) values
  ('50000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-000000000001', 'S50');
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values ('50000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-0000000050c1', 'odobren');
insert into public.drustvo_uloge (korisnik_id, uloga) values ('00000000-0000-0000-0000-0000000050a1', 'predsjednik');
insert into public.revir_vodje (revir_id, korisnik_id) values ('50000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000050a2'),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000050a3');
insert into public.lovovi (id, naziv, revir_id, sekcija_id, status, organizator_id, datum) values
  ('50000000-0000-4000-8000-0000000000b1', 'Lov50', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-0000000000a1', 'u_toku', '00000000-0000-0000-0000-0000000050ff', current_date);
insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values ('50000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-0000000050c1', 'strijelac');
insert into public.lov_pozicije (lov_id, korisnik_id, lat, lon, t) values ('50000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-0000000050c1', 44.9, 16.1, now());
insert into public.lov_tragovi (lov_id, korisnik_id, lat, lon, t) values ('50000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-0000000050c1', 44.9, 16.1, now());

set local role authenticated;
-- predsjednik: vidi lov, poziciju i trag
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000050a1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi where id = '50000000-0000-4000-8000-0000000000b1') = 1, 'predsjednik vidi lov';
  assert (select count(*) from public.lov_pozicije) = 1, 'predsjednik vidi poziciju';
  assert (select count(*) from public.lov_trag('50000000-0000-4000-8000-0000000000b1')) = 1, 'predsjednik vidi trag';
  begin insert into public.lov_pozicije (lov_id, korisnik_id, lat, lon, t) values ('50000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-0000000050a1', 1, 1, now()); raise exception 'FAIL: predsjednik piše poziciju';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
-- lovovođa tog revira vidi, lovovođa drugog revira ne
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000050a2', true); end $$;
do $$ begin assert (select count(*) from public.lov_pozicije) = 1, 'vodja revira vidi poziciju'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000050a3', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi where id = '50000000-0000-4000-8000-0000000000b1') = 0, 'tuđi revir ne vidi lov';
  assert (select count(*) from public.lov_pozicije) = 0, 'tuđi revir ne vidi poziciju';
  assert (select count(*) from public.lov_trag('50000000-0000-4000-8000-0000000000b1')) = 0, 'tuđi revir ne vidi trag';
end $$;
-- običan član druge (nepostojeće) sekcije ne vidi
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000050c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_pozicije) = 0, 'običan lovac ne vidi poziciju';
  assert (select count(*) from public.lovovi where id = '50000000-0000-4000-8000-0000000000b1') = 0, 'običan lovac ne vidi lov';
end $$;
rollback;
