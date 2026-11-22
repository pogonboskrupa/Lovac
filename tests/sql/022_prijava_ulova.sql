-- Test 022: prijava ulova — vide je admin (sve), lovočuvar revira, grupovođa sekcije i vlasnik; drugi ne. Ne mijenja se.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000022a1', 'admin22@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000022b1', 'gv22@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000022b2', 'gv22b@t', '{"ime":"Goran","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000022c1', 'clan22@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000022c2', 'clan22b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000022c3', 'ceka22@t', '{"ime":"Clan","prezime":"Ceka"}'),
  ('00000000-0000-0000-0000-0000000022d1', 'lcK22@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000022d2', 'lcO22@t', '{"ime":"Lovocuvar","prezime":"Otoke"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000022a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000022b1', '00000000-0000-0000-0000-0000000022b2', '00000000-0000-0000-0000-0000000022c1',
  '00000000-0000-0000-0000-0000000022c2', '00000000-0000-0000-0000-0000000022c3', '00000000-0000-0000-0000-0000000022d1', '00000000-0000-0000-0000-0000000022d2');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000022a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000022d1'), (otoka, '00000000-0000-0000-0000-0000000022d2');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000022b1', krupa), ('00000000-0000-0000-0000-0000000022b2', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000221', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000022b1'),
    ('55555555-0000-4000-8000-000000000222', krupa, 'Sekcija B', '00000000-0000-0000-0000-0000000022b2');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000221', '00000000-0000-0000-0000-0000000022c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000222', '00000000-0000-0000-0000-0000000022c2', 'odobren'),
    ('55555555-0000-4000-8000-000000000221', '00000000-0000-0000-0000-0000000022c3', 'ceka');
end $$;
reset role;

-- Član prijavljuje u svoj revir; ne u tuđe ime, ne u tuđi revir ni tuđu sekciju, ne kao neodobren član.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000022c1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.ulov_prijave (id, revir_id, sekcija_id, vrsta, kategorija, tezina, vrijeme)
    values ('88888888-0000-4000-8000-000000000221', krupa, '55555555-0000-4000-8000-000000000221', 'divlja_svinja', 'vepar', 95.5, now());
  begin
    insert into public.ulov_prijave (id, lovac_id, revir_id, vrsta, vrijeme) values ('88888888-0000-4000-8000-000000000222', '00000000-0000-0000-0000-0000000022c2', krupa, 'zec', now());
    raise exception 'FAIL: prijava u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.ulov_prijave (id, revir_id, vrsta, vrijeme) values ('88888888-0000-4000-8000-000000000223', otoka, 'zec', now());
    raise exception 'FAIL: prijava u revir bez članstva';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.ulov_prijave (id, revir_id, sekcija_id, vrsta, vrijeme) values ('88888888-0000-4000-8000-000000000224', krupa, '55555555-0000-4000-8000-000000000222', 'zec', now());
    raise exception 'FAIL: prijava u tuđu sekciju';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000022c3', true); end $$;
do $$ declare krupa uuid := (select id from public.reviri where naziv = 'Krupa'); begin
  begin
    insert into public.ulov_prijave (id, revir_id, sekcija_id, vrsta, vrijeme) values ('88888888-0000-4000-8000-000000000225', krupa, '55555555-0000-4000-8000-000000000221', 'zec', now());
    raise exception 'FAIL: neodobren član prijavljuje';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- još jedna prijava u Sekciji B (drugi član) za razlikovanje vidljivosti
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000022c2', true); end $$;
do $$ declare krupa uuid := (select id from public.reviri where naziv = 'Krupa'); begin
  insert into public.ulov_prijave (id, revir_id, sekcija_id, vrsta, vrijeme) values ('88888888-0000-4000-8000-000000000226', krupa, '55555555-0000-4000-8000-000000000222', 'zec', now());
end $$;
reset role;

-- Ko šta vidi (2 prijave u Krupi: A i B): admin 2, lovočuvar Krupe 2, lovočuvar Otoke 0, grupovođa A 1, grupovođa B 1, član 1 (svoju).
do $$
declare uid text; n int; ocekivano int;
begin
  for uid, ocekivano in values
    ('00000000-0000-0000-0000-0000000022a1', 2),
    ('00000000-0000-0000-0000-0000000022d1', 2),
    ('00000000-0000-0000-0000-0000000022d2', 0),
    ('00000000-0000-0000-0000-0000000022b1', 1),
    ('00000000-0000-0000-0000-0000000022b2', 1),
    ('00000000-0000-0000-0000-0000000022c1', 1),
    ('00000000-0000-0000-0000-0000000022c3', 0)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', uid, true);
    select count(*) into n from public.ulov_prijave;
    execute 'reset role';
    if n <> ocekivano then raise exception 'FAIL: % vidi % prijava, očekivano %', uid, n, ocekivano; end if;
  end loop;
end $$;

-- Prijava se ne mijenja; vlasnik je može povući, ali ne vratiti; drugi je ne mogu mijenjati.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000022c1', true); end $$;
do $$ declare t numeric; p boolean; begin
  begin
    update public.ulov_prijave set tezina = 10 where id = '88888888-0000-4000-8000-000000000221';
    raise exception 'FAIL: izmjena težine prijave';
  exception when insufficient_privilege then null; end;
  update public.ulov_prijave set povucena = true where id = '88888888-0000-4000-8000-000000000221';
  select tezina, povucena into t, p from public.ulov_prijave where id = '88888888-0000-4000-8000-000000000221';
  if t <> 95.5 or not p then raise exception 'FAIL: povlačenje'; end if;
  begin
    update public.ulov_prijave set povucena = false where id = '88888888-0000-4000-8000-000000000221';
    raise exception 'FAIL: vraćanje povučene prijave';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000022d1', true); end $$;
do $$ declare p boolean; begin
  update public.ulov_prijave set povucena = true where id = '88888888-0000-4000-8000-000000000226';
  select povucena into p from public.ulov_prijave where id = '88888888-0000-4000-8000-000000000226';
  if p then raise exception 'FAIL: lovočuvar povlači tuđu prijavu'; end if;
end $$;
reset role;

rollback;
