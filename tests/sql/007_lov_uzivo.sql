-- Test 007: pozicije/SOS samo učesnicima i samo dok lov traje; odstrel u lovu.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a1', 'admin7@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000007c1', 'uc7@t', '{"ime":"Uroš","prezime":"Učesnik"}'),
  ('00000000-0000-0000-0000-0000000007c2', 'uc7b@t', '{"ime":"Pero","prezime":"Pogonič"}'),
  ('00000000-0000-0000-0000-0000000007d1', 'van7@t', '{"ime":"Vanja","prezime":"Van"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000007a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000007c1', '00000000-0000-0000-0000-0000000007c2', '00000000-0000-0000-0000-0000000007d1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007a1', true); end $$;
do $$ begin
  insert into public.reviri (id, naziv) values ('66666666-0000-4000-8000-0000000007a1', 'Revir 7');
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id) values
    ('77777777-0000-4000-8000-000000000007', '66666666-0000-4000-8000-0000000007a1', 'Lov 7', '2026-12-05', auth.uid());
  insert into public.lov_ucesnici values
    ('77777777-0000-4000-8000-000000000007', '00000000-0000-0000-0000-0000000007c1', 'strijelac'),
    ('77777777-0000-4000-8000-000000000007', '00000000-0000-0000-0000-0000000007c2', 'pogonic');
end $$;
reset role;

-- Prije početka lova: pozicija i SOS se ne primaju.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007c1', true); end $$;
do $$ begin
  begin
    insert into public.lov_pozicije (lov_id, lat, lon) values ('77777777-0000-4000-8000-000000000007', 44.88, 16.15);
    raise exception 'FAIL: pozicija prije početka lova';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sos (id, lov_id, lat, lon) values ('99999999-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000007', 1, 1);
    raise exception 'FAIL: SOS u lov koji nije počeo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007a1', true); end $$;
do $$ begin update public.lovovi set status = 'u_toku' where id = '77777777-0000-4000-8000-000000000007'; end $$;
reset role;

-- Lov u toku: učesnici dijele pozicije i šalju SOS.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007c1', true); end $$;
do $$ begin
  insert into public.lov_pozicije (lov_id, lat, lon) values ('77777777-0000-4000-8000-000000000007', 44.88, 16.15);
  insert into public.lov_pozicije (lov_id, lat, lon) values ('77777777-0000-4000-8000-000000000007', 44.881, 16.151)
    on conflict (lov_id, korisnik_id) do update set lat = excluded.lat, lon = excluded.lon, t = now();
  begin
    insert into public.lov_pozicije (lov_id, korisnik_id, lat, lon) values ('77777777-0000-4000-8000-000000000007', '00000000-0000-0000-0000-0000000007c2', 1, 1);
    raise exception 'FAIL: pozicija u tuđe ime';
  exception when insufficient_privilege then null;
  end;
  insert into public.sos (id, lov_id, lat, lon, poruka) values ('99999999-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000007', 44.88, 16.15, 'SOS');
  insert into public.lov_odstrel (id, lov_id, vrsta, kategorija, vrijeme, tezina, stan_broj) values
    ('aaaaaaaa-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000007', 'divlja_svinja', 'vepar', now(), 85.5, 1);
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_pozicije) = 1, 'pogonič vidi poziciju strijelca';
  assert (select lat from public.lov_pozicije) = 44.881, 'pozicija se ažurira (upsert)';
  assert (select count(*) from public.sos) = 1, 'pogonič vidi SOS';
  assert (select count(*) from public.lov_odstrel) = 1, 'učesnik vidi odstrel lova';
  delete from public.lov_odstrel;
  assert (select count(*) from public.lov_odstrel) = 1, 'tuđi odstrel u lovu se ne briše';
end $$;
reset role;

-- Lovac koji nije u lovu ne vidi ništa.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007d1', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_pozicije) = 0, 'neučesnik ne vidi pozicije';
  assert (select count(*) from public.sos) = 0, 'neučesnik ne vidi SOS';
  assert (select count(*) from public.lov_odstrel) = 0, 'neučesnik ne vidi odstrel lova';
  begin
    insert into public.lov_odstrel (id, lov_id, vrsta, vrijeme) values ('aaaaaaaa-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000007', 'zec', now());
    raise exception 'FAIL: neučesnik upisao odstrel u lov';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Kraj lova: pozicije više nisu vidljive ni upisive (praćenje traje samo dok traje lov).
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007a1', true); end $$;
do $$ begin update public.lovovi set status = 'zavrsen' where id = '77777777-0000-4000-8000-000000000007'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_pozicije) = 0, 'poslije kraja lova pozicije nisu vidljive';
  assert (select count(*) from public.sos) = 1, 'SOS ostaje u historiji lova';
end $$;
reset role;

rollback;
