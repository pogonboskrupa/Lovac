-- Test 051: promjena imena — sam korisnik svoje, admin tuđe; običan korisnik tuđe ne; direktan update tabele zabranjen;
-- email za prijavu se mijenja zajedno sa imenom; zauzet email se odbija.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000051a1', 'ado.admin@lovci.grmec.app', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000051c1', 'pero.peric@lovci.grmec.app', '{"ime":"Pero","prezime":"Peric"}'),
  ('00000000-0000-0000-0000-0000000051c2', 'mate.matic@lovci.grmec.app', '{"ime":"Mate","prezime":"Matic"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000051%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000051a1';
insert into auth.identities (id, user_id, provider_id, identity_data, provider)
  select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email' from auth.users where id::text like '00000000-0000-0000-0000-0000000051%'
  and not exists (select 1 from auth.identities i where i.user_id = auth.users.id);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000051c1', true); end $$;
do $$ begin
  perform public.promijeni_ime('00000000-0000-0000-0000-0000000051c1', 'Petar', 'Perić', 'petar.peric@lovci.grmec.app');
  assert (select ime from public.korisnici where id = '00000000-0000-0000-0000-0000000051c1') = 'Petar', 'sam mijenja svoje ime';
  begin perform public.promijeni_ime('00000000-0000-0000-0000-0000000051c2', 'Tudj', 'Ime', 'tudj.ime@lovci.grmec.app'); raise exception 'FAIL: tuđe ime';
  exception when insufficient_privilege then null; end;
  begin update public.korisnici set ime = 'Direktno' where id = '00000000-0000-0000-0000-0000000051c1'; raise exception 'FAIL: direktan update';
  exception when insufficient_privilege then null; end;
  begin perform public.promijeni_ime('00000000-0000-0000-0000-0000000051c1', 'Mate', 'Matic', 'mate.matic@lovci.grmec.app'); raise exception 'FAIL: zauzet email';
  exception when unique_violation then null; end;
  begin perform public.promijeni_ime('00000000-0000-0000-0000-0000000051c1', '', 'X', 'x.x@lovci.grmec.app'); raise exception 'FAIL: prazno ime';
  exception when invalid_parameter_value then null; end;
  begin perform public.promijeni_ime('00000000-0000-0000-0000-0000000051c1', 'A', 'B', 'a.b@gmail.com'); raise exception 'FAIL: domena';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  assert (select email from auth.users where id = '00000000-0000-0000-0000-0000000051c1') = 'petar.peric@lovci.grmec.app', 'email prati ime';
  assert (select identity_data->>'email' from auth.identities where user_id = '00000000-0000-0000-0000-0000000051c1') = 'petar.peric@lovci.grmec.app', 'identitet prati ime';
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000051a1', true); end $$;
do $$ begin
  perform public.promijeni_ime('00000000-0000-0000-0000-0000000051c2', 'Matej', 'Matić', 'matej.matic@lovci.grmec.app');
  assert (select prezime from public.korisnici where id = '00000000-0000-0000-0000-0000000051c2') = 'Matić', 'admin mijenja tuđe ime';
end $$;
reset role;
do $$ begin
  assert (select email from auth.users where id = '00000000-0000-0000-0000-0000000051c2') = 'matej.matic@lovci.grmec.app', 'admin: email prati ime';
end $$;
rollback;
