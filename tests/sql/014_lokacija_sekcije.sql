-- Test 014: lokaciju sekcije vide samo članovi/grupovođa/lovočuvar dok dijeljenje traje; admin van sekcije i vanjski ne.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000014a1', 'admin14@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000014b1', 'gv14@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000014c1', 'clan14@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000014c2', 'clan14b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000014c3', 'ceka14@t', '{"ime":"Clan","prezime":"Ceka"}'),
  ('00000000-0000-0000-0000-0000000014d1', 'lc14@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000014d2', 'van14@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000014a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014c2',
  '00000000-0000-0000-0000-0000000014c3', '00000000-0000-0000-0000-0000000014d1', '00000000-0000-0000-0000-0000000014d2');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000014d1');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000014b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000141', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000014b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000141', '00000000-0000-0000-0000-0000000014c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000141', '00000000-0000-0000-0000-0000000014c2', 'odobren'),
    ('55555555-0000-4000-8000-000000000141', '00000000-0000-0000-0000-0000000014c3', 'ceka');
end $$;
reset role;

-- Član dijeli (1 sat); ne smije u tuđe ime, bez članstva, sa čekanjem, ni duže od 24 h.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014c1', true); end $$;
do $$ begin
  insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000141', 44.88, 16.15, now() + interval '1 hour');
  begin
    insert into public.sekcija_lokacije (sekcija_id, korisnik_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000141', '00000000-0000-0000-0000-0000000014c2', 44.88, 16.15, now() + interval '1 hour');
    raise exception 'FAIL: dijeljenje u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    update public.sekcija_lokacije set do_ = now() + interval '3 days';
    raise exception 'FAIL: produženje preko 24 h';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014c3', true); end $$;
do $$ begin
  begin
    insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000141', 44.88, 16.15, now() + interval '1 hour');
    raise exception 'FAIL: dijeli neodobren član';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014d2', true); end $$;
do $$ declare n int; begin
  begin
    insert into public.sekcija_lokacije (sekcija_id, lat, lon, do_) values ('55555555-0000-4000-8000-000000000141', 44.88, 16.15, now() + interval '1 hour');
    raise exception 'FAIL: vanjski korisnik dijeli';
  exception when insufficient_privilege then null; end;
  select count(*) into n from public.sekcija_lokacije;
  if n <> 0 then raise exception 'FAIL: vanjski korisnik vidi lokaciju'; end if;
end $$;
reset role;

-- Gledaju: drugi član, grupovođa, lovočuvar; ne: administrator, neodobren član.
do $$
declare uid text; n int;
begin
  foreach uid in array array['00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014d1'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    set local role authenticated;
    select count(*) into n from public.sekcija_lokacije;
    reset role;
    if n <> 1 then raise exception 'FAIL: % vidi % lokacija (očekivano 1)', uid, n; end if;
  end loop;
  foreach uid in array array['00000000-0000-0000-0000-0000000014a1', '00000000-0000-0000-0000-0000000014c3'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    set local role authenticated;
    select count(*) into n from public.sekcija_lokacije;
    reset role;
    if n <> 0 then raise exception 'FAIL: % ne bi smio vidjeti lokaciju (vidi %)', uid, n; end if;
  end loop;
end $$;

-- Istekla lokacija se više ne vidi; vlasnik je može obrisati, tuđu ne.
update public.sekcija_lokacije set do_ = now() - interval '1 minute';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014c2', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.sekcija_lokacije;
  if n <> 0 then raise exception 'FAIL: istekla lokacija je vidljiva'; end if;
end $$;
reset role;
update public.sekcija_lokacije set do_ = now() + interval '1 hour';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014c2', true); end $$;
do $$ declare n int; begin
  delete from public.sekcija_lokacije;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: obrisana tuđa lokacija'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000014c1', true); end $$;
do $$ declare n int; begin
  delete from public.sekcija_lokacije;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: vlasnik nije obrisao svoju lokaciju'; end if;
end $$;
reset role;

rollback;
