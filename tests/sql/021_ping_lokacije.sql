-- Test 021: "Gdje si?" — traži član/grupovođa/lovočuvar sekcije od člana sekcije; vide ga samo pošiljalac i primalac.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000021a1', 'admin21@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000021b1', 'gv21@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000021c1', 'clan21@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000021c2', 'clan21b@t', '{"ime":"Clan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000021c3', 'ceka21@t', '{"ime":"Clan","prezime":"Ceka"}'),
  ('00000000-0000-0000-0000-0000000021d1', 'lc21@t', '{"ime":"Lovocuvar","prezime":"Krupe"}'),
  ('00000000-0000-0000-0000-0000000021d2', 'van21@t', '{"ime":"Van","prezime":"Sekcije"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000021a1';
update public.korisnici set odobren = true where id in (
  '00000000-0000-0000-0000-0000000021b1', '00000000-0000-0000-0000-0000000021c1', '00000000-0000-0000-0000-0000000021c2',
  '00000000-0000-0000-0000-0000000021c3', '00000000-0000-0000-0000-0000000021d1', '00000000-0000-0000-0000-0000000021d2');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021a1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.revir_lovocuvari values (krupa, '00000000-0000-0000-0000-0000000021d1');
  insert into public.grupovodje values ('00000000-0000-0000-0000-0000000021b1', krupa);
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000211', krupa, 'Sekcija A', '00000000-0000-0000-0000-0000000021b1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c1', 'odobren'),
    ('55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c2', 'odobren'),
    ('55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c3', 'ceka');
end $$;
reset role;

-- Član traži člana: prolazi; ne u tuđe ime, ne neodobrenog, ne vanjskog, ne sebe; ponovo prebrzo ne.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021c1', true); end $$;
do $$ begin
  insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
    ('77777777-0000-4000-8000-000000000211', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c2');
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, od_id, za_id) values
      ('77777777-0000-4000-8000-000000000212', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c2', '00000000-0000-0000-0000-0000000021b1');
    raise exception 'FAIL: zahtjev u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
      ('77777777-0000-4000-8000-000000000213', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c3');
    raise exception 'FAIL: zahtjev neodobrenom članu';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
      ('77777777-0000-4000-8000-000000000214', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021d2');
    raise exception 'FAIL: zahtjev vanjskom korisniku';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
      ('77777777-0000-4000-8000-000000000215', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c1');
    raise exception 'FAIL: zahtjev samom sebi';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
      ('77777777-0000-4000-8000-000000000216', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c2');
    raise exception 'FAIL: dva zahtjeva u 2 minute';
  exception when raise_exception then
    if sqlerrm <> 'previse_zahtjeva' then raise; end if;
  end;
end $$;
reset role;

-- Vanjski korisnik ne može tražiti člana sekcije.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021d2', true); end $$;
do $$ begin
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
      ('77777777-0000-4000-8000-000000000217', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c1');
    raise exception 'FAIL: vanjski korisnik traži lokaciju';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Grupovođa i lovočuvar smiju tražiti člana.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021b1', true); end $$;
do $$ begin
  insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
    ('77777777-0000-4000-8000-000000000218', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c1');
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021d1', true); end $$;
do $$ begin
  insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
    ('77777777-0000-4000-8000-000000000219', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021c1');
  begin
    insert into public.lokacija_zahtjevi (id, sekcija_id, za_id) values
      ('77777777-0000-4000-8000-00000000021a', '55555555-0000-4000-8000-000000000211', '00000000-0000-0000-0000-0000000021d1');
    raise exception 'FAIL: lovočuvar traži lovočuvara (nije član/grupovođa)';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset role;

-- Vide samo pošiljalac i primalac (ne drugi član, ne admin).
do $$
declare uid text; n int; ocekivano int;
begin
  for uid, ocekivano in values
    ('00000000-0000-0000-0000-0000000021c1', 3), -- poslao 1, primio 2 (grupovođa i lovočuvar)
    ('00000000-0000-0000-0000-0000000021c2', 1),
    ('00000000-0000-0000-0000-0000000021b1', 1),
    ('00000000-0000-0000-0000-0000000021a1', 0),
    ('00000000-0000-0000-0000-0000000021d2', 0)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', uid, true);
    select count(*) into n from public.lokacija_zahtjevi;
    execute 'reset role';
    if n <> ocekivano then raise exception 'FAIL: % vidi % zahtjeva, očekivano %', uid, n, ocekivano; end if;
  end loop;
end $$;

-- Odgovara samo primalac, samo jednom, i ne mijenja ostala polja.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021c1', true); end $$;
do $$ declare o text; begin
  update public.lokacija_zahtjevi set odgovor = 'da' where id = '77777777-0000-4000-8000-000000000211';
  select odgovor into o from public.lokacija_zahtjevi where id = '77777777-0000-4000-8000-000000000211';
  if o is not null then raise exception 'FAIL: pošiljalac odgovorio umjesto primaoca'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021c2', true); end $$;
do $$ declare o text; t timestamptz; begin
  begin
    update public.lokacija_zahtjevi set odgovor = 'da', za_id = '00000000-0000-0000-0000-0000000021c1' where id = '77777777-0000-4000-8000-000000000211';
    raise exception 'FAIL: primalac mijenja primaoca';
  exception when insufficient_privilege then null; end;
  update public.lokacija_zahtjevi set odgovor = 'da' where id = '77777777-0000-4000-8000-000000000211';
  select odgovor, odgovoreno into o, t from public.lokacija_zahtjevi where id = '77777777-0000-4000-8000-000000000211';
  if o <> 'da' or t is null then raise exception 'FAIL: odgovor nije upisan'; end if;
  begin
    update public.lokacija_zahtjevi set odgovor = 'ne' where id = '77777777-0000-4000-8000-000000000211';
    raise exception 'FAIL: odgovor se mijenja';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Istekao zahtjev (stariji od 15 min) se ne može odgovoriti.
alter table public.lokacija_zahtjevi disable trigger cuvaj_lokacija_zahtjev;
update public.lokacija_zahtjevi set created_at = now() - interval '20 minutes' where id = '77777777-0000-4000-8000-000000000218';
alter table public.lokacija_zahtjevi enable trigger cuvaj_lokacija_zahtjev;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000021c1', true); end $$;
do $$ begin
  begin
    update public.lokacija_zahtjevi set odgovor = 'da' where id = '77777777-0000-4000-8000-000000000218';
    raise exception 'FAIL: odgovor na istekao zahtjev';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
