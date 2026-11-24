-- Test 032: lov (i završen) briše admin ili grupovođa sekcije lova; član i grupovođa druge sekcije ne mogu;
-- brisanje povlači učesnike; nalog organizatora lova se može obrisati (organizator postaje prazan).
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000032a1', 'admin32@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000032b1', 'gv32@t', '{"ime":"Goran","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000032b2', 'gv32b@t', '{"ime":"Drugi","prezime":"Grupovođa"}'),
  ('00000000-0000-0000-0000-0000000032c1', 'clan32@t', '{"ime":"Clan","prezime":"Lovac"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-000000003%';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000032a1';
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000321', (select id from public.reviri where naziv = 'Krupa'), 'S32', '00000000-0000-0000-0000-0000000032b1'),
  ('55555555-0000-4000-8000-000000000322', (select id from public.reviri where naziv = 'Krupa'), 'S32b', '00000000-0000-0000-0000-0000000032b2');
insert into public.lovovi (id, revir_id, sekcija_id, naziv, datum, status, organizator_id) values
  ('77777777-0000-4000-8000-000000000321', (select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000321', 'L1', current_date, 'planiran', '00000000-0000-0000-0000-0000000032c1'),
  ('77777777-0000-4000-8000-000000000322', (select id from public.reviri where naziv = 'Krupa'), '55555555-0000-4000-8000-000000000321', 'L2', current_date, 'planiran', '00000000-0000-0000-0000-0000000032b1');
insert into public.lov_ucesnici (lov_id, korisnik_id, uloga) values
  ('77777777-0000-4000-8000-000000000321', '00000000-0000-0000-0000-0000000032c1', 'strijelac');
update public.lovovi set status = 'zavrsen';

set local role authenticated;
-- član i grupovođa druge sekcije ne mogu
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000032c1', true); end $$;
do $$ begin
  begin perform public.obrisi_lov('77777777-0000-4000-8000-000000000321'); raise exception 'član obrisao lov';
  exception when insufficient_privilege then null; end;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000032b2', true); end $$;
do $$ begin
  begin perform public.obrisi_lov('77777777-0000-4000-8000-000000000321'); raise exception 'tuđi grupovođa obrisao lov';
  exception when insufficient_privilege then null; end;
end $$;
-- grupovođa sekcije briše završen lov (sa učesnicima)
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000032b1', true); end $$;
do $$ begin assert public.obrisi_lov('77777777-0000-4000-8000-000000000321'), 'grupovođa briše'; end $$;
reset role;
do $$ begin
  assert not exists (select 1 from public.lovovi where id = '77777777-0000-4000-8000-000000000321'), 'lov obrisan';
  assert not exists (select 1 from public.lov_ucesnici where lov_id = '77777777-0000-4000-8000-000000000321'), 'učesnici obrisani';
end $$;
-- brisanje naloga grupovođe koji je organizovao lov (i kad brisanje ne pokreće admin, npr. kaskada iz auth.users):
-- lov ostaje sa praznim organizatorom, sekcija ostaje bez grupovođe
delete from public.korisnici where id = '00000000-0000-0000-0000-0000000032b1';
do $$ begin
  assert (select grupovodja_id is null from public.sekcije where id = '55555555-0000-4000-8000-000000000321'), 'sekcija bez grupovođe';
end $$;
do $$ begin
  assert (select organizator_id is null from public.lovovi where id = '77777777-0000-4000-8000-000000000322'), 'organizator postaje prazan';
end $$;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000032a1', true); end $$;
do $$ begin assert public.obrisi_lov('77777777-0000-4000-8000-000000000322'), 'admin briše'; end $$;

rollback;
