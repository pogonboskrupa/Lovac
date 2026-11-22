-- Test 020: logo sekcije mijenja grupovođa (i admin), član ne; predug logo se odbija.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000020a1', 'admin20@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000020b1', 'gv20@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000020c1', 'clan20@t', '{"ime":"Clan","prezime":"Jedan"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000020a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000020b1', '00000000-0000-0000-0000-0000000020c1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000020a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000020b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000201', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000020b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values ('55555555-0000-4000-8000-000000000201', '00000000-0000-0000-0000-0000000020c1', 'odobren');
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000020b1', true); end $$;
do $$ begin
  update public.sekcije set logo = 'data:image/jpeg;base64,AAAA' where id = '55555555-0000-4000-8000-000000000201';
  begin
    update public.sekcije set logo = repeat('x', 40001) where id = '55555555-0000-4000-8000-000000000201';
    raise exception 'FAIL: predug logo';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  if (select logo from public.sekcije where id = '55555555-0000-4000-8000-000000000201') <> 'data:image/jpeg;base64,AAAA' then raise exception 'FAIL: logo nije sačuvan'; end if;
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000020c1', true); end $$;
do $$ begin
  update public.sekcije set logo = 'data:image/jpeg;base64,HAK' where id = '55555555-0000-4000-8000-000000000201';
end $$;
reset role;
do $$ begin
  if (select logo from public.sekcije where id = '55555555-0000-4000-8000-000000000201') <> 'data:image/jpeg;base64,AAAA' then raise exception 'FAIL: član promijenio logo'; end if;
end $$;

rollback;
