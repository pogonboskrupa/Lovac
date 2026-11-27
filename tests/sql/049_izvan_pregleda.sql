-- Test 049: izvan_pregleda — upisuje i briše samo administrator, čitaju svi odobreni, anon ništa; brisanje naloga čisti red.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000049a1', 'admin49@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000049c1', 'clan49@t', '{"ime":"Clan","prezime":"Jedan"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000049a1';
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-0000000049c1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000049a1', true); end $$;
insert into public.izvan_pregleda (korisnik_id, postavio) values ('00000000-0000-0000-0000-0000000049c1', '00000000-0000-0000-0000-0000000049a1');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000049c1', true); end $$;
do $$ begin
  assert (select count(*) from public.izvan_pregleda) = 1, 'član čita spisak';
  begin insert into public.izvan_pregleda (korisnik_id) values ('00000000-0000-0000-0000-0000000049a1'); raise exception 'FAIL: član upisuje';
  exception when insufficient_privilege then null; end;
  delete from public.izvan_pregleda;
  assert (select count(*) from public.izvan_pregleda) = 1, 'član ne briše';
end $$;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000049a1', true); end $$;
delete from public.izvan_pregleda;
do $$ begin assert (select count(*) from public.izvan_pregleda) = 0, 'admin briše'; end $$;
rollback;
