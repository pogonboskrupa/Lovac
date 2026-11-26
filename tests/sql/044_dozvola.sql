-- Test 044: broj lovačke dozvole vidi i mijenja samo vlasnik; predugačak broj se odbija.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000044a1', 'admin44@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000044b1', 'lovac44@t', '{"ime":"Lovro","prezime":"Lovac"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000044a1';
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-0000000044b1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044b1', true); end $$;
do $$ begin
  insert into public.profili_oprema (korisnik_id, oprema, dozvola) values (auth.uid(), '[]', 'LD-12345/2026');
  begin
    update public.profili_oprema set dozvola = repeat('x', 41);
    raise exception 'FAIL: predugačka dozvola prošla';
  exception when check_violation then null; end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000044a1', true); end $$;
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.profili_oprema;
  if n <> 0 then raise exception 'FAIL: admin vidi tuđu dozvolu'; end if;
  update public.profili_oprema set dozvola = 'hak';
end $$;
reset role;
do $$ begin
  if (select dozvola from public.profili_oprema) <> 'LD-12345/2026' then raise exception 'FAIL: dozvola promijenjena tuđom rukom'; end if;
end $$;
rollback;
