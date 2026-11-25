-- Test 043: odstrel u lovu nosi lokaciju pogotka; vide je učesnici lova, ne i neučesnici; koordinate se provjeravaju.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000043a1', 'admin43@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000043c1', 'uc43@t', '{"ime":"Uroš","prezime":"Učesnik"}'),
  ('00000000-0000-0000-0000-0000000043c2', 'uc43b@t', '{"ime":"Pero","prezime":"Pogonič"}'),
  ('00000000-0000-0000-0000-0000000043d1', 'van43@t', '{"ime":"Vanja","prezime":"Van"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000043a1';
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000043%' and id::text <> '00000000-0000-0000-0000-0000000043a1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043a1', true); end $$;
do $$ begin
  insert into public.reviri (id, naziv) values ('66666666-0000-4000-8000-0000000043a1', 'Revir 43');
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id) values
    ('77777777-0000-4000-8000-000000000043', '66666666-0000-4000-8000-0000000043a1', 'Lov 43', '2026-12-05', auth.uid());
  insert into public.lov_ucesnici values
    ('77777777-0000-4000-8000-000000000043', '00000000-0000-0000-0000-0000000043c1', 'strijelac'),
    ('77777777-0000-4000-8000-000000000043', '00000000-0000-0000-0000-0000000043c2', 'pogonic');
  update public.lovovi set status = 'u_toku' where id = '77777777-0000-4000-8000-000000000043';
end $$;
reset role;

-- učesnik upisuje odstrel sa lokacijom (i bez nje: stariji klijent)
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043c1', true); end $$;
do $$ begin
  insert into public.lov_odstrel (id, lov_id, vrsta, vrijeme, tezina, lat, lon) values
    ('aaaaaaaa-0000-4000-8000-000000000431', '77777777-0000-4000-8000-000000000043', 'divlja_svinja', now(), 85.5, 44.8812, 16.1534);
  insert into public.lov_odstrel (id, lov_id, vrsta, vrijeme) values
    ('aaaaaaaa-0000-4000-8000-000000000432', '77777777-0000-4000-8000-000000000043', 'zec', now());
  begin
    insert into public.lov_odstrel (id, lov_id, vrsta, vrijeme, lat, lon) values ('aaaaaaaa-0000-4000-8000-000000000433', '77777777-0000-4000-8000-000000000043', 'lisica', now(), 95, 16);
    raise exception 'FAIL: lat izvan raspona';
  exception when check_violation then null; end;
  begin
    insert into public.lov_odstrel (id, lov_id, vrsta, vrijeme, lat) values ('aaaaaaaa-0000-4000-8000-000000000434', '77777777-0000-4000-8000-000000000043', 'lisica', now(), 44.8);
    raise exception 'FAIL: lat bez lon';
  exception when check_violation then null; end;
end $$;
reset role;

-- drugi učesnik vidi lokaciju; neučesnik ništa
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_odstrel) = 2, 'učesnik vidi odstrel';
  assert (select lat from public.lov_odstrel where vrsta = 'divlja_svinja') = 44.8812, 'lokacija pogotka';
  assert (select lon from public.lov_odstrel where vrsta = 'zec') is null, 'stariji red bez lokacije';
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000043d1', true); end $$;
do $$ begin assert (select count(*) from public.lov_odstrel) = 0, 'neučesnik ne vidi ni odstrel ni lokaciju'; end $$;
reset role;
rollback;
