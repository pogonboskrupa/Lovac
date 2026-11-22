-- Test 024: statistika po bosanskom vremenu (granica godine/mjeseca) i odgovor na "Gdje si?" mora imati vrijednost.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000024a1', 'admin24@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000024b1', 'gv24@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000024c1', 'clan24@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000024c2', 'clan24b@t', '{"ime":"Clan","prezime":"Dva"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000024a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000024b1', '00000000-0000-0000-0000-0000000024c1', '00000000-0000-0000-0000-0000000024c2');

do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000024b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000241', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000024b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000241', '00000000-0000-0000-0000-0000000024c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000241', '00000000-0000-0000-0000-0000000024c2', 'odobren');
  -- 31.12.2025. 23:30 UTC = 1.1.2026. 00:30 u Sarajevu; 31.12.2025. 22:30 UTC = 23:30 u Sarajevu (još 2025.)
  insert into public.ulov_prijave (id, lovac_id, revir_id, sekcija_id, vrsta, tezina, vrijeme) values
    ('88888888-0000-4000-8000-000000000241', '00000000-0000-0000-0000-0000000024c1', krupa, '55555555-0000-4000-8000-000000000241', 'zec', 3, '2025-12-31 23:30+00'),
    ('88888888-0000-4000-8000-000000000242', '00000000-0000-0000-0000-0000000024c1', krupa, '55555555-0000-4000-8000-000000000241', 'srna', 20, '2025-12-31 22:30+00');
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000024b1', true); end $$;
do $$ declare n int; v text; m date; r record; begin
  -- 2026: samo prijava iz 00:30 lokalno
  select count(*), min(vrsta), min(mjesec) into n, v, m from public.statistika_ulov('55555555-0000-4000-8000-000000000241', null, '2026-01-01', '2026-12-31');
  if n <> 1 or v <> 'zec' or m <> date '2026-01-01' then raise exception 'FAIL 2026: % % %', n, v, m; end if;
  -- 2025: druga prijava, u decembru
  select count(*), min(vrsta), min(mjesec) into n, v, m from public.statistika_ulov('55555555-0000-4000-8000-000000000241', null, '2025-01-01', '2025-12-31');
  if n <> 1 or v <> 'srna' or m <> date '2025-12-01' then raise exception 'FAIL 2025: % % %', n, v, m; end if;
  -- rejting po godini koristi isto pravilo
  select * into r from public.rejting_podaci('55555555-0000-4000-8000-000000000241', null, '2026-01-01', '2026-12-31') where korisnik_id = '00000000-0000-0000-0000-0000000024c1';
  if r.komada <> 1 then raise exception 'FAIL rejting 2026: %', r.komada; end if;
end $$;
reset role;

-- Odgovor bez vrijednosti se odbija; sa vrijednošću prolazi.
insert into public.lokacija_zahtjevi (id, sekcija_id, od_id, za_id) values
  ('77777777-0000-4000-8000-000000000241', '55555555-0000-4000-8000-000000000241', '00000000-0000-0000-0000-0000000024c1', '00000000-0000-0000-0000-0000000024c2');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000024c2', true); end $$;
do $$ declare o text; begin
  begin
    update public.lokacija_zahtjevi set odgovor = null where id = '77777777-0000-4000-8000-000000000241';
    raise exception 'FAIL: odgovor bez vrijednosti';
  exception when insufficient_privilege then null; end;
  update public.lokacija_zahtjevi set odgovor = 'ne' where id = '77777777-0000-4000-8000-000000000241';
  select odgovor into o from public.lokacija_zahtjevi where id = '77777777-0000-4000-8000-000000000241';
  if o <> 'ne' then raise exception 'FAIL: odgovor ne prolazi'; end if;
end $$;
reset role;

rollback;
