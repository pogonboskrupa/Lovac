-- Test 018: slike zapisa slijede vidljivost zapisa; velika slika ističe, sličica ostaje.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000018a1', 'admin18@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000018b1', 'vlasnik18@t', '{"ime":"Vlado","prezime":"Vlasnik"}'),
  ('00000000-0000-0000-0000-0000000018c1', 'drug18@t', '{"ime":"Drago","prezime":"Drug"}'),
  ('00000000-0000-0000-0000-0000000018d1', 'novi18@t', '{"ime":"Novo","prezime":"Neodobren"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000018a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000018b1', '00000000-0000-0000-0000-0000000018c1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000018b1', true); end $$;
do $$ begin
  insert into public.objekti (id, vidljivost, lat, lon, podaci) values
    ('11111111-0000-4000-8000-000000000181', 'privatno', 44.88, 16.15, '{"naziv":"Privatna čeka"}'),
    ('11111111-0000-4000-8000-000000000182', 'drustvo', 44.89, 16.15, '{"naziv":"Zajednička čeka"}');
  insert into public.slike_zapisa (id, zapis_store, zapis_id, mala, slika) values
    ('eeeeeeee-0000-4000-8000-000000000181', 'objekti', '11111111-0000-4000-8000-000000000181', 'data:image/jpeg;base64,AA', 'data:image/jpeg;base64,BBBB'),
    ('eeeeeeee-0000-4000-8000-000000000182', 'objekti', '11111111-0000-4000-8000-000000000182', 'data:image/jpeg;base64,CC', 'data:image/jpeg;base64,DDDD');
  if (select istice from public.slike_zapisa where id = 'eeeeeeee-0000-4000-8000-000000000181') < now() + interval '13 days' then raise exception 'FAIL: rok trajanja'; end if;
end $$;
reset role;

-- Drug vidi sliku zajedničke čeke, ne i privatne; ne može dodati sliku tuđem zapisu; neodobren ne vidi ništa.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000018c1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.slike_zapisa;
  if n <> 1 then raise exception 'FAIL: drug vidi % slika (očekivano 1)', n; end if;
  if not exists (select 1 from public.slike_zapisa where id = 'eeeeeeee-0000-4000-8000-000000000182') then raise exception 'FAIL: nema slike zajedničke čeke'; end if;
  begin
    insert into public.slike_zapisa (id, zapis_store, zapis_id, mala) values ('eeeeeeee-0000-4000-8000-000000000183', 'objekti', '11111111-0000-4000-8000-000000000182', 'x');
    raise exception 'FAIL: slika na tuđi zapis';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.slike_zapisa (id, zapis_store, zapis_id, vlasnik_id, mala) values ('eeeeeeee-0000-4000-8000-000000000184', 'objekti', '11111111-0000-4000-8000-000000000182', '00000000-0000-0000-0000-0000000018b1', 'x');
    raise exception 'FAIL: slika u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.slike_zapisa where id = 'eeeeeeee-0000-4000-8000-000000000182';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: obrisana tuđa slika'; end if;
  end;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000018a1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.slike_zapisa;
  if n <> 1 then raise exception 'FAIL: admin vidi % slika (očekivano samo zajedničku)', n; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000018d1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.slike_zapisa;
  if n <> 0 then raise exception 'FAIL: neodobren vidi slike'; end if;
end $$;
reset role;

-- Istek: velika slika zapisa postaje null (sličica ostaje), velika slika lova se briše.
update public.slike_zapisa set istice = now() - interval '1 minute';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000018b1', true); end $$;
do $$ declare n int; begin
  n := public.ocisti_istekle_slike();
  if n < 2 then raise exception 'FAIL: očišćeno % (očekivano ≥ 2)', n; end if;
  if exists (select 1 from public.slike_zapisa where slika is not null) then raise exception 'FAIL: velika slika nije obrisana'; end if;
  if (select count(*) from public.slike_zapisa where mala is not null) <> 2 then raise exception 'FAIL: sličica nestala'; end if;
end $$;
reset role;

-- Poziv bez prijave / anon nije moguć.
do $$ begin
  if has_function_privilege('anon', 'public.ocisti_istekle_slike()', 'execute') then raise exception 'FAIL: anon čisti slike'; end if;
end $$;

rollback;
