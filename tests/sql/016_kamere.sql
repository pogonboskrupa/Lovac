-- Test 016: kamere vide i unose samo lovočuvari tog revira.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000016a1', 'admin16@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000016b1', 'gv16@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000016c1', 'clan16@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000016d1', 'lcK16@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000016d2', 'lcO16@t', '{"ime":"Lovocuvar","prezime":"Otoke"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000016a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000016b1', '00000000-0000-0000-0000-0000000016c1', '00000000-0000-0000-0000-0000000016d1', '00000000-0000-0000-0000-0000000016d2');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000016a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000016d1'), (otoka, '00000000-0000-0000-0000-0000000016d2');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000016b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000161', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000016b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values ('55555555-0000-4000-8000-000000000161', '00000000-0000-0000-0000-0000000016c1', 'odobren');
end $$;
reset role;

-- Lovočuvar Krupe postavlja kameru u svom reviru; ne smije u tuđi revir ni u tuđe ime.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000016d1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.kamere (id, revir_id, naziv, napomena, lat, lon) values ('cccccccc-0000-4000-8000-000000000161', krupa, 'Kamera Vrh', 'prema hranilištu', 44.88, 16.15);
  begin
    insert into public.kamere (id, revir_id, naziv, lat, lon) values ('cccccccc-0000-4000-8000-000000000162', otoka, 'Tuđi revir', 44.9, 16.2);
    raise exception 'FAIL: kamera u tuđem reviru';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.kamere (id, revir_id, naziv, autor_id, lat, lon) values ('cccccccc-0000-4000-8000-000000000163', krupa, 'U tuđe ime', '00000000-0000-0000-0000-0000000016d2', 44.9, 16.2);
    raise exception 'FAIL: kamera u tuđe ime';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Ne vide: lovočuvar drugog revira, grupovođa, član, admin. Vidi: lovočuvar Krupe.
do $$
declare uid text; n int;
begin
  foreach uid in array array['00000000-0000-0000-0000-0000000016d2', '00000000-0000-0000-0000-0000000016b1', '00000000-0000-0000-0000-0000000016c1', '00000000-0000-0000-0000-0000000016a1'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    set local role authenticated;
    select count(*) into n from public.kamere;
    reset role;
    if n <> 0 then raise exception 'FAIL: % vidi kamere', uid; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000016d1', true);
  set local role authenticated;
  select count(*) into n from public.kamere;
  reset role;
  if n <> 1 then raise exception 'FAIL: lovočuvar ne vidi svoju kameru'; end if;
end $$;

-- Grupovođa i član ne mogu unijeti kameru.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000016b1', true); end $$;
do $$ declare krupa uuid := (select id from public.reviri where naziv = 'Krupa'); begin
  begin
    insert into public.kamere (id, revir_id, naziv, lat, lon) values ('cccccccc-0000-4000-8000-000000000164', krupa, 'Grupovođa', 44.9, 16.2);
    raise exception 'FAIL: grupovođa postavio kameru';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Skidanje kamere (aktivno = false) smije lovočuvar revira; revir se ne može promijeniti; brisanje nije dozvoljeno.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000016d1', true); end $$;
do $$ declare otoka uuid := (select id from public.reviri where naziv = 'Otoka'); begin
  update public.kamere set aktivno = false, revir_id = otoka where id = 'cccccccc-0000-4000-8000-000000000161';
  if not exists (select 1 from public.kamere where id = 'cccccccc-0000-4000-8000-000000000161' and aktivno = false and revir_id <> otoka) then
    raise exception 'FAIL: skidanje kamere ili zaštita revira';
  end if;
  begin
    delete from public.kamere;
    raise exception 'FAIL: brisanje kamere';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
