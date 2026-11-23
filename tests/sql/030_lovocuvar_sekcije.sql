-- Test 030: lovočuvar revira pravi sekciju u svom reviru, postavlja grupovođu i grupovođe revira;
-- ne može u tuđem reviru ni premjestiti sekciju; grupovođa ne može sebi mijenjati grupovođu; admin premješta.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000030a1', 'admin30@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000030c1', 'lc30@t', '{"ime":"Luka","prezime":"Lovočuvar"}'),
  ('00000000-0000-0000-0000-0000000030b1', 'gv30@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000030b2', 'gv30b@t', '{"ime":"Drugi","prezime":"Grupovođa"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-000000003%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000030a1';
insert into public.revir_lovocuvari (korisnik_id, revir_id) values
  ('00000000-0000-0000-0000-0000000030c1', (select id from public.reviri where naziv = 'Krupa'));

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000030c1', true); end $$;
-- 1) nova sekcija u svom reviru, sa grupovođom
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000301', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 30', '00000000-0000-0000-0000-0000000030b1');
-- 2) ne u tuđem reviru
do $$ begin
  begin
    insert into public.sekcije (id, revir_id, naziv) values ('55555555-0000-4000-8000-000000000302', (select id from public.reviri where naziv = 'Otoka'), 'Tuđa');
    raise exception 'lovočuvar napravio sekciju u tuđem reviru';
  exception when insufficient_privilege then null;
  end;
end $$;
-- 3) mijenja grupovođu, ali ne revir
update public.sekcije set grupovodja_id = '00000000-0000-0000-0000-0000000030b2', revir_id = (select id from public.reviri where naziv = 'Otoka')
 where id = '55555555-0000-4000-8000-000000000301';
do $$ begin
  assert (select grupovodja_id = '00000000-0000-0000-0000-0000000030b2' and revir_id = (select id from public.reviri where naziv = 'Krupa')
          from public.sekcije where id = '55555555-0000-4000-8000-000000000301'), 'lovočuvar mijenja grupovođu, revir ostaje';
end $$;
-- 4) grupovođe revira: samo u svom reviru
insert into public.grupovodje (korisnik_id, revir_id) values ('00000000-0000-0000-0000-0000000030b1', (select id from public.reviri where naziv = 'Krupa'));
do $$ begin
  begin
    insert into public.grupovodje (korisnik_id, revir_id) values ('00000000-0000-0000-0000-0000000030b1', (select id from public.reviri where naziv = 'Otoka'));
    raise exception 'lovočuvar postavio grupovođu u tuđem reviru';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.grupovodje where korisnik_id = '00000000-0000-0000-0000-0000000030b1') = 1, 'vidi grupovođe svog revira';
end $$;

-- 5) grupovođa sekcije ne može sam promijeniti grupovođu (ni revir)
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000030b2', true); end $$;
update public.sekcije set grupovodja_id = '00000000-0000-0000-0000-0000000030b1', naziv = 'Preimenovana' where id = '55555555-0000-4000-8000-000000000301';
do $$ begin
  assert (select grupovodja_id = '00000000-0000-0000-0000-0000000030b2' and naziv = 'Preimenovana'
          from public.sekcije where id = '55555555-0000-4000-8000-000000000301'), 'grupovođa mijenja naziv, ne grupovođu';
end $$;

-- 6) admin premješta sekciju u drugi revir
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000030a1', true); end $$;
update public.sekcije set revir_id = (select id from public.reviri where naziv = 'Otoka') where id = '55555555-0000-4000-8000-000000000301';
do $$ begin
  assert (select revir_id = (select id from public.reviri where naziv = 'Otoka') from public.sekcije where id = '55555555-0000-4000-8000-000000000301'), 'admin premješta';
end $$;

rollback;
