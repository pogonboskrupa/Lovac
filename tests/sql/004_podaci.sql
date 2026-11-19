-- Test 004: vidljivost zapisa (privatno / drustvo / izabrani) provodi server; admin ne vidi privatno.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000004a1', 'admin4@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000004b1', 'vlasnik4@t', '{"ime":"Vlado","prezime":"Vlasnik"}'),
  ('00000000-0000-0000-0000-0000000004c1', 'drug4@t', '{"ime":"Drago","prezime":"Drug"}'),
  ('00000000-0000-0000-0000-0000000004d1', 'treci4@t', '{"ime":"Tomo","prezime":"Treći"}'),
  ('00000000-0000-0000-0000-0000000004e1', 'novi4@t', '{"ime":"Novo","prezime":"Neodobren"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000004a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000004b1', '00000000-0000-0000-0000-0000000004c1', '00000000-0000-0000-0000-0000000004d1');

-- Vlasnik unosi tri zapisa.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004b1', true); end $$;
do $$ begin
  insert into public.objekti (id, vidljivost, lat, lon, podaci) values
    ('11111111-0000-4000-8000-000000000001', 'privatno', 44.88, 16.15, '{"naziv":"Moja tajna čeka"}'),
    ('11111111-0000-4000-8000-000000000002', 'drustvo', 44.89, 16.15, '{"naziv":"Zajedničko hranilište"}'),
    ('11111111-0000-4000-8000-000000000003', 'izabrani', 44.90, 16.15, '{"naziv":"Za Dragu"}');
  update public.objekti set dijeli_sa = array['00000000-0000-0000-0000-0000000004c1']::uuid[], rev = 2
   where id = '11111111-0000-4000-8000-000000000003';
  assert (select count(*) from public.objekti) = 3, 'vlasnik vidi sve svoje';

  begin
    insert into public.objekti (id, vlasnik_id, lat, lon) values
      ('11111111-0000-4000-8000-000000000009', '00000000-0000-0000-0000-0000000004c1', 1, 1);
    raise exception 'FAIL: unos u tuđe ime prošao';
  exception when insufficient_privilege then null;
  end;

  -- Zakašnjela starija verzija (rev 1) ne prepisuje noviju (rev 2).
  update public.objekti set podaci = '{"naziv":"STARO"}', rev = 1 where id = '11111111-0000-4000-8000-000000000003';
  assert (select podaci->>'naziv' from public.objekti where id = '11111111-0000-4000-8000-000000000003') = 'Za Dragu',
    'stariji rev ne smije prepisati noviji';
  -- Vlasnik se ne može prebaciti na drugoga.
  update public.objekti set vlasnik_id = '00000000-0000-0000-0000-0000000004c1', rev = 3 where id = '11111111-0000-4000-8000-000000000002';
end $$;
reset role;

do $$ begin
  assert (select vlasnik_id = '00000000-0000-0000-0000-0000000004b1' from public.objekti where id = '11111111-0000-4000-8000-000000000002'),
    'vlasnik zapisa se ne mijenja';
end $$;

-- Drago (izabran): vidi društvo + njemu podijeljeno, ne vidi privatno.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004c1', true); end $$;
do $$ begin
  assert (select count(*) from public.objekti) = 2, 'izabrani vidi drustvo + izabrani';
  assert not exists (select 1 from public.objekti where vidljivost = 'privatno'), 'izabrani ne vidi privatno';
  update public.objekti set podaci = '{"naziv":"hak"}', rev = 99 where id = '11111111-0000-4000-8000-000000000002';
  delete from public.objekti where id = '11111111-0000-4000-8000-000000000002';
  begin
    insert into public.objekti (id, lat, lon) values ('11111111-0000-4000-8000-000000000002', 0, 0)
    on conflict (id) do update set podaci = '{"naziv":"preuzeto"}';
    raise exception 'FAIL: upsert preko tuđeg zapisa prošao';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  assert (select podaci->>'naziv' from public.objekti where id = '11111111-0000-4000-8000-000000000002') = 'Zajedničko hranilište',
    'tuđi lovac ne smije mijenjati ni brisati podijeljen zapis';
end $$;

-- Tomo (nije izabran): samo društvo.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004d1', true); end $$;
do $$ begin
  assert (select count(*) from public.objekti) = 1, 'neizabran vidi samo drustvo';
end $$;
reset role;

-- Admin: vidi društvo, NE vidi privatno ni izabrane drugih.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004a1', true); end $$;
do $$ begin
  assert (select count(*) from public.objekti) = 1, 'admin vidi samo ono što je podijeljeno sa društvom';
  assert not exists (select 1 from public.objekti where vidljivost = 'privatno'), 'admin NE vidi privatno';
end $$;
reset role;

-- Neodobren ne vidi ništa i ne može unositi.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000004e1', true); end $$;
do $$ begin
  assert (select count(*) from public.objekti) = 0, 'neodobren ne vidi ništa';
  begin
    insert into public.opazanja (id, lat, lon) values ('22222222-0000-4000-8000-000000000001', 1, 1);
    raise exception 'FAIL: neodobren unio opažanje';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- anon nema pristup
set local role anon;
do $$ begin
  begin
    perform 1 from public.tragovi;
    raise exception 'FAIL: anon čita tragove';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
