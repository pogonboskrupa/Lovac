-- Test 052: sekciju prave admin, predsjednik, lovovođa udruženja, lovovođa i lovočuvar svog revira; običan član i vodstvo tuđeg revira ne.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000052a1', 'pred52@t', '{"ime":"Pred","prezime":"Sjednik"}'),
  ('00000000-0000-0000-0000-0000000052a2', 'ldd52@t', '{"ime":"Lov","prezime":"Vodja"}'),
  ('00000000-0000-0000-0000-0000000052a3', 'rv52@t', '{"ime":"Revir","prezime":"Vodja"}'),
  ('00000000-0000-0000-0000-0000000052a4', 'rvtudj52@t', '{"ime":"Tudj","prezime":"Revir"}'),
  ('00000000-0000-0000-0000-0000000052c1', 'clan52@t', '{"ime":"Clan","prezime":"Obican"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000052%';
insert into public.reviri (id, naziv) values ('52000000-0000-4000-8000-000000000001', 'R52a'), ('52000000-0000-4000-8000-000000000002', 'R52b');
insert into public.drustvo_uloge (korisnik_id, uloga) values ('00000000-0000-0000-0000-0000000052a1', 'predsjednik'), ('00000000-0000-0000-0000-0000000052a2', 'lovovodja_drustva');
insert into public.revir_vodje (revir_id, korisnik_id) values ('52000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000052a3'), ('52000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000052a4');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000052a1', true); end $$;
insert into public.sekcije (revir_id, naziv) values ('52000000-0000-4000-8000-000000000001', 'S-pred');
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000052a2', true); end $$;
insert into public.sekcije (revir_id, naziv) values ('52000000-0000-4000-8000-000000000002', 'S-ldd');
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000052a3', true); end $$;
insert into public.sekcije (revir_id, naziv) values ('52000000-0000-4000-8000-000000000001', 'S-rv');
do $$ begin
  begin insert into public.sekcije (revir_id, naziv) values ('52000000-0000-4000-8000-000000000002', 'S-tudj'); raise exception 'FAIL: vodja tuđeg revira';
  exception when insufficient_privilege then null; end;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000052c1', true); end $$;
do $$ begin
  begin insert into public.sekcije (revir_id, naziv) values ('52000000-0000-4000-8000-000000000001', 'S-clan'); raise exception 'FAIL: običan član pravi sekciju';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert (select count(*) from public.sekcije where naziv in ('S-pred', 'S-ldd', 'S-rv')) = 3, 'tri sekcije napravljene'; end $$;
rollback;
