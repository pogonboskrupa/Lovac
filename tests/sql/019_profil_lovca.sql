-- Test 019: profil (avatar, pas) vide svi odobreni; oprema samo vlasnik; pisati može samo vlasnik.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000019a1', 'admin19@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000019b1', 'lovac19@t', '{"ime":"Lovro","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000019c1', 'drug19@t', '{"ime":"Drago","prezime":"Drug"}'),
  ('00000000-0000-0000-0000-0000000019d1', 'novi19@t', '{"ime":"Novo","prezime":"Neodobren"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000019a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000019b1', '00000000-0000-0000-0000-0000000019c1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000019b1', true); end $$;
do $$ begin
  insert into public.profili (korisnik_id, avatar, pas_ime, pas_slika) values (auth.uid(), 'data:image/jpeg;base64,AA', 'Rex', 'data:image/jpeg;base64,BB');
  insert into public.profili_oprema (korisnik_id, oprema) values (auth.uid(), '[{"vrsta":"puska","opis":"Sauer 202 .308"}]');
  begin
    insert into public.profili (korisnik_id, pas_ime) values ('00000000-0000-0000-0000-0000000019c1', 'tuđi');
    raise exception 'FAIL: profil u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.profili_oprema (korisnik_id, oprema) values ('00000000-0000-0000-0000-0000000019c1', '[]');
    raise exception 'FAIL: oprema u tuđe ime';
  exception when insufficient_privilege then null; end;
  begin
    update public.profili_oprema set oprema = '{"nije":"niz"}';
    raise exception 'FAIL: oprema nije niz';
  exception when check_violation then null; end;
end $$;
reset role;

-- Drug i admin vide profil, ali ne i opremu; drug ne mijenja tuđi profil.
do $$
declare uid text; n int; m int;
begin
  foreach uid in array array['00000000-0000-0000-0000-0000000019c1', '00000000-0000-0000-0000-0000000019a1'] loop
    perform set_config('request.jwt.claim.sub', uid, true);
    set local role authenticated;
    select count(*) into n from public.profili;
    select count(*) into m from public.profili_oprema;
    if n <> 1 then raise exception 'FAIL: % ne vidi profil', uid; end if;
    if m <> 0 then raise exception 'FAIL: % vidi tuđu opremu', uid; end if;
    update public.profili set pas_ime = 'hak';
    reset role;
    if (select pas_ime from public.profili) <> 'Rex' then raise exception 'FAIL: % izmijenio tuđi profil', uid; end if;
  end loop;
end $$;

-- Neodobren ne vidi ništa.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000019d1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.profili;
  if n <> 0 then raise exception 'FAIL: neodobren vidi profile'; end if;
end $$;
reset role;

rollback;
