-- Test 031: lovac prijavljuje lovočuvaru; vidi autor, lovočuvar tog revira i admin, ne drugi lovac ni lovočuvar
-- drugog revira; autor ne mijenja dojavu; lovočuvar mijenja samo status/odgovor, server bilježi ko.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000031a1', 'admin31@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000031c1', 'lc31@t', '{"ime":"Luka","prezime":"Lovočuvar"}'),
  ('00000000-0000-0000-0000-0000000031c2', 'lc31b@t', '{"ime":"Otok","prezime":"Lovočuvar"}'),
  ('00000000-0000-0000-0000-0000000031d1', 'lov31@t', '{"ime":"Lovro","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000031d2', 'lov31b@t', '{"ime":"Drugi","prezime":"Lovac"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-000000003%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000031a1';
insert into public.revir_lovocuvari (korisnik_id, revir_id) values
  ('00000000-0000-0000-0000-0000000031c1', (select id from public.reviri where naziv = 'Krupa')),
  ('00000000-0000-0000-0000-0000000031c2', (select id from public.reviri where naziv = 'Otoka'));

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031d1', true); end $$;
-- lovac podmeće status i odgovor: server ih poništava
insert into public.dojave (id, revir_id, vrsta, opis, lat, lon, status, odgovor) values
  ('99999999-0000-4000-8000-000000000311', (select id from public.reviri where naziv = 'Krupa'), 'krivolov', 'Pucnji noću kod potoka', 44.88, 16.15, 'rijesena', 'hak');
do $$ begin
  assert (select status = 'nova' and odgovor is null and autor_id = auth.uid() from public.dojave where id = '99999999-0000-4000-8000-000000000311'), 'nova dojava';
end $$;
-- autor ne mijenja dojavu (nema prava na update)
update public.dojave set opis = 'promijenjeno', status = 'rijesena' where id = '99999999-0000-4000-8000-000000000311';
do $$ begin
  assert (select opis = 'Pucnji noću kod potoka' and status = 'nova' from public.dojave where id = '99999999-0000-4000-8000-000000000311'), 'autor ne mijenja';
end $$;

-- autor uklanja svoju dojavu (mekano), ali ni tada ne dira status/odgovor
update public.dojave set uklonjena = true, status = 'rijesena', odgovor = 'hak' where id = '99999999-0000-4000-8000-000000000311';
do $$ begin
  assert (select uklonjena and status = 'nova' and odgovor is null from public.dojave where id = '99999999-0000-4000-8000-000000000311'), 'autor uklanja';
end $$;
update public.dojave set uklonjena = false where id = '99999999-0000-4000-8000-000000000311';

-- drugi lovac i lovočuvar drugog revira ne vide
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031d2', true); end $$;
do $$ begin assert (select count(*) from public.dojave) = 0, 'drugi lovac ne vidi'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031c2', true); end $$;
do $$ begin assert (select count(*) from public.dojave) = 0, 'lovočuvar drugog revira ne vidi'; end $$;

-- lovočuvar revira vidi i preuzima; opis ne može mijenjati
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031c1', true); end $$;
update public.dojave set status = 'preuzeta', odgovor = 'Izlazim na teren', opis = 'hak' where id = '99999999-0000-4000-8000-000000000311';
do $$ begin
  assert (select status = 'preuzeta' and odgovor = 'Izlazim na teren' and opis = 'Pucnji noću kod potoka'
          and rijesio = '00000000-0000-0000-0000-0000000031c1' from public.dojave where id = '99999999-0000-4000-8000-000000000311'), 'lovočuvar obrađuje';
  begin
    delete from public.dojave;
    raise exception 'dojava obrisana';
  exception when insufficient_privilege then null;
  end;
end $$;

-- lovočuvar revira uklanja tuđu dojavu; lovac koji nije autor ne može
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031c1', true); end $$;
update public.dojave set uklonjena = true where id = '99999999-0000-4000-8000-000000000311';
do $$ begin assert (select uklonjena from public.dojave where id = '99999999-0000-4000-8000-000000000311'), 'lovočuvar uklanja'; end $$;
update public.dojave set uklonjena = false where id = '99999999-0000-4000-8000-000000000311';

-- admin vidi; autor vidi odgovor
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031a1', true); end $$;
do $$ begin assert (select count(*) from public.dojave) = 1, 'admin vidi'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000031d1', true); end $$;
do $$ begin assert (select odgovor from public.dojave) = 'Izlazim na teren', 'autor vidi odgovor'; end $$;

rollback;
