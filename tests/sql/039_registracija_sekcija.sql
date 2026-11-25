-- Test 039: izbor sekcije pri registraciji pravi zahtjev; spisak je javan; prebacivanje samo za upravljače.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000039a1', 'admin39@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000039b1', 'gv39@t', '{"ime":"Goran","prezime":"Gv"}'),
  ('00000000-0000-0000-0000-0000000039c1', 'lov39@t', '{"ime":"Lovac","prezime":"Jedan"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000039a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000039b1', '00000000-0000-0000-0000-0000000039c1');
insert into public.sekcije (id, revir_id, naziv, grupovodja_id) values
  ('55555555-0000-4000-8000-000000000391', (select id from public.reviri where naziv = 'Krupa'), 'Sekcija A', '00000000-0000-0000-0000-0000000039b1'),
  ('55555555-0000-4000-8000-000000000392', (select id from public.reviri where naziv = 'Otoka'), 'Sekcija B', null),
  ('55555555-0000-4000-8000-000000000393', (select id from public.reviri where naziv = 'Otoka'), 'Skrivena', null);
update public.sekcije set aktivno = false where id = '55555555-0000-4000-8000-000000000393';

-- registracija sa izabranom sekcijom; nevažeći i neaktivni izbor se ignoriše
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000039d1', 'n39@t', '{"ime":"Novi","prezime":"Lovac","probni":"true","sekcija":"55555555-0000-4000-8000-000000000391"}'),
  ('00000000-0000-0000-0000-0000000039d2', 'n39b@t', '{"ime":"Bez","prezime":"Izbora","probni":"true","sekcija":"nije-uuid"}'),
  ('00000000-0000-0000-0000-0000000039d3', 'n39c@t', '{"ime":"Skrivena","prezime":"Sekcija","probni":"true","sekcija":"55555555-0000-4000-8000-000000000393"}'),
  ('00000000-0000-0000-0000-0000000039d4', 'n39d@t', '{"ime":"Bez","prezime":"Probnog","sekcija":"55555555-0000-4000-8000-000000000391"}');
do $$ begin
  assert (select status from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000039d1') = 'ceka', 'zahtjev napravljen';
  assert not exists (select 1 from public.sekcija_clanovi where korisnik_id in ('00000000-0000-0000-0000-0000000039d2', '00000000-0000-0000-0000-0000000039d3', '00000000-0000-0000-0000-0000000039d4')), 'nevažeći izbor ne pravi zahtjev';
  assert (select not odobren from public.korisnici where id = '00000000-0000-0000-0000-0000000039d1'), 'izbor sekcije ne odobrava nalog';
end $$;

-- spisak je dostupan i bez prijave (anon), samo aktivne sekcije
set local role anon;
do $$ begin
  assert (select count(*) from public.javne_sekcije() where sekcija_id in ('55555555-0000-4000-8000-000000000391', '55555555-0000-4000-8000-000000000392')) = 2, 'javne sekcije';
  assert not exists (select 1 from public.javne_sekcije() where sekcija_id = '55555555-0000-4000-8000-000000000393'), 'neaktivna se ne vidi';
end $$;
reset role;

-- običan lovac ne može prebaciti zahtjev
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000039c1', true); end $$;
do $$ begin
  begin
    perform public.premjesti_zahtjev('55555555-0000-4000-8000-000000000391', '55555555-0000-4000-8000-000000000392', '00000000-0000-0000-0000-0000000039d1');
    raise exception 'lovac je prebacio';
  exception when insufficient_privilege then null;
  end;
end $$;
-- admin prebacuje u drugu sekciju
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000039a1', true); end $$;
select public.premjesti_zahtjev('55555555-0000-4000-8000-000000000391', '55555555-0000-4000-8000-000000000392', '00000000-0000-0000-0000-0000000039d1');
reset role;
do $$ begin
  assert (select sekcija_id from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000039d1') = '55555555-0000-4000-8000-000000000392', 'zahtjev prebačen';
  assert (select count(*) from public.sekcija_clanovi where korisnik_id = '00000000-0000-0000-0000-0000000039d1') = 1, 'samo jedan zahtjev';
end $$;
-- grupovođa izvorne sekcije smije; ne smije za sekciju koju ne vodi
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000039b1', true); end $$;
do $$ begin
  begin
    perform public.premjesti_zahtjev('55555555-0000-4000-8000-000000000392', '55555555-0000-4000-8000-000000000391', '00000000-0000-0000-0000-0000000039d1');
    raise exception 'grupovođa je prebacio iz tuđe sekcije';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
