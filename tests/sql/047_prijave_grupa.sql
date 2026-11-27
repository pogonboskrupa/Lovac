-- Test 047: prijava ulova može nositi grupu; poslije slanja se grupa ne mijenja; lovovođa sekcije vidi grupu prijave.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000047a1', 'lvs47@t', '{"ime":"Vođa","prezime":"Sekcije"}'),
  ('00000000-0000-0000-0000-0000000047b1', 'gv47@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000047c1', 'l47@t', '{"ime":"Lovac","prezime":"Jedan"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000047__';
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values ('55555555-0000-4000-8000-000000000471', krupa, 'Sekcija 47', '00000000-0000-0000-0000-0000000047a1');
  insert into public.sekcija_clanovi (sekcija_id, korisnik_id, status) values
    ('55555555-0000-4000-8000-000000000471', '00000000-0000-0000-0000-0000000047b1', 'odobren'),
    ('55555555-0000-4000-8000-000000000471', '00000000-0000-0000-0000-0000000047c1', 'odobren');
  insert into public.grupe (id, sekcija_id, grupovodja_id) values ('66666666-0000-4000-8000-000000000471', '55555555-0000-4000-8000-000000000471', '00000000-0000-0000-0000-0000000047b1');
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000047c1', true); end $$;
do $$
declare krupa uuid := (select id from public.reviri where naziv = 'Krupa');
begin
  insert into public.ulov_prijave (id, lovac_id, revir_id, sekcija_id, grupa_id, vrsta, vrijeme)
    values ('77777777-0000-4000-8000-000000000471', '00000000-0000-0000-0000-0000000047c1', krupa, '55555555-0000-4000-8000-000000000471', '66666666-0000-4000-8000-000000000471', 'divlja_svinja', now());
  -- grupa se poslije slanja ne mijenja
  begin
    update public.ulov_prijave set grupa_id = null where id = '77777777-0000-4000-8000-000000000471';
    raise exception 'FAIL: grupa prijave promijenjena';
  exception when insufficient_privilege then null; end;
  -- povlačenje i dalje radi
  update public.ulov_prijave set povucena = true where id = '77777777-0000-4000-8000-000000000471';
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000047a1', true); end $$;
do $$ begin assert (select count(*) from public.ulov_prijave where grupa_id = '66666666-0000-4000-8000-000000000471') = 1, 'lovovođa sekcije vidi prijavu grupe'; end $$;
reset role;
rollback;
