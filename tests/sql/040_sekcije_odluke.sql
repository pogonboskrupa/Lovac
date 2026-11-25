-- Test 040: imena podnosilaca samo za onoga ko odobrava; odluke (odobren / odbijen sa razlogom / prebačen) vidi podnosilac
-- i upravljač; povlačenje vlastitog zahtjeva nije odluka; opis i okupljanje sekcije uređuje grupovođa.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000040a1', 'gv40@t', '{"ime":"Goran","prezime":"Gv"}'),
  ('00000000-0000-0000-0000-0000000040a2', 'cl40@t', '{"ime":"Clan","prezime":"Obicni"}'),
  ('00000000-0000-0000-0000-0000000040a3', 'lc40@t', '{"ime":"Lovo","prezime":"Cuvar"}'),
  ('00000000-0000-0000-0000-0000000040b1', 'p1@t', '{"ime":"Prvi","prezime":"Podnosilac","nadimak":"7"}'),
  ('00000000-0000-0000-0000-0000000040b2', 'p2@t', '{"ime":"Drugi","prezime":"Podnosilac"}'),
  ('00000000-0000-0000-0000-0000000040b3', 'p3@t', '{"ime":"Treci","prezime":"Podnosilac"}'),
  ('00000000-0000-0000-0000-0000000040b4', 'p4@t', '{"ime":"Cetvrti","prezime":"Podnosilac"}');
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000040a1', '00000000-0000-0000-0000-0000000040a2', '00000000-0000-0000-0000-0000000040a3');
-- podnosioci su u probnom periodu (nisu odobreni, ali je_odobren() je true dok period traje)
update public.korisnici set probni_do = now() + interval '1 day' where id in ('00000000-0000-0000-0000-0000000040b1', '00000000-0000-0000-0000-0000000040b2', '00000000-0000-0000-0000-0000000040b3', '00000000-0000-0000-0000-0000000040b4');
insert into public.revir_lovocuvari values ((select id from public.reviri where naziv = 'Krupa'), '00000000-0000-0000-0000-0000000040a3');
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000401', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 40', '00000000-0000-0000-0000-0000000040a1'),
  ('55555555-0000-4000-8000-000000000402', (select id from public.reviri where naziv = 'Otoka'), 'Druga 40', null);
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
  ('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040a2', 'odobren'),
  ('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040b1', 'ceka'),
  ('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040b2', 'ceka'),
  ('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040b3', 'ceka'),
  ('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040b4', 'ceka');

set local role authenticated;
-- obični član ne vidi imena podnosilaca; grupovođa vidi (i nadimak)
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a2', true); end $$;
do $$ begin assert (select count(*) from public.imena_podnosilaca()) = 0, 'član ne vidi imena podnosilaca'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a1', true); end $$;
do $$ begin
  assert (select count(*) from public.imena_podnosilaca()) = 4, 'grupovođa vidi 4 podnosioca';
  assert (select nadimak from public.imena_podnosilaca() where korisnik_id = '00000000-0000-0000-0000-0000000040b1') = '7', 'nadimak';
end $$;

-- odobravanje (update) i odbijanje sa razlogom
update public.sekcija_clanovi set status = 'odobren' where korisnik_id = '00000000-0000-0000-0000-0000000040b1';
select public.odbij_zahtjev_razlog('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040b2', 'Nisi član društva');
select public.premjesti_zahtjev('55555555-0000-4000-8000-000000000401', '55555555-0000-4000-8000-000000000402', '00000000-0000-0000-0000-0000000040b3');
-- opis i okupljanje uređuje grupovođa
update public.sekcije set opis = 'Sekcija uz rijeku', okupljanje = 'Lovačka kuća, 7:00' where id = '55555555-0000-4000-8000-000000000401';
do $$ begin
  assert (select count(*) from public.sekcija_odluke where sekcija_id = '55555555-0000-4000-8000-000000000401') = 3, 'grupovođa vidi historiju (3 odluke)';
  assert (select odlucio from public.sekcija_odluke where korisnik_id = '00000000-0000-0000-0000-0000000040b1') = '00000000-0000-0000-0000-0000000040a1', 'ko je odlučio';
  assert (select razlog from public.sekcija_odluke where korisnik_id = '00000000-0000-0000-0000-0000000040b2') = 'Nisi član društva', 'razlog odbijanja';
  assert (select odluka || ':' || u_sekciju from public.sekcija_odluke where korisnik_id = '00000000-0000-0000-0000-0000000040b3') = 'prebacen:55555555-0000-4000-8000-000000000402', 'prebačen, ne odbijen';
  assert (select okupljanje from public.sekcije where id = '55555555-0000-4000-8000-000000000401') = 'Lovačka kuća, 7:00', 'okupljanje';
end $$;
-- klijent ne može sam upisati odluku
do $$ begin
  begin
    insert into public.sekcija_odluke (sekcija_id, korisnik_id, odluka) values ('55555555-0000-4000-8000-000000000401', '00000000-0000-0000-0000-0000000040b4', 'odobren');
    raise exception 'klijent je upisao odluku';
  exception when insufficient_privilege then null;
  end;
end $$;

-- podnosilac vidi SAMO svoju odluku i razlog; povlačenje vlastitog zahtjeva nije odluka
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040b2', true); end $$;
do $$ begin
  assert (select count(*) from public.sekcija_odluke) = 1, 'podnosilac vidi samo svoju odluku';
  assert (select razlog from public.sekcija_odluke) = 'Nisi član društva', 'i razlog';
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040b4', true); end $$;
delete from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000040b4';
do $$ begin assert (select count(*) from public.sekcija_odluke) = 0, 'povlačenje nije odluka'; end $$;
-- obični član ne može odbiti tuđi zahtjev
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a2', true); end $$;
do $$ begin
  begin
    perform public.odbij_zahtjev_razlog('55555555-0000-4000-8000-000000000402', '00000000-0000-0000-0000-0000000040b3', 'x');
    raise exception 'član je odbio zahtjev';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from public.sekcija_odluke) = 0, 'član ne vidi tuđe odluke';
end $$;
-- lovočuvar revira vidi historiju sekcija svog revira
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000040a3', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_odluke where sekcija_id = '55555555-0000-4000-8000-000000000401') = 3, 'lovočuvar vidi historiju'; end $$;
rollback;
