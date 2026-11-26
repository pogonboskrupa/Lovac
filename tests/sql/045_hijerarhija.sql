-- Test 045: lovočuvari (najviše 2) i lovovođa društva (1) postavlja samo admin; jedan lovovođa po reviru;
-- grupe i grupa_id u sekcija_clanovi; nove uloge ulaze u rukovodstvo i lovočuvarske provjere.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000045a1', 'admin45@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000045b1', 'lc1@t', '{"ime":"Luka","prezime":"Prvi"}'),
  ('00000000-0000-0000-0000-0000000045b2', 'lc2@t', '{"ime":"Luka","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000045b3', 'lc3@t', '{"ime":"Luka","prezime":"Treci"}'),
  ('00000000-0000-0000-0000-0000000045c1', 'ldd@t', '{"ime":"Vođa","prezime":"Društva"}'),
  ('00000000-0000-0000-0000-0000000045c2', 'ldr@t', '{"ime":"Vođa","prezime":"Revira"}'),
  ('00000000-0000-0000-0000-0000000045c3', 'ldr2@t', '{"ime":"Vođa","prezime":"Revira2"}'),
  ('00000000-0000-0000-0000-0000000045d1', 'lvs@t', '{"ime":"Vođa","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000045d2', 'gv@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000045e1', 'clan@t', '{"ime":"Clan","prezime":"Jedan"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-000000004%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000045a1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.drustvo_uloge values ('00000000-0000-0000-0000-0000000045b1', 'lovocuvar'), ('00000000-0000-0000-0000-0000000045b2', 'lovocuvar');
  -- treći lovočuvar ne ide
  begin
    insert into public.drustvo_uloge values ('00000000-0000-0000-0000-0000000045b3', 'lovocuvar');
    raise exception 'FAIL: treći lovočuvar';
  exception when check_violation then null; end;
  insert into public.drustvo_uloge values ('00000000-0000-0000-0000-0000000045c1', 'lovovodja_drustva');
  begin
    insert into public.drustvo_uloge values ('00000000-0000-0000-0000-0000000045c2', 'lovovodja_drustva');
    raise exception 'FAIL: drugi lovovođa društva';
  exception when check_violation then null; end;
  -- jedan lovovođa po reviru
  insert into public.revir_vodje values (krupa, '00000000-0000-0000-0000-0000000045c2');
  begin
    insert into public.revir_vodje values (krupa, '00000000-0000-0000-0000-0000000045c3');
    raise exception 'FAIL: drugi lovovođa revira';
  exception when check_violation then null; end;
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000451', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000045d1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045d2', 'odobren'),
    ('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1', 'odobren');
end $$;
reset role;

-- obični član ne postavlja uloge društva
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045e1', true); end $$;
do $$ begin
  begin
    insert into public.drustvo_uloge values ('00000000-0000-0000-0000-0000000045e1', 'lovovodja_drustva');
    raise exception 'FAIL: član se postavio';
  exception when insufficient_privilege or check_violation then null; end;
  delete from public.drustvo_uloge; -- RLS: nijedan red nije njegov za brisanje
  assert (select count(*) from public.drustvo_uloge) = 3, 'uloge društva vidi svako i član ih ne briše';
end $$;
reset role;

-- lovočuvar društva vidi kroz provjere svaki revir; lovovođa društva ne
do $$ declare krupa uuid := (select id from public.reviri where naziv = 'Krupa'); otoka uuid := (select id from public.reviri where naziv = 'Otoka'); begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045b1', true);
  set local role authenticated;
  assert public.je_lovocuvar_revira(krupa) and public.je_lovocuvar_revira(otoka), 'lovočuvar društva: svi reviri';
  assert public.je_rukovodstvo(), 'lovočuvar je rukovodstvo';
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045c1', true);
  set local role authenticated;
  assert not public.je_lovocuvar_revira(krupa), 'lovovođa društva nije lovočuvar';
  assert public.je_lovovodja_revira(otoka) and public.je_lovovodja_drustva() and public.je_rukovodstvo(), 'lovovođa društva: lanac';
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045c2', true);
  set local role authenticated;
  assert public.je_lovovodja_revira(krupa) and not public.je_lovovodja_revira(otoka), 'lovovođa revira samo svoj revir';
  assert public.je_rukovodstvo(), 'lovovođa revira je rukovodstvo';
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045e1', true);
  set local role authenticated;
  assert not public.je_rukovodstvo() and not public.je_lovocuvar_revira(krupa) and not public.je_lovovodja_revira(krupa), 'član nije ništa';
  reset role;
end $$;

-- lovovođa sekcije pravi grupu (grupovođa), raspoređuje lovca; grupa druge sekcije se odbija; član ne pravi grupe
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045d1', true); end $$;
insert into public.grupe (id, sekcija_id, grupovodja_id) values ('77777777-0000-4000-8000-000000000451', '55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045d2');
reset role;
update public.sekcija_clanovi set grupa_id = '77777777-0000-4000-8000-000000000451' where korisnik_id = '00000000-0000-0000-0000-0000000045e1';
do $$ begin
  assert (select grupa_id from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000045e1') = '77777777-0000-4000-8000-000000000451', 'lovac u grupi';
  insert into public.sekcije (id, revir_id, naziv) values ('55555555-0000-4000-8000-000000000452', (select id from public.reviri where naziv = 'Otoka'), 'Sekcija B');
  begin
    update public.sekcija_clanovi set sekcija_id = '55555555-0000-4000-8000-000000000452' where korisnik_id = '00000000-0000-0000-0000-0000000045e1';
    raise exception 'FAIL: grupa iz druge sekcije';
  exception when check_violation then null; end;
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045e1', true); end $$;
do $$ begin
  assert (select count(*) from public.grupe) = 1, 'član sekcije vidi grupe';
  begin
    insert into public.grupe (sekcija_id, grupovodja_id) values ('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1');
    raise exception 'FAIL: član napravio grupu';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Faza 2: dodijeli_grupu po ulogama; grupovođa mora biti član sekcije
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045d1', true); end $$;
do $$ begin
  begin
    insert into public.grupe (sekcija_id, grupovodja_id) values ('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045c3');
    raise exception 'FAIL: grupovođa nije član';
  exception when check_violation then null; end;
  perform public.dodijeli_grupu('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1', null);
  assert (select grupa_id from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000045e1') is null, 'lovovođa sekcije skida iz grupe';
  perform public.dodijeli_grupu('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1', '77777777-0000-4000-8000-000000000451');
end $$;
reset role;
-- grupovođa raspoređuje u svoju grupu; član ne; lovovođa revira da
do $$ begin
  update public.sekcija_clanovi set grupa_id = null where korisnik_id = '00000000-0000-0000-0000-0000000045e1';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045d2', true);
  set local role authenticated;
  perform public.dodijeli_grupu('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1', '77777777-0000-4000-8000-000000000451');
  assert (select grupa_id from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000045e1') is not null, 'grupovođa u svoju grupu';
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045e1', true);
  set local role authenticated;
  begin
    perform public.dodijeli_grupu('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1', null);
    raise exception 'FAIL: član sam sebe';
  exception when insufficient_privilege then null; end;
  reset role;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000045c2', true);
  set local role authenticated;
  perform public.dodijeli_grupu('55555555-0000-4000-8000-000000000451', '00000000-0000-0000-0000-0000000045e1', null);
  assert (select grupa_id from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000045e1') is null, 'lovovođa revira skida';
  reset role;
end $$;

rollback;
