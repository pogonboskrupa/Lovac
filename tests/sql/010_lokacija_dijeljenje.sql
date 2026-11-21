-- Test 010: vlastitu poziciju može obrisati samo vlasnik, tuđu ne.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000010a1', 'admin10@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000010c1', 'uc10@t', '{"ime":"Uroš","prezime":"Učesnik"}'),
  ('00000000-0000-0000-0000-0000000010c2', 'uc10b@t', '{"ime":"Pero","prezime":"Pogonič"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000010a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000010c1', '00000000-0000-0000-0000-0000000010c2');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000010a1', true); end $$;
do $$ begin
  insert into public.reviri (id, naziv) values ('66666666-0000-4000-8000-0000000010a1', 'Revir 10');
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id, status) values
    ('77777777-0000-4000-8000-000000000010', '66666666-0000-4000-8000-0000000010a1', 'Lov 10', '2026-12-05', auth.uid(), 'u_toku');
  insert into public.lov_ucesnici values
    ('77777777-0000-4000-8000-000000000010', '00000000-0000-0000-0000-0000000010c1', 'strijelac'),
    ('77777777-0000-4000-8000-000000000010', '00000000-0000-0000-0000-0000000010c2', 'pogonic');
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000010c1', true); end $$;
do $$ begin
  insert into public.lov_pozicije (lov_id, lat, lon) values ('77777777-0000-4000-8000-000000000010', 44.88, 16.15);
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000010c2', true); end $$;
do $$ declare n int; begin
  insert into public.lov_pozicije (lov_id, lat, lon) values ('77777777-0000-4000-8000-000000000010', 44.89, 16.16);
  -- tuđu poziciju ne mogu obrisati
  delete from public.lov_pozicije where korisnik_id = '00000000-0000-0000-0000-0000000010c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: obrisana tuđa pozicija'; end if;
  -- svoju mogu
  delete from public.lov_pozicije where korisnik_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: vlastita pozicija nije obrisana'; end if;
end $$;
reset role;

rollback;
