-- Test 026: samoregistrovan lovac radi 7 dana (vlastiti zapisi, zahtjev za sekciju), ali ne vidi podatke društva;
-- grupovođa ga primanjem u sekciju trajno odobrava; opoziv prekida probni period; probni_do ne mijenja sam.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000026a1', 'admin26@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000026b1', 'gv26@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000026c1', 'clan26@t', '{"ime":"Clan","prezime":"Stari"}'),
  ('00000000-0000-0000-0000-0000000026d1', 'novi26@t', '{"ime":"Novi","prezime":"Probni","probni":"true"}'),
  ('00000000-0000-0000-0000-0000000026d2', 'novi26b@t', '{"ime":"Drugi","prezime":"Probni","probni":true}'),
  ('00000000-0000-0000-0000-0000000026e1', 'bez26@t', '{"ime":"Bez","prezime":"Probnog"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000026a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000026b1', '00000000-0000-0000-0000-0000000026c1');

-- 1) Rok postavlja server: 7 dana za samoregistraciju, ništa bez oznake.
do $$ begin
  assert (select probni_do between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
          from public.korisnici where id = '00000000-0000-0000-0000-0000000026d1'), 'probni period 7 dana';
  assert (select probni_do is not null from public.korisnici where id = '00000000-0000-0000-0000-0000000026d2'), 'probni i kao JSON true';
  assert (select probni_do is null from public.korisnici where id = '00000000-0000-0000-0000-0000000026e1'), 'bez oznake nema probnog';
end $$;

insert into public.grupovodje values ('00000000-0000-0000-0000-0000000026b1', (select id from public.reviri where naziv = 'Krupa'));
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000261', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 26', '00000000-0000-0000-0000-0000000026b1');
insert into public.objekti (id, vlasnik_id, podaci, vidljivost, lat, lon) values
  ('99999999-0000-4000-8000-000000000261', '00000000-0000-0000-0000-0000000026c1', '{"naziv":"Čeka društva"}', 'drustvo', 44.8, 16.1);

-- 2) Probni lovac: radi sa svojim zapisima i traži sekciju, ali ne vidi zapise društva ni spisak članova.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000026d1', true); end $$;
do $$ begin
  assert public.je_odobren(), 'probni lovac koristi aplikaciju';
  assert not public.je_clan_drustva(), 'ali nije član društva';
end $$;
insert into public.opazanja (id, vlasnik_id, lat, lon) values
  ('99999999-0000-4000-8000-000000000262', '00000000-0000-0000-0000-0000000026d1', 44.8, 16.1);
do $$ begin
  assert (select count(*) from public.opazanja where id = '99999999-0000-4000-8000-000000000262') = 1, 'vidi svoje opažanje';
  assert (select count(*) from public.objekti where id = '99999999-0000-4000-8000-000000000261') = 0, 'ne vidi objekte društva';
  assert (select count(*) from public.korisnici) = 1, 'vidi samo sebe u spisku članova';
end $$;
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
  ('55555555-0000-4000-8000-000000000261', '00000000-0000-0000-0000-0000000026d1', 'ceka');

-- ne može sebi produžiti probni period ni se odobriti
do $$ begin
  begin
    update public.korisnici set probni_do = now() + interval '1 year' where id = auth.uid();
    raise exception 'produžio sam sebi probni period';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
      ('55555555-0000-4000-8000-000000000261', '00000000-0000-0000-0000-0000000026d2', 'odobren');
    raise exception 'dodao drugog kao odobrenog';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3) Istekao probni period = nema pristupa.
reset role;
update public.korisnici set probni_do = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000026d2';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000026d2', true); end $$;
do $$ begin
  assert not public.je_odobren(), 'istekao probni period';
  assert (select count(*) from public.opazanja) = 0, 'bez pristupa podacima';
end $$;

-- 4) Grupovođa ga primi u sekciju → nalog je trajno odobren i vidi podatke društva.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000026b1', true); end $$;
update public.sekcija_clanovi set status = 'odobren'
 where sekcija_id = '55555555-0000-4000-8000-000000000261' and korisnik_id = '00000000-0000-0000-0000-0000000026d1';
reset role;
do $$ begin
  assert (select odobren and probni_do is null from public.korisnici where id = '00000000-0000-0000-0000-0000000026d1'), 'primljen u sekciju = odobren';
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000026d1', true); end $$;
do $$ begin
  assert (select count(*) from public.objekti where id = '99999999-0000-4000-8000-000000000261') = 1, 'sada vidi objekte društva';
end $$;

-- 5) Admin opoziva drugog probnog lovca: probni period prestaje odmah.
reset role;
update public.korisnici set probni_do = now() + interval '5 days' where id = '00000000-0000-0000-0000-0000000026d2';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000026a1', true); end $$;
select public.admin_odobri('00000000-0000-0000-0000-0000000026d2', false);
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000026d2', true); end $$;
do $$ begin
  assert not public.je_odobren(), 'opozvan probni lovac nema pristup';
end $$;

rollback;
