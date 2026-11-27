-- Test 046: poruke grupe vide i pišu samo članovi te grupe, lovovođa sekcije i lovočuvar; druga grupa i
-- član druge sekcije ne; poruke grupe ne ulaze u kanal sekcije.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000046a1', 'lvs46@t', '{"ime":"Vođa","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000046b1', 'gv1@t', '{"ime":"Goran","prezime":"Prvi"}'),
  ('00000000-0000-0000-0000-0000000046b2', 'gv2@t', '{"ime":"Goran","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000046c1', 'l1@t', '{"ime":"Lovac","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000046c2', 'l2@t', '{"ime":"Lovac","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000046c3', 'l3@t', '{"ime":"Lovac","prezime":"Tri"}'),
  ('00000000-0000-0000-0000-0000000046d1', 'lc46@t', '{"ime":"Luka","prezime":"Čuvar"}'),
  ('00000000-0000-0000-0000-0000000046e1', 'van@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000046__';

do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
        s1 uuid := '55555555-0000-4000-8000-000000000461';
        s2 uuid := '55555555-0000-4000-8000-000000000462';
        g1 uuid := '66666666-0000-4000-8000-000000000461';
        g2 uuid := '66666666-0000-4000-8000-000000000462';
begin
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values (s1, krupa, 'Sekcija 46', '00000000-0000-0000-0000-0000000046a1');
  insert into public.sekcije (id, revir_id, naziv) values (s2, otoka, 'Druga 46');
  insert into public.revir_lovocuvari (revir_id, korisnik_id) values (krupa, '00000000-0000-0000-0000-0000000046d1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    (s1, '00000000-0000-0000-0000-0000000046b1', 'odobren'), (s1, '00000000-0000-0000-0000-0000000046b2', 'odobren'),
    (s1, '00000000-0000-0000-0000-0000000046c1', 'odobren'), (s1, '00000000-0000-0000-0000-0000000046c2', 'odobren'),
    (s1, '00000000-0000-0000-0000-0000000046c3', 'odobren'), (s2, '00000000-0000-0000-0000-0000000046e1', 'odobren');
  insert into public.grupe (id, sekcija_id, grupovodja_id) values
    (g1, s1, '00000000-0000-0000-0000-0000000046b1'), (g2, s1, '00000000-0000-0000-0000-0000000046b2');
  update public.sekcija_clanovi set grupa_id = g1 where korisnik_id in ('00000000-0000-0000-0000-0000000046b1', '00000000-0000-0000-0000-0000000046c1', '00000000-0000-0000-0000-0000000046c2');
  update public.sekcija_clanovi set grupa_id = g2 where korisnik_id in ('00000000-0000-0000-0000-0000000046b2', '00000000-0000-0000-0000-0000000046c3');
end $$;

-- član grupe 1 piše; tuđe autorstvo i pogrešan oblik padaju
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046c1', true); end $$;
do $$ begin
  insert into public.poruke (kanal, grupa_id, autor_id, tekst) values ('grupa', '66666666-0000-4000-8000-000000000461', '00000000-0000-0000-0000-0000000046c1', 'Sutra u 6');
  begin
    insert into public.poruke (kanal, grupa_id, autor_id, tekst) values ('grupa', '66666666-0000-4000-8000-000000000461', '00000000-0000-0000-0000-0000000046c2', 'u tuđe ime');
    raise exception 'FAIL: tuđe autorstvo';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.poruke (kanal, grupa_id, autor_id, tekst) values ('grupa', '66666666-0000-4000-8000-000000000462', '00000000-0000-0000-0000-0000000046c1', 'u tuđu grupu');
    raise exception 'FAIL: pisanje u drugu grupu';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.poruke (kanal, sekcija_id, grupa_id, autor_id, tekst) values ('grupa', '55555555-0000-4000-8000-000000000461', '66666666-0000-4000-8000-000000000461', '00000000-0000-0000-0000-0000000046c1', 'sa sekcijom');
    raise exception 'FAIL: kanal grupe sa sekcijom';
  exception when insufficient_privilege or check_violation then null; end;
  assert (select count(*) from public.poruke where kanal = 'grupa') = 1, 'član grupe vidi poruku svoje grupe';
end $$;
reset role;

-- kolega iz iste grupe i grupovođa vide, druga grupa ne
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046c2', true); end $$;
do $$ begin assert (select count(*) from public.poruke where kanal = 'grupa') = 1, 'kolega iz grupe vidi'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046b1', true); end $$;
do $$ begin assert (select count(*) from public.poruke where kanal = 'grupa') = 1, 'grupovođa grupe vidi'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046c3', true); end $$;
do $$ begin assert (select count(*) from public.poruke where kanal = 'grupa') = 0, 'druga grupa ne vidi'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046e1', true); end $$;
do $$ begin assert (select count(*) from public.poruke where kanal = 'grupa') = 0, 'član druge sekcije ne vidi'; end $$;
reset role;

-- lovovođa sekcije i lovočuvar revira vide i pišu
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046a1', true); end $$;
do $$ begin
  assert (select count(*) from public.poruke where kanal = 'grupa') = 1, 'lovovođa sekcije vidi';
  insert into public.poruke (kanal, grupa_id, autor_id, tekst) values ('grupa', '66666666-0000-4000-8000-000000000461', '00000000-0000-0000-0000-0000000046a1', 'Od lovovođe');
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046d1', true); end $$;
do $$ begin assert (select count(*) from public.poruke where kanal = 'grupa') = 2, 'lovočuvar revira vidi'; end $$;
reset role;

-- poruke grupe ne ulaze u kanal sekcije
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000046c1', true); end $$;
do $$ begin assert (select count(*) from public.poruke where sekcija_id = '55555555-0000-4000-8000-000000000461') = 0, 'kanal sekcije je odvojen'; end $$;
reset role;

rollback;
