-- Test 013: samoprijava prisustva člana sekcije, odjava, uklanjanje od grupovođe i zabrana ponovne samoprijave.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000013a1', 'admin13@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000013b1', 'gv13@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000013c1', 'clan13@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000013c2', 'clan13b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000013c3', 'tudji13@t', '{"ime":"Clan","prezime":"Tuđe sekcije"}'),
  ('00000000-0000-0000-0000-0000000013d1', 'van13@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000013a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000013b1', '00000000-0000-0000-0000-0000000013c1', '00000000-0000-0000-0000-0000000013c2',
  '00000000-0000-0000-0000-0000000013c3', '00000000-0000-0000-0000-0000000013d1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000013b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
    ('55555555-0000-4000-8000-000000000131', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000013b1'),
    ('55555555-0000-4000-8000-000000000132', krupa, 'Sekcija B', null);
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000131', '00000000-0000-0000-0000-0000000013c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000131', '00000000-0000-0000-0000-0000000013c2', 'odobren'),
    ('55555555-0000-4000-8000-000000000132', '00000000-0000-0000-0000-0000000013c3', 'odobren');
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id, sekcija_id) values
    ('77777777-0000-4000-8000-000000000132', krupa, 'Lov bez sekcije', current_date, auth.uid(), null);
end $$;
reset role;

-- Grupovođa pravi lov sekcije (za danas) i upisuje sebe kao vođu.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013b1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id, sekcija_id) values
    ('77777777-0000-4000-8000-000000000131', krupa, 'Lov danas', current_date, auth.uid(), '55555555-0000-4000-8000-000000000131');
  insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'vodja');
end $$;
reset role;

-- Član sekcije se sam prijavi kao prisutan.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013c1', true); end $$;
do $$ begin
  insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'strijelac', true);
  -- ne smije: tuđe ime, druga uloga, bez oznake samoprijave, lov bez sekcije
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', '00000000-0000-0000-0000-0000000013c2', 'strijelac', true);
    raise exception 'FAIL: prijava u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000132', auth.uid(), 'strijelac', true);
    raise exception 'FAIL: prijava u lov bez sekcije';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013c2', true); end $$;
do $$ begin
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'vodja', true);
    raise exception 'FAIL: samoprijava kao vođa';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'strijelac', false);
    raise exception 'FAIL: samoprijava bez oznake';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Član druge sekcije i vanjski korisnik ne mogu.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013c3', true); end $$;
do $$ begin
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'strijelac', true);
    raise exception 'FAIL: član druge sekcije prijavljen';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013d1', true); end $$;
do $$ begin
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'strijelac', true);
    raise exception 'FAIL: vanjski korisnik prijavljen';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Grupovođa vidi prijavljene, dodaje drugog člana ručno i uklanja onog ko nije prisutan.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013b1', true); end $$;
do $$ declare n int; begin
  insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values ('77777777-0000-4000-8000-000000000131', '00000000-0000-0000-0000-0000000013c2', 'strijelac');
  select count(*) into n from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000131';
  if n <> 3 then raise exception 'FAIL: očekivano 3 učesnika, ima %', n; end if;
  delete from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000131' and korisnik_id = '00000000-0000-0000-0000-0000000013c1';
  select count(*) into n from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000131';
  if n <> 2 then raise exception 'FAIL: uklanjanje nije uspjelo'; end if;
end $$;
reset role;

-- Uklonjeni se ne može ponovo sam prijaviti; ručno dodani član ne može sam sebe izbrisati.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013c1', true); end $$;
do $$ begin
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'strijelac', true);
    raise exception 'FAIL: uklonjeni se ponovo prijavio';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013c2', true); end $$;
do $$ declare n int; begin
  delete from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000131' and korisnik_id = auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: ručno dodani član se sam izbrisao'; end if;
end $$;
reset role;

-- Organizator ponovo doda uklonjenog (briše zabranu); on se sam odjavi (ima samoprijavu = false → ne može), pa ga grupovođa vraća.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013b1', true); end $$;
do $$ begin
  insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values ('77777777-0000-4000-8000-000000000131', '00000000-0000-0000-0000-0000000013c1', 'strijelac');
  if exists (select 1 from public.lov_uklonjeni where korisnik_id = '00000000-0000-0000-0000-0000000013c1') then raise exception 'FAIL: zabrana nije skinuta'; end if;
end $$;
reset role;

-- Završen lov: samoprijava nije moguća.
update public.lovovi set status = 'zavrsen' where id = '77777777-0000-4000-8000-000000000131';
delete from public.lov_ucesnici where korisnik_id = '00000000-0000-0000-0000-0000000013c1';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000013c1', true); end $$;
do $$ begin
  begin
    insert into public.lov_ucesnici (lov_id, korisnik_id, uloga, samoprijava) values ('77777777-0000-4000-8000-000000000131', auth.uid(), 'strijelac', true);
    raise exception 'FAIL: prijava u završen lov';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
