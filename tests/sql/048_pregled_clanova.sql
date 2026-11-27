-- Test 048: predsjednik i lovočuvar udruženja vide članove svih sekcija, lovovođa revira samo svog revira,
-- običan član tuđe sekcije ne vidi ništa.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000048a1', 'pred48@t', '{"ime":"Pred","prezime":"Sjednik"}'),
  ('00000000-0000-0000-0000-0000000048a2', 'lcd48@t', '{"ime":"Luka","prezime":"Udruženja"}'),
  ('00000000-0000-0000-0000-0000000048a3', 'lvr48@t', '{"ime":"Vođa","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000048b1', 'k1@t', '{"ime":"Clan","prezime":"Krupa"}'),
  ('00000000-0000-0000-0000-0000000048b2', 'k2@t', '{"ime":"Clan","prezime":"Otoka"}'),
  ('00000000-0000-0000-0000-0000000048b3', 'k3@t', '{"ime":"Clan","prezime":"Treci"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000048__';
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
        otoka uuid := (select id from public.reviri where naziv = 'Otoka');
begin
  insert into public.sekcije (id, revir_id, naziv) values ('55555555-0000-4000-8000-000000000481', krupa, 'S Krupa 48'), ('55555555-0000-4000-8000-000000000482', otoka, 'S Otoka 48');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000481', '00000000-0000-0000-0000-0000000048b1', 'odobren'),
    ('55555555-0000-4000-8000-000000000482', '00000000-0000-0000-0000-0000000048b2', 'odobren'),
    ('55555555-0000-4000-8000-000000000482', '00000000-0000-0000-0000-0000000048b3', 'odobren');
  insert into public.drustvo_uloge values ('00000000-0000-0000-0000-0000000048a1', 'predsjednik'), ('00000000-0000-0000-0000-0000000048a2', 'lovocuvar');
  insert into public.revir_vodje values (krupa, '00000000-0000-0000-0000-0000000048a3');
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000048a1', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_clanovi where sekcija_id::text like '55555555-0000-4000-8000-00000000048%') = 3, 'predsjednik vidi sve'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000048a2', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_clanovi where sekcija_id::text like '55555555-0000-4000-8000-00000000048%') = 3, 'lovočuvar udruženja vidi sve'; end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000048a3', true); end $$;
do $$ begin
  assert (select count(*) from public.sekcija_clanovi where sekcija_id::text like '55555555-0000-4000-8000-00000000048%') = 1, 'lovovođa revira vidi samo svoj revir';
  assert (select count(*) from public.sekcija_clanovi where sekcija_id = '55555555-0000-4000-8000-000000000482') = 0, 'ne vidi Otoku';
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000048b1', true); end $$;
do $$ begin assert (select count(*) from public.sekcija_clanovi where sekcija_id = '55555555-0000-4000-8000-000000000482') = 0, 'običan član ne vidi tuđu sekciju'; end $$;
reset role;
rollback;
