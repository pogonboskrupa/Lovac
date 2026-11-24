-- Test 034: član sekcije odgovara "Da"/"Ne" na lov svoje sekcije; tuđi lov, završen lov i lažni korisnik_id ne prolaze;
-- grupovođa vidi odgovore; član druge sekcije ne vidi; brisanje lova briše odazive.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000034b1', 'gv34@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000034c1', 'clan34@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000034c2', 'clan34b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000034d1', 'tudji34@t', '{"ime":"Tudji","prezime":"Lovac"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000034%';
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000341', (select id from public.reviri where naziv = 'Krupa'), 'S34', '00000000-0000-0000-0000-0000000034b1'),
  ('55555555-0000-4000-8000-000000000342', (select id from public.reviri where naziv = 'Krupa'), 'S34b', null);
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
  ('55555555-0000-4000-8000-000000000341', '00000000-0000-0000-0000-0000000034c1', 'odobren'),
  ('55555555-0000-4000-8000-000000000341', '00000000-0000-0000-0000-0000000034c2', 'odobren'),
  ('55555555-0000-4000-8000-000000000342', '00000000-0000-0000-0000-0000000034d1', 'odobren');
insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, status, organizator_id) values
  ('77777777-0000-4000-8000-000000000341', (select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000341', 'L34', current_date + 1, 'planiran', '00000000-0000-0000-0000-0000000034b1'),
  ('77777777-0000-4000-8000-000000000342', (select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000341', 'Stari', current_date - 3, 'zavrsen', '00000000-0000-0000-0000-0000000034b1');

set local role authenticated;
-- član 1: "Da" (i lažni korisnik_id se zamijeni pravim)
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000034c1', true); end $$;
insert into public.lov_odazivi (lov_id, korisnik_id, odgovor)
  values ('77777777-0000-4000-8000-000000000341', '00000000-0000-0000-0000-0000000034c2', 'da');
do $$ begin
  assert (select korisnik_id from public.lov_odazivi where lov_id = '77777777-0000-4000-8000-000000000341')
    = '00000000-0000-0000-0000-0000000034c1', 'korisnik_id postavlja server';
end $$;
-- promjena odgovora (upsert)
insert into public.lov_odazivi (lov_id, odgovor) values ('77777777-0000-4000-8000-000000000341', 'ne')
  on conflict (lov_id, korisnik_id) do update set odgovor = excluded.odgovor;
do $$ begin
  assert (select odgovor from public.lov_odazivi where korisnik_id = '00000000-0000-0000-0000-0000000034c1') = 'ne', 'promjena odgovora';
end $$;
-- završen lov: ne
do $$ begin
  begin insert into public.lov_odazivi (lov_id, odgovor) values ('77777777-0000-4000-8000-000000000342', 'da');
    raise exception 'odaziv na završen lov';
  exception when insufficient_privilege then null; end;
end $$;
-- član 2: "Da"
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000034c2', true); end $$;
insert into public.lov_odazivi (lov_id, odgovor) values ('77777777-0000-4000-8000-000000000341', 'da');
-- član druge sekcije: ne može odgovoriti i ne vidi odgovore
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000034d1', true); end $$;
do $$ begin
  begin insert into public.lov_odazivi (lov_id, odgovor) values ('77777777-0000-4000-8000-000000000341', 'da');
    raise exception 'tuđi lov';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.lov_odazivi) = 0, 'tuđa sekcija ne vidi odgovore';
end $$;
-- grupovođa vidi oba odgovora
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000034b1', true); end $$;
do $$ begin
  assert (select count(*) from public.lov_odazivi where lov_id = '77777777-0000-4000-8000-000000000341') = 2, 'grupovođa vidi';
end $$;
-- član 2 ne može mijenjati tuđi odgovor
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000034c2', true); end $$;
update public.lov_odazivi set odgovor = 'da' where korisnik_id = '00000000-0000-0000-0000-0000000034c1';
reset role;
do $$ begin
  assert (select odgovor from public.lov_odazivi where korisnik_id = '00000000-0000-0000-0000-0000000034c1') = 'ne', 'tuđi odgovor nepromijenjen';
end $$;
delete from public.lovovi where id = '77777777-0000-4000-8000-000000000341';
do $$ begin assert (select count(*) from public.lov_odazivi) = 0, 'brisanje lova briše odazive'; end $$;

rollback;
