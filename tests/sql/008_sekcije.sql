-- Test 008: sekcije, grupovođe, zahtjev za pristup i odobrenje; bez odobrenja nema ulaza.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000008a1', 'admin8@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000008b1', 'gv8@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000008b2', 'gv8b@t', '{"ime":"Gojko","prezime":"Drugi"}'),
  ('00000000-0000-0000-0000-0000000008c1', 'lov8@t', '{"ime":"Lovro","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000008c2', 'lov8b@t', '{"ime":"Luka","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000008d1', 'lc8@t', '{"ime":"Lovro","prezime":"Lovočuvar"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000008a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008c1',
  '00000000-0000-0000-0000-0000000008c2', '00000000-0000-0000-0000-0000000008d1');

do $$ begin
  assert (select count(*) from public.reviri where naziv in ('Krupa', 'Otoka', 'Jezerski')) = 3, 'tri revira iz migracije';
end $$;

-- ADMIN: određuje grupovođe po reviru i pravi sekciju sa lovočuvarom.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.grupovodje values
    ('00000000-0000-0000-0000-0000000008b1', krupa),
    ('00000000-0000-0000-0000-0000000008b2', otoka);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id, lovocuvar_id) values
    ('55555555-0000-4000-8000-000000000001', krupa, 'Sekcija Krupa 1', '00000000-0000-0000-0000-0000000008b1', '00000000-0000-0000-0000-0000000008d1');
  assert (select promijenio = auth.uid() from public.sekcije where naziv = 'Sekcija Krupa 1'), 'ko je promijenio upisuje server';
  update public.sekcije set naziv = 'Sekcija Krupa 1 (uređena)' where id = '55555555-0000-4000-8000-000000000001';
  begin
    delete from public.sekcije;
    raise exception 'FAIL: brisanje sekcije prošlo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- GRUPOVOĐA Krupe: pravi sekciju u svom reviru sa spiskom lovaca; ne u tuđem; ne mijenja grupovođu.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008b1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000002', krupa, 'Sekcija Krupa 2', auth.uid());
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000002', '00000000-0000-0000-0000-0000000008c1', 'odobren');
  assert (select status = 'odobren' and odlucio = auth.uid() from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000008c1'),
    'lovac sa spiska grupovođe je odmah odobren, uz zapis ko je odobrio';
  begin
    insert into public.sekcije (revir_id, naziv, grupovodja_id) values (otoka, 'Tuđi revir', auth.uid());
    raise exception 'FAIL: grupovođa napravio sekciju u tuđem reviru';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sekcije (revir_id, naziv, grupovodja_id) values (krupa, 'Za drugog', '00000000-0000-0000-0000-0000000008c2');
    raise exception 'FAIL: grupovođa postavio drugog za grupovođu';
  exception when insufficient_privilege then null;
  end;
  update public.sekcije set grupovodja_id = '00000000-0000-0000-0000-0000000008c2', lovocuvar_id = null, naziv = 'Krupa 2 preimenovana'
   where id = '55555555-0000-4000-8000-000000000002';
  assert (select grupovodja_id = auth.uid() and lovocuvar_id is null from public.sekcije where id = '55555555-0000-4000-8000-000000000002') is not null,
    'provjera ispod';
  assert (select grupovodja_id from public.sekcije where id = '55555555-0000-4000-8000-000000000002') = auth.uid(),
    'grupovođa ne može prebaciti grupovođu (samo admin)';
  assert (select naziv from public.sekcije where id = '55555555-0000-4000-8000-000000000002') = 'Krupa 2 preimenovana', 'naziv može mijenjati';
end $$;
reset role;

-- Običan lovac ne može praviti sekciju.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008c2', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  begin
    insert into public.sekcije (revir_id, naziv, grupovodja_id) values (krupa, 'Moja sekcija', auth.uid());
    raise exception 'FAIL: običan lovac napravio sekciju';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.sekcije) = 2, 'imena sekcija vide svi odobreni (da mogu tražiti pristup)';

  -- ZAHTJEV: može tražiti pristup, ne može sam sebe odobriti ni dodati kao odobrenog.
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id) values ('55555555-0000-4000-8000-000000000001', auth.uid());
  begin
    insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values ('55555555-0000-4000-8000-000000000002', auth.uid(), 'odobren');
    raise exception 'FAIL: lovac se sam dodao kao odobren';
  exception when insufficient_privilege then null;
  end;
  update public.sekcija_clanovi set status = 'odobren' where korisnik_id = auth.uid();
  assert (select status from public.sekcija_clanovi where korisnik_id = auth.uid()) = 'ceka', 'samoodobrenje ne prolazi';
  begin
    insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values ('55555555-0000-4000-8000-000000000001', '00000000-0000-0000-0000-0000000008c1', 'odobren');
    raise exception 'FAIL: lovac dodao drugog';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- BEZ ODOBRENJA nema ulaza: članovi sekcije i lovovi sekcije se ne vide.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008b1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, organizator_id) values
    ('77777777-0000-4000-8000-000000000008', krupa, '55555555-0000-4000-8000-000000000001', 'Pogon sekcije', '2026-12-05', auth.uid());
  begin
    insert into public.lovovi (revir_id, sekcija_id, naziv, datum, organizator_id) values
      ((select id from public.reviri where naziv = 'Otoka'), '55555555-0000-4000-8000-000000000001', 'Pogrešan revir', '2026-12-05', auth.uid());
    raise exception 'FAIL: lov sa sekcijom iz drugog revira';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 0, 'neodobren zahtjev ne vidi lov sekcije';
  assert (select count(*) from public.sekcija_clanovi) = 1, 'vidi samo svoj zahtjev';
