-- Test 002: nadimak / broj člana iz registracije se upisuje u profil.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'm1@t', '{"ime":"Mujo","prezime":"Mujić"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'm2@t', '{"ime":"Mujo","prezime":"Mujić","nadimak":"  127  "}'),
  ('00000000-0000-0000-0000-0000000000d3', 'm3@t', '{"ime":"Mujo","prezime":"Mujić","nadimak":"012345678901234567890123"}');

do $$ begin
  assert (select nadimak is null from public.korisnici where id = '00000000-0000-0000-0000-0000000000d1'),
    'bez nadimka ostaje null';
  assert (select nadimak = '127' from public.korisnici where id = '00000000-0000-0000-0000-0000000000d2'),
    'nadimak se upisuje očišćen';
  assert (select length(nadimak) = 20 from public.korisnici where id = '00000000-0000-0000-0000-0000000000d3'),
    'nadimak je ograničen na 20 znakova';
end $$;

rollback;
