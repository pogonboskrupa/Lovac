-- Test 042: imena mjesta na Terenu — upisuje samo administrator, čitaju svi odobreni (i probni), anon ništa;
-- autor se ne može lažirati ni mijenjati, skidanje je aktivno = false, a updated_at raste (kursor za pull).
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000042a1', 'admin42@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000042c1', 'clan42@t', '{"ime":"Clan","prezime":"Jedan"}'),
  ('00000000-0000-0000-0000-0000000042c2', 'tuđ42@t', '{"ime":"Neodobren","prezime":"Dva"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000042a1';
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-0000000042c1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000042a1', true); end $$;
-- admin upisuje (lažni autor se zamijeni pravim); naziv se trimuje na klijentu, server provjerava dužinu
insert into public.teren_tacke (id, naziv, vrsta, lat, lon, autor_id) values
  ('42000000-0000-4000-8000-000000000001', 'Pjanić', 'naselje', 44.88, 16.15, '00000000-0000-0000-0000-0000000042c1');
do $$ begin
  assert (select autor_id from public.teren_tacke) = '00000000-0000-0000-0000-0000000042a1', 'autora postavlja server';
  begin insert into public.teren_tacke (id, naziv, lat, lon) values ('42000000-0000-4000-8000-000000000002', '   ', 1, 1); raise exception 'FAIL: prazan naziv';
  exception when check_violation then null; end;
  begin insert into public.teren_tacke (id, naziv, vrsta, lat, lon) values ('42000000-0000-4000-8000-000000000003', 'X', 'nepoznato', 1, 1); raise exception 'FAIL: vrsta';
  exception when check_violation then null; end;
  begin insert into public.teren_tacke (id, naziv, lat, lon) values ('42000000-0000-4000-8000-000000000004', 'Daleko', 95, 1); raise exception 'FAIL: lat';
  exception when check_violation then null; end;
end $$;
-- izmjena: autor i created_at ostaju, updated_at raste
do $$
declare prije timestamptz := (select updated_at from public.teren_tacke);
begin
  perform pg_sleep(0.01);
  update public.teren_tacke set naziv = 'Pjanić gaj', autor_id = '00000000-0000-0000-0000-0000000042c1';
  assert (select autor_id from public.teren_tacke) = '00000000-0000-0000-0000-0000000042a1', 'autor se ne mijenja';
  assert (select updated_at from public.teren_tacke) > prije, 'updated_at raste';
end $$;

-- običan član čita, ali ne upisuje ni mijenja
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000042c1', true); end $$;
do $$ begin
  assert (select count(*) from public.teren_tacke) = 1, 'član vidi imena mjesta';
  begin insert into public.teren_tacke (id, naziv, lat, lon) values ('42000000-0000-4000-8000-000000000005', 'Moje', 1, 1); raise exception 'FAIL: član upisuje';
  exception when insufficient_privilege then null; end;
  update public.teren_tacke set naziv = 'Hakovano';
  begin delete from public.teren_tacke; raise exception 'FAIL: član briše';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select naziv from public.teren_tacke) = 'Pjanić gaj', 'član nije mogao izmijeniti ni obrisati';
end $$;

-- neodobren nalog (bez probnog perioda) ne vidi ništa
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000042c2', true); end $$;
do $$ begin assert (select count(*) from public.teren_tacke) = 0, 'neodobren ne vidi'; end $$;

-- admin skida tačku (aktivno = false) — red ostaje
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000042a1', true); end $$;
update public.teren_tacke set aktivno = false;
do $$ begin assert (select aktivno from public.teren_tacke) = false, 'skinuta'; end $$;
reset role;

-- anon nema pristup
set local role anon;
do $$ begin
  begin perform count(*) from public.teren_tacke; raise exception 'FAIL: anon čita';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- brisanje autora ne smije puknuti zbog ove tabele
delete from public.korisnici where id = '00000000-0000-0000-0000-0000000042a1';
do $$ begin assert (select autor_id from public.teren_tacke) is null, 'autor postavljen na null'; end $$;
rollback;
