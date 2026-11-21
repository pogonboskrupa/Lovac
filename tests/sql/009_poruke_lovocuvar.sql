-- Test 009: lovočuvar prati SVE sekcije svog revira (samo čita); poruke sekcije samo za one koji imaju pristup.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'admin9@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000009b1', 'gv9@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000009c1', 'clan9@t', '{"ime":"Clan","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000009c2', 'van9@t', '{"ime":"Van","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000009d1', 'lc9@t', '{"ime":"Lovočuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000009d2', 'lc9b@t', '{"ime":"Lovočuvar","prezime":"Otoke"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000009a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000009b1', '00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009c2',
  '00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009d2');

-- Admin: lovočuvari po revirima, grupovođa, dvije sekcije u Krupi i jedna u Otoci.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.revir_lovocuvari values
    (krupa, '00000000-0000-0000-0000-0000000009d1'),
    (otoka, '00000000-0000-0000-0000-0000000009d2');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000009b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000091', krupa, 'Krupa A', '00000000-0000-0000-0000-0000000009b1'),
    ('55555555-0000-4000-8000-000000000092', krupa, 'Krupa B', null),
    ('55555555-0000-4000-8000-000000000093', otoka, 'Otoka A', null);
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000091', '00000000-0000-0000-0000-0000000009c1', 'odobren');
  insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, organizator_id) values
    ('77777777-0000-4000-8000-000000000091', krupa, '55555555-0000-4000-8000-000000000091', 'Lov Krupa A', '2026-12-05', auth.uid()),
    ('77777777-0000-4000-8000-000000000092', krupa, '55555555-0000-4000-8000-000000000092', 'Lov Krupa B', '2026-12-06', auth.uid()),
    ('77777777-0000-4000-8000-000000000093', otoka, '55555555-0000-4000-8000-000000000093', 'Lov Otoka A', '2026-12-07', auth.uid());
  begin
    insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000009c2');
  exception when others then raise exception 'FAIL: admin ne može postaviti lovočuvara'; end;
  delete from public.revir_lovocuvari where korisnik_id = '00000000-0000-0000-0000-0000000009c2';
end $$;
reset role;

-- Običan lovac ne postavlja lovočuvare.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009c2', true); end $$;
do $$ begin
  begin
    insert into public.revir_lovocuvari values ((select id from public.reviri where naziv = 'Krupa'), '00000000-0000-0000-0000-0000000009c2');
    raise exception 'FAIL: lovac postavio sebe za lovočuvara';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Lovočuvar Krupe vidi OBJE sekcije Krupe (članove, lovove), ne i Otoku; ne upravlja.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009d1', true); end $$;
do $$ begin
  assert (select count(*) from public.lovovi) = 2, 'lovočuvar vidi lovove obje sekcije svog revira, ne i drugog';
  assert not exists (select 1 from public.lovovi where naziv = 'Lov Otoka A'), 'ne vidi lov tuđeg revira';
  assert (select count(*) from public.sekcija_clanovi) = 1, 'vidi članove sekcija svog revira';
  assert public.je_clan_sekcije('55555555-0000-4000-8000-000000000092'), 'pristup drugoj sekciji istog revira';
  assert not public.je_clan_sekcije('55555555-0000-4000-8000-000000000093'), 'nema pristup sekciji drugog revira';
  update public.sekcija_clanovi set status = 'ceka';
  assert (select status from public.sekcija_clanovi) = 'odobren', 'lovočuvar ne upravlja članovima';
  update public.lovovi set naziv = 'hak';
  assert not exists (select 1 from public.lovovi where naziv = 'hak'), 'lovočuvar ne organizuje lov';
  begin
    insert into public.sekcije (revir_id, naziv) values ((select id from public.reviri where naziv = 'Krupa'), 'Nova');
    raise exception 'FAIL: lovočuvar napravio sekciju';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- PORUKE: član šalje, grupovođa i lovočuvar revira čitaju i pišu, tuđi ne.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009c1', true); end $$;
do $$ begin
  insert into public.poruke (id, sekcija_id, tekst) values
    ('99999999-0000-4000-8000-000000000091', '55555555-0000-4000-8000-000000000091', 'Stigao na stan 2');
  assert (select autor_id = auth.uid() from public.poruke), 'autor je prijavljeni korisnik';
  begin
    insert into public.poruke (sekcija_id, autor_id, tekst) values
      ('55555555-0000-4000-8000-000000000091', '00000000-0000-0000-0000-0000000009b1', 'u tuđe ime');
    raise exception 'FAIL: poruka u tuđe ime';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.poruke (sekcija_id, tekst) values ('55555555-0000-4000-8000-000000000092', 'u tuđu sekciju');
    raise exception 'FAIL: poruka u sekciju bez pristupa';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.poruke (sekcija_id, tekst) values ('55555555-0000-4000-8000-000000000091', '   ');
    raise exception 'FAIL: prazna poruka';
  exception when check_violation then null;
  end;
  begin
    update public.poruke set tekst = 'izmijenjeno';
    raise exception 'FAIL: poruka izmijenjena';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.poruke;
    raise exception 'FAIL: poruka obrisana';
  exception when insufficient_privilege then null;
  end;
  assert (select tekst from public.poruke) = 'Stigao na stan 2', 'poruka ostaje netaknuta';
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009d1', true); end $$;
do $$ begin
  assert (select count(*) from public.poruke) = 1, 'lovočuvar revira čita poruke sekcije';
  insert into public.poruke (sekcija_id, tekst) values ('55555555-0000-4000-8000-000000000092', 'Obilazim Krupu B');
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009b1', true); end $$;
do $$ begin
  assert (select count(*) from public.poruke) = 1, 'grupovođa vidi poruke SVOJE sekcije (ne Krupa B)';
  insert into public.poruke (sekcija_id, tekst) values ('55555555-0000-4000-8000-000000000091', 'Sutra pogon u 7');
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009d2', true); end $$;
do $$ begin
  assert (select count(*) from public.poruke) = 0, 'lovočuvar drugog revira ne vidi poruke';
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000009c2', true); end $$;
do $$ begin
  assert (select count(*) from public.poruke) = 0, 'lovac bez pristupa ne vidi poruke';
end $$;
reset role;

rollback;
