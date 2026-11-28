-- Test 053: lokaciju (van lova) vidi samo grupa kojoj lovac pripada; rang iznad vidi sve; promjena grupe prekida dijeljenje.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000053a1', 'lvs53@t', '{"ime":"Vođa","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000053b1', 'gv1@t53', '{"ime":"Goran","prezime":"Prvi"}'),
  ('00000000-0000-0000-0000-0000000053b2', 'gv2@t53', '{"ime":"Goran","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000053c1', 'l1@t53', '{"ime":"Lovac","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000053c2', 'l2@t53', '{"ime":"Lovac","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000053c3', 'l3@t53', '{"ime":"Lovac","prezime":"Tri"}'),
  ('00000000-0000-0000-0000-0000000053d1', 'lc53@t', '{"ime":"Luka","prezime":"Čuvar"}'),
  ('00000000-0000-0000-0000-0000000053d2', 'pr53@t', '{"ime":"Pero","prezime":"Predsjednik"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000053__';

do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        s1 uuid := '55555555-0000-4000-8000-000000000531';
        g1 uuid := '66666666-0000-4000-8000-000000000531';
        g2 uuid := '66666666-0000-4000-8000-000000000532';
begin
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values (s1, krupa, 'Sekcija 53', '00000000-0000-0000-0000-0000000053a1');
  insert into public.revir_lovocuvari (revir_id, korisnik_id) values (krupa, '00000000-0000-0000-0000-0000000053d1');
  insert into public.drustvo_uloge (korisnik_id, uloga) values ('00000000-0000-0000-0000-0000000053d2', 'predsjednik');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    (s1, '00000000-0000-0000-0000-0000000053b1', 'odobren'), (s1, '00000000-0000-0000-0000-0000000053b2', 'odobren'),
    (s1, '00000000-0000-0000-0000-0000000053c1', 'odobren'), (s1, '00000000-0000-0000-0000-0000000053c2', 'odobren'),
    (s1, '00000000-0000-0000-0000-0000000053c3', 'odobren');
  insert into public.grupe (id, sekcija_id, grupovodja_id) values (g1, s1, '00000000-0000-0000-0000-0000000053b1'), (g2, s1, '00000000-0000-0000-0000-0000000053b2');
  update public.sekcija_clanovi set grupa_id = g1 where sekcija_id = s1 and korisnik_id in ('00000000-0000-0000-0000-0000000053b1', '00000000-0000-0000-0000-0000000053c1');
  update public.sekcija_clanovi set grupa_id = g2 where sekcija_id = s1 and korisnik_id in ('00000000-0000-0000-0000-0000000053b2', '00000000-0000-0000-0000-0000000053c2');
end $$;

set local role authenticated;
-- dijele: grupovođa 1, lovac 1 (grupa 1), lovac 2 (grupa 2), lovac 3 (bez grupe), lovovođa sekcije (bez grupe)
do $$ declare u text; begin
  foreach u in array array['b1','c1','c2','c3','a1'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000053' || u, true);
    insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000531', 44.88, 16.15, now() + interval '1 hour');
  end loop;
end $$;
-- grupa se postavlja na serveru; klijent je ne može nametnuti
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000053c1', true);
  update public.sekcija_lokacije set grupa_id = '66666666-0000-4000-8000-000000000532' where korisnik_id = auth.uid();
  assert (select grupa_id from public.sekcija_lokacije where korisnik_id = auth.uid()) = '66666666-0000-4000-8000-000000000531', 'grupu postavlja server';
end $$;

-- lovac 1 vidi svoju grupu (sebe i grupovođu) i red bez grupe (lovovođa, lovac 3), ali NE grupu 2
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000053c1', true);
  assert (select count(*) from public.sekcija_lokacije where korisnik_id::text like '%53b1' or korisnik_id::text like '%53c1') = 2, 'grupa 1 vidi grupu 1';
  assert (select count(*) from public.sekcija_lokacije where korisnik_id::text like '%53b2' or korisnik_id::text like '%53c2') = 0, 'grupa 1 ne vidi grupu 2';
end $$;
-- grupovođa 2 vidi samo grupu 2
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000053b2', true);
  assert (select count(*) from public.sekcija_lokacije where korisnik_id::text like '%53c2') = 1, 'grupovođa vidi svog lovca';
  assert (select count(*) from public.sekcija_lokacije where korisnik_id::text like '%53b1' or korisnik_id::text like '%53c1') = 0, 'grupovođa ne vidi tuđu grupu';
end $$;
-- rang iznad vidi sve (5 redova): lovovođa sekcije, lovočuvar revira, predsjednik
do $$ declare u text; begin
  foreach u in array array['a1','d1','d2'] loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000053' || u, true);
    assert (select count(*) from public.sekcija_lokacije) >= 4, 'rang iznad vidi sve grupe: ' || u;
    assert (select count(*) from public.sekcija_lokacije where korisnik_id::text like '%53c2' or korisnik_id::text like '%53b1') = 2, 'vidi obje grupe: ' || u;
  end loop;
end $$;
reset role;

-- promjena grupe prekida dijeljenje
update public.sekcija_clanovi set grupa_id = '66666666-0000-4000-8000-000000000532'
  where sekcija_id = '55555555-0000-4000-8000-000000000531' and korisnik_id = '00000000-0000-0000-0000-0000000053c1';
do $$ begin assert not exists (select 1 from public.sekcija_lokacije where korisnik_id = '00000000-0000-0000-0000-0000000053c1'), 'promjena grupe briše dijeljenje'; end $$;
rollback;
