-- Test 027: zvanični objekat postavlja samo rukovodstvo i vidi ga cijelo društvo; lovcu se oznaka skida.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000027a1', 'gv27@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000027b1', 'lovac27@t', '{"ime":"Lovac","prezime":"Obični"}'),
  ('00000000-0000-0000-0000-0000000027c1', 'clan27@t', '{"ime":"Clan","prezime":"Drugi"}');
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000027a1', '00000000-0000-0000-0000-0000000027b1', '00000000-0000-0000-0000-0000000027c1');
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000271', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija 27', '00000000-0000-0000-0000-0000000027a1');

set local role authenticated;
-- 1) Grupovođa: zvanični objekat je uvijek za društvo, i kad ga pošalje kao privatan.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000027a1', true); end $$;
insert into public.objekti (id, vlasnik_id, vidljivost, lat, lon, podaci) values
  ('99999999-0000-4000-8000-000000000271', '00000000-0000-0000-0000-0000000027a1', 'privatno', 44.8, 16.1, '{"naziv":"Čeka društva","zvanicni":true}');

-- 2) Lovac: oznaka se skida, objekat ostaje privatan.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000027b1', true); end $$;
insert into public.objekti (id, vlasnik_id, vidljivost, lat, lon, podaci) values
  ('99999999-0000-4000-8000-000000000272', '00000000-0000-0000-0000-0000000027b1', 'privatno', 44.8, 16.1, '{"naziv":"Moja čeka","zvanicni":true}');
do $$ begin
  assert (select not (podaci ? 'zvanicni') and vidljivost = 'privatno' from public.objekti where id = '99999999-0000-4000-8000-000000000272'),
    'lovac ne može proglasiti objekat zvaničnim';
end $$;

-- 3) Drugi član društva vidi zvanični objekat sa oznakom.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000027c1', true); end $$;
do $$ begin
  assert (select vidljivost = 'drustvo' and (podaci ->> 'zvanicni')::boolean from public.objekti where id = '99999999-0000-4000-8000-000000000271'),
    'član vidi zvanični objekat društva';
  assert (select count(*) from public.objekti where id = '99999999-0000-4000-8000-000000000272') = 0, 'privatni objekat lovca ostaje privatan';
end $$;

-- 4) Ni izmjenom lovac ne može dodati oznaku.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000027b1', true); end $$;
update public.objekti set podaci = podaci || '{"zvanicni":true}', rev = rev + 1 where id = '99999999-0000-4000-8000-000000000272';
do $$ begin
  assert (select not (podaci ? 'zvanicni') from public.objekti where id = '99999999-0000-4000-8000-000000000272'), 'izmjena ne dodaje oznaku';
end $$;

rollback;
