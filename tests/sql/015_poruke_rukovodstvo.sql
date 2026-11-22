-- Test 015: kanal Rukovodstvo — grupovođe, lovočuvari i admin; članovi i vanjski ne; sekcijske poruke ostaju zaštićene.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000015a1', 'admin15@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000015b1', 'gv15@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000015b2', 'gv15b@t', '{"ime":"Gina","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000015c1', 'clan15@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000015d1', 'lc15@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000015d2', 'lc15b@t', '{"ime":"Lovocuvar","prezime":"Otoke"}'),
  ('00000000-0000-0000-0000-0000000015e1', 'van15@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000015a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000015b1', '00000000-0000-0000-0000-0000000015b2', '00000000-0000-0000-0000-0000000015c1',
  '00000000-0000-0000-0000-0000000015d1', '00000000-0000-0000-0000-0000000015d2', '00000000-0000-0000-0000-0000000015e1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000015a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000015d1'), (otoka, '00000000-0000-0000-0000-0000000015d2');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000015b1', krupa), ('00000000-0000-0000-0000-0000000015b2', otoka);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000151', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000015b1'),
    ('55555555-0000-4000-8000-000000000152', otoka, 'Sekcija B', '00000000-0000-0000-0000-0000000015b2');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000151', '00000000-0000-0000-0000-0000000015c1', 'odobren');
end $$;
reset role;

-- Grupovođa piše rukovodstvu; ne smije u tuđe ime ni sa sekcijom.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000015b1', true); end $$;
do $$ begin
  insert into public.poruke (kanal, autor_id, tekst) values ('rukovodstvo', auth.uid(), 'Sutra pogon u Krupi');
  begin
    insert into public.poruke (kanal, autor_id, tekst) values ('rukovodstvo', '00000000-0000-0000-0000-0000000015b2', 'u tuđe ime');
    raise exception 'FAIL: poruka u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.poruke (kanal, sekcija_id, autor_id, tekst) values ('rukovodstvo', '55555555-0000-4000-8000-000000000151', auth.uid(), 'sa sekcijom');
    raise exception 'FAIL: rukovodstvo sa sekcijom';
  exception when check_violation or insufficient_privilege then null; end;
end $$;
reset role;

-- Druga grupovođa i oba lovočuvara čitaju i pišu; admin takođe.
do $$
declare uid text; n int;
begin
  foreach uid in array array['00000000-0000-0000-0000-0000000015b2', '00000000-0000-0000-0000-0000000015d1', '00000000-0000-0000-0000-0000000015d2', '00000000-0000-0000-0000-0000000015a1'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    set local role authenticated;
    select count(*) into n from public.poruke where kanal = 'rukovodstvo';
    if n < 1 then raise exception 'FAIL: % ne vidi poruke rukovodstva', uid; end if;
    insert into public.poruke (kanal, autor_id, tekst) values ('rukovodstvo', uid::uuid, 'odgovor ' || uid);
    reset role;
  end loop;
end $$;

-- Običan član i vanjski korisnik ne vide ni ne pišu.
do $$
declare uid text; n int;
begin
  foreach uid in array array['00000000-0000-0000-0000-0000000015c1', '00000000-0000-0000-0000-0000000015e1'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    set local role authenticated;
    select count(*) into n from public.poruke where kanal = 'rukovodstvo';
    if n <> 0 then raise exception 'FAIL: % vidi poruke rukovodstva', uid; end if;
    begin
      insert into public.poruke (kanal, autor_id, tekst) values ('rukovodstvo', uid::uuid, 'upad');
      raise exception 'FAIL: % piše rukovodstvu', uid;
    exception when insufficient_privilege then null; end;
    reset role;
  end loop;
end $$;

-- Lovočuvar revira piše članovima SVOJE sekcije (kanal sekcije), ne tuđe; poruke se ne mijenjaju.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000015d1', true); end $$;
do $$ begin
  insert into public.poruke (sekcija_id, autor_id, tekst) values ('55555555-0000-4000-8000-000000000151', auth.uid(), 'Pozdrav članovima');
  begin
    insert into public.poruke (sekcija_id, autor_id, tekst) values ('55555555-0000-4000-8000-000000000152', auth.uid(), 'tuđi revir');
    raise exception 'FAIL: lovočuvar piše sekciji tuđeg revira';
  exception when insufficient_privilege then null; end;
  begin
    update public.poruke set tekst = 'izmjena';
    raise exception 'FAIL: izmjena poruke';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000015c1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.poruke where sekcija_id = '55555555-0000-4000-8000-000000000151';
  if n <> 1 then raise exception 'FAIL: član ne vidi poruku lovočuvara'; end if;
end $$;
reset role;

rollback;
