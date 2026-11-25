-- Test 037: lokaciju sa izabranim lovcima vide samo lovac i primalac (ne administrator ni treći), samo dok traje;
-- ne može se dijeliti u tuđe ime, sa neodobrenim nalogom, sa sobom, duže od 24 h, a primalac ne može mijenjati.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000037a1', 'admin37@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000037c1', 'x37@t', '{"ime":"Xavi","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000037c2', 'y37@t', '{"ime":"Yan","prezime":"Dva"}'),
  ('00000000-0000-0000-0000-0000000037c3', 'z37@t', '{"ime":"Zlatan","prezime":"Tri"}'),
  ('00000000-0000-0000-0000-0000000037c4', 'n37@t', '{"ime":"Novi","prezime":"Neodobren"}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000037%' and id::text <> '00000000-0000-0000-0000-0000000037c4';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000037a1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000037c1', true); end $$;
-- x dijeli sa y i z (1 sat); lažni vlasnik se zamijeni pravim
insert into public.lokacije_izabranih (vlasnik_id, primalac_id, lat, lon, do_) values
  ('00000000-0000-0000-0000-0000000037c3', '00000000-0000-0000-0000-0000000037c2', 44.88, 16.15, now() + interval '1 hour');
insert into public.lokacije_izabranih (primalac_id, lat, lon, do_) values
  ('00000000-0000-0000-0000-0000000037c3', 44.88, 16.15, now() + interval '1 hour');
do $$ begin
  assert (select count(*) from public.lokacije_izabranih where vlasnik_id = '00000000-0000-0000-0000-0000000037c1') = 2, 'vlasnik postavlja server';
  begin insert into public.lokacije_izabranih (primalac_id, lat, lon, do_) values ('00000000-0000-0000-0000-0000000037c1', 1, 1, now() + interval '1 hour'); raise exception 'FAIL: sa sobom';
  exception when others then if sqlstate in ('P0001') then raise; end if; end;
  begin insert into public.lokacije_izabranih (primalac_id, lat, lon, do_) values ('00000000-0000-0000-0000-0000000037c4', 1, 1, now() + interval '1 hour'); raise exception 'FAIL: neodobren primalac';
  exception when insufficient_privilege then null; end;
end $$;
-- duže od 24 h
do $$ begin
  begin update public.lokacije_izabranih set do_ = now() + interval '3 days'; raise exception 'FAIL: preko 24 h';
  exception when insufficient_privilege then null; end;
end $$;
-- y vidi x; z vidi x; admin ne vidi; y ne može mijenjati ni brisati tuđe
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000037c2', true); end $$;
do $$ begin
  assert (select count(*) from public.lokacije_izabranih) = 1, 'y vidi samo red za sebe';
  update public.lokacije_izabranih set lat = 0;
  delete from public.lokacije_izabranih;
end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000037a1', true); end $$;
do $$ begin assert (select count(*) from public.lokacije_izabranih) = 0, 'admin ne vidi'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000037c4', true); end $$;
do $$ begin assert (select count(*) from public.lokacije_izabranih) = 0, 'neodobren ne vidi'; end $$;
reset role;
do $$ begin
  assert (select count(*) from public.lokacije_izabranih) = 2, 'primalac nije mogao izmijeniti/obrisati tuđe';
  assert (select min(lat) from public.lokacije_izabranih) = 44.88, 'primalac nije promijenio lat';
end $$;
-- istekla se ne vidi; vlasnik briše svoje
update public.lokacije_izabranih set do_ = now() - interval '1 minute' where primalac_id = '00000000-0000-0000-0000-0000000037c3';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000037c3', true); end $$;
do $$ begin assert (select count(*) from public.lokacije_izabranih) = 0, 'istekla se ne vidi'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000037c1', true); end $$;
delete from public.lokacije_izabranih;
reset role;
do $$ begin assert (select count(*) from public.lokacije_izabranih) = 0, 'vlasnik obrisao svoje'; end $$;
-- brisanje naloga ne smije puknuti zbog ove tabele
insert into public.lokacije_izabranih (vlasnik_id, primalac_id, lat, lon, do_) values
  ('00000000-0000-0000-0000-0000000037c1', '00000000-0000-0000-0000-0000000037c2', 1, 1, now() + interval '1 hour');
delete from public.korisnici where id = '00000000-0000-0000-0000-0000000037c2';
do $$ begin assert (select count(*) from public.lokacije_izabranih) = 0, 'kaskada pri brisanju primaoca'; end $$;
rollback;
