-- Test 038: probni period 24 h; zahtjev za sekciju odobrava lovočuvar revira (ne tuđeg), grupovođa i admin.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000038a1', 'lc38@t', '{"ime":"Lovo","prezime":"Cuvar"}'),
  ('00000000-0000-0000-0000-0000000038a2', 'lc38b@t', '{"ime":"Tuđi","prezime":"Cuvar"}'),
  ('00000000-0000-0000-0000-0000000038b1', 'n38@t', '{"ime":"Novi","prezime":"Lovac","probni":"true"}'),
  ('00000000-0000-0000-0000-0000000038b2', 'n38b@t', '{"ime":"Drugi","prezime":"Lovac","probni":"true"}');
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000038a1', '00000000-0000-0000-0000-0000000038a2');
insert into public.revir_lovocuvari values
  ((select id from public.reviri where naziv = 'Krupa'), '00000000-0000-0000-0000-0000000038a1'),
  ((select id from public.reviri where naziv = 'Otoka'), '00000000-0000-0000-0000-0000000038a2');
insert into public.sekcije (id, revir_id, naziv) values
  ('55555555-0000-4000-8000-000000000381', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 38');
insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
  ('55555555-0000-4000-8000-000000000381', '00000000-0000-0000-0000-0000000038b1', 'ceka'),
  ('55555555-0000-4000-8000-000000000381', '00000000-0000-0000-0000-0000000038b2', 'ceka');

do $$ begin
  assert (select probni_do between now() + interval '23 hours' and now() + interval '24 hours 1 minute'
          from public.korisnici where id = '00000000-0000-0000-0000-0000000038b1'), 'probni period je 24 h';
end $$;

set local role authenticated;
-- lovočuvar tuđeg revira ne može
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000038a2', true); end $$;
do $$ begin
  begin
    perform public.odobri_zahtjev('55555555-0000-4000-8000-000000000381', '00000000-0000-0000-0000-0000000038b1');
    raise exception 'tuđi lovočuvar je odobrio';
  exception when insufficient_privilege then null;
  end;
end $$;
-- lovočuvar revira sekcije odobrava: nalog postaje trajno odobren
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000038a1', true); end $$;
select public.odobri_zahtjev('55555555-0000-4000-8000-000000000381', '00000000-0000-0000-0000-0000000038b1');
select public.odbij_zahtjev('55555555-0000-4000-8000-000000000381', '00000000-0000-0000-0000-0000000038b2');
reset role;
do $$ begin
  assert (select odobren and probni_do is null from public.korisnici where id = '00000000-0000-0000-0000-0000000038b1'), 'nalog odobren';
  assert (select status from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000038b1') = 'odobren', 'član odobren';
  assert not exists (select 1 from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000038b2'), 'odbijen zahtjev je uklonjen';
end $$;
-- običan lovac ne može odobriti
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000038b2', true); end $$;
do $$ begin
  begin
    perform public.odobri_zahtjev('55555555-0000-4000-8000-000000000381', '00000000-0000-0000-0000-0000000038b2');
    raise exception 'lovac je odobrio sam sebe';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
