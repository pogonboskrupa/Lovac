-- Test 017: vrijeme lova, trag kretanja, slike lova i rezultat (arhiva).
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000017a1', 'admin17@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000017b1', 'gv17@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000017c1', 'uc17@t', '{"ime":"Uroš","prezime":"Učesnik"}'),
  ('00000000-0000-0000-0000-0000000017c2', 'clan17@t', '{"ime":"Clan","prezime":"Nije u lovu"}'),
  ('00000000-0000-0000-0000-0000000017d1', 'van17@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000017a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000017b1', '00000000-0000-0000-0000-0000000017c1', '00000000-0000-0000-0000-0000000017c2', '00000000-0000-0000-0000-0000000017d1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000017b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000171', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000017b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000171', '00000000-0000-0000-0000-0000000017c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000171', '00000000-0000-0000-0000-0000000017c2', 'odobren');
end $$;
reset role;

-- Grupovođa pravi lov, dodaje učesnika i pokreće lov: server upisuje početak.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017b1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id, sekcija_id) values
    ('77777777-0000-4000-8000-000000000171', krupa, 'Lov arhiva', current_date, auth.uid(), '55555555-0000-4000-8000-000000000171');
  insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values ('77777777-0000-4000-8000-000000000171', '00000000-0000-0000-0000-0000000017c1', 'strijelac');
  update public.lovovi set status = 'u_toku' where id = '77777777-0000-4000-8000-000000000171';
end $$;
reset role;
do $$ begin
  if (select pocetak from public.lovovi where id = '77777777-0000-4000-8000-000000000171') is null then raise exception 'FAIL: nema početka'; end if;
  if (select kraj from public.lovovi where id = '77777777-0000-4000-8000-000000000171') is not null then raise exception 'FAIL: kraj prije završetka'; end if;
end $$;

-- Trag kretanja: učesnik šalje svoje tačke dok lov traje; neučesnik i tuđe ime ne.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017c1', true); end $$;
do $$ begin
  insert into public.lov_tragovi (lov_id, t, lat, lon) values
    ('77777777-0000-4000-8000-000000000171', now() - interval '2 minutes', 44.880, 16.150),
    ('77777777-0000-4000-8000-000000000171', now() - interval '1 minute', 44.881, 16.151);
  begin
    insert into public.lov_tragovi (lov_id, korisnik_id, t, lat, lon) values ('77777777-0000-4000-8000-000000000171', '00000000-0000-0000-0000-0000000017b1', now(), 44.9, 16.2);
    raise exception 'FAIL: trag u tuđe ime';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017c2', true); end $$;
do $$ declare n int; begin
  begin
    insert into public.lov_tragovi (lov_id, t, lat, lon) values ('77777777-0000-4000-8000-000000000171', now(), 44.9, 16.2);
    raise exception 'FAIL: član koji nije u lovu šalje trag';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.lov_tragovi;  -- vidi_lov: član sekcije vidi trag lova svoje sekcije
  if n <> 2 then raise exception 'FAIL: član sekcije vidi % tačaka (očekivano 2)', n; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017d1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.lov_tragovi;
  if n <> 0 then raise exception 'FAIL: vanjski korisnik vidi trag'; end if;
end $$;
reset role;

-- Kraj lova upisuje server; poslije kraja nove tačke traga se ne primaju, ali slike i dalje mogu.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017b1', true); end $$;
do $$ begin
  update public.lovovi set status = 'zavrsen', rezultat = '2 divlje svinje, 1 lisica' where id = '77777777-0000-4000-8000-000000000171';
end $$;
reset role;
do $$ begin
  if (select kraj from public.lovovi where id = '77777777-0000-4000-8000-000000000171') is null then raise exception 'FAIL: nema kraja'; end if;
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017c1', true); end $$;
do $$ begin
  begin
    insert into public.lov_tragovi (lov_id, t, lat, lon) values ('77777777-0000-4000-8000-000000000171', now(), 44.9, 16.2);
    raise exception 'FAIL: trag poslije kraja lova';
  exception when insufficient_privilege then null; end;
  -- slika učesnika poslije kraja lova: sličica pa velika slika
  insert into public.lov_slike (id, lov_id, mala, opis) values ('dddddddd-0000-4000-8000-000000000171', '77777777-0000-4000-8000-000000000171', 'data:image/jpeg;base64,AAAA', 'Ulov');
  insert into public.lov_slike_podaci (id, slika) values ('dddddddd-0000-4000-8000-000000000171', 'data:image/jpeg;base64,BBBBBBBB');
  update public.lovovi set rezultat = 'prepravljeno';  -- RLS: nema vidljivih redova za izmjenu
end $$;
reset role;
do $$ begin
  if (select rezultat from public.lovovi where id = '77777777-0000-4000-8000-000000000171') <> '2 divlje svinje, 1 lisica' then raise exception 'FAIL: rezultat promijenjen'; end if;
end $$;

-- Slike: neučesnik (član koji nije u lovu) ne može dodati; vidi je član sekcije; vanjski ne; podaci samo uz sličicu autora.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017c2', true); end $$;
do $$ declare n int; begin
  begin
    insert into public.lov_slike (id, lov_id, mala) values ('dddddddd-0000-4000-8000-000000000172', '77777777-0000-4000-8000-000000000171', 'x');
    raise exception 'FAIL: slika neučesnika';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.lov_slike_podaci;
  if n <> 1 then raise exception 'FAIL: član sekcije ne vidi veliku sliku'; end if;
  begin
    insert into public.lov_slike_podaci (id, slika) values ('dddddddd-0000-4000-8000-000000000171', 'drugi');
    raise exception 'FAIL: tuđa velika slika';
  exception when insufficient_privilege or unique_violation then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017d1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.lov_slike;
  if n <> 0 then raise exception 'FAIL: vanjski korisnik vidi slike'; end if;
  select count(*) into n from public.lov_slike_podaci;
  if n <> 0 then raise exception 'FAIL: vanjski korisnik vidi velike slike'; end if;
end $$;
reset role;

-- Grupovođa dodaje svoju sliku i briše tuđu; učesnik ne briše tuđu.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017b1', true); end $$;
do $$ declare n int; begin
  insert into public.lov_slike (id, lov_id, mala) values ('dddddddd-0000-4000-8000-000000000173', '77777777-0000-4000-8000-000000000171', 'g');
  delete from public.lov_slike where id = 'dddddddd-0000-4000-8000-000000000171';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: grupovođa nije obrisao sliku'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000017c1', true); end $$;
do $$ declare n int; begin
  delete from public.lov_slike where id = 'dddddddd-0000-4000-8000-000000000173';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: učesnik obrisao tuđu sliku'; end if;
end $$;
reset role;

rollback;