end $$;
reset role;

-- Grupovođa Otoke ne upravlja tuđom sekcijom.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008b2', true); end $$;
do $$ begin
  assert (select count(*) from public.sekcija_clanovi) = 0, 'grupovođa druge sekcije ne vidi zahtjeve';
  update public.sekcija_clanovi set status = 'odobren';
  assert not exists (select 1 from public.sekcija_clanovi where status = 'odobren'), 'ne odobrava tuđe zahtjeve';
end $$;
reset role;

-- Grupovođa odobrava zahtjev -> lovac ulazi.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008b1', true); end $$;
do $$ begin
  assert (select count(*) from public.sekcija_clanovi where status = 'ceka') = 1, 'grupovođa vidi zahtjev';
  update public.sekcija_clanovi set status = 'odobren' where sekcija_id = '55555555-0000-4000-8000-000000000001' and korisnik_id = '00000000-0000-0000-0000-0000000008c2';
  assert (select odlucio = auth.uid() from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000008c2'), 'ko je odobrio';
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 1, 'odobren član vidi lov svoje sekcije';
  assert (select count(*) from public.sekcija_clanovi) >= 1, 'odobren član vidi članove';
  update public.lovovi set naziv = 'hak';
  assert (select naziv from public.lovovi) = 'Pogon sekcije', 'član ne organizuje lov';
  -- član druge sekcije (nije odobren u Krupa 2) ne vidi njene članove
end $$;
reset role;

-- Lovac iz sekcije 2 ne vidi lov sekcije 1; lovočuvar vidi sekciju bez zahtjeva.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008c1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 0, 'član druge sekcije ne vidi lov tuđe sekcije';
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008d1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 1, 'lovočuvar vidi lov svoje sekcije';
end $$;
reset role;

-- Odbijanje = brisanje zahtjeva (grupovođa), odustajanje = brisanje svog.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008b1', true); end $$;
do $$ begin
  delete from public.sekcija_clanovi where sekcija_id = '55555555-0000-4000-8000-000000000001' and korisnik_id = '00000000-0000-0000-0000-0000000008c2';
  assert not exists (select 1 from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000008c2'), 'član uklonjen';
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 0, 'uklonjen član gubi ulaz';
end $$;
reset role;

rollback;
