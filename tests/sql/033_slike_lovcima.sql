-- Test 033: slika drugom lovcu — vide samo pošiljalac i primalac (admin ne), rok 12 h postavlja server,
-- probni nalog ne šalje i ne prima, istekla slika se ne vidi i briše se, primalac briše preuzetu.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000033a1', 'admin33@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000033b1', 'p33@t', '{"ime":"Pero","prezime":"Posiljalac"}'),
  ('00000000-0000-0000-0000-0000000033b2', 'r33@t', '{"ime":"Rade","prezime":"Primalac"}'),
  ('00000000-0000-0000-0000-0000000033b3', 't33@t', '{"ime":"Treći","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000033b4', 'pr33@t', '{"ime":"Probni","prezime":"Lovac","probni":true}');
update public.korisnici set odobren = true where id::text like '00000000-0000-0000-0000-0000000033%' and id <> '00000000-0000-0000-0000-0000000033b4';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-0000000033a1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b1', true); end $$;
-- pošiljalac podmeće pošiljaoca i rok: server ih postavlja sam
insert into public.slike_lovcima (id, posiljalac_id, primalac_id, slika, opis, istice) values
  ('99999999-0000-4000-8000-000000000331', '00000000-0000-0000-0000-0000000033b3', '00000000-0000-0000-0000-0000000033b2',
   'data:image/jpeg;base64,AAAA', 'Trag kod čeke', now() + interval '30 days');
do $$ begin
  assert (select posiljalac_id = auth.uid() and istice <= now() + interval '12 hours' and istice > now() + interval '11 hours'
          from public.slike_lovcima where id = '99999999-0000-4000-8000-000000000331'), 'server postavlja pošiljaoca i rok 12 h';
  -- ne može sebi, ni probnom nalogu
  begin
    insert into public.slike_lovcima (id, primalac_id, slika) values ('99999999-0000-4000-8000-000000000332', auth.uid(), 'x');
    raise exception 'poslao sebi';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.slike_lovcima (id, primalac_id, slika) values ('99999999-0000-4000-8000-000000000333', '00000000-0000-0000-0000-0000000033b4', 'x');
    raise exception 'poslao probnom nalogu';
  exception when insufficient_privilege then null;
  end;
  -- nema izmjene
  begin
    update public.slike_lovcima set opis = 'hak';
    raise exception 'izmijenio';
  exception when insufficient_privilege then null;
  end;
end $$;

-- album: više slika istog slanja (grupa, redni), kategorija trofej; nepoznata kategorija se odbija
insert into public.slike_lovcima (id, primalac_id, slika, grupa, redni, kategorija) values
  ('99999999-0000-4000-8000-000000000337', '00000000-0000-0000-0000-0000000033b2', 'x', '99999999-0000-4000-8000-0000000003a0', 0, 'trofej'),
  ('99999999-0000-4000-8000-000000000338', '00000000-0000-0000-0000-0000000033b2', 'y', '99999999-0000-4000-8000-0000000003a0', 1, 'trofej');
do $$ begin
  assert (select count(*) from public.slike_lovcima where grupa = '99999999-0000-4000-8000-0000000003a0' and kategorija = 'trofej') = 2, 'album';
  begin
    insert into public.slike_lovcima (id, primalac_id, slika, kategorija) values ('99999999-0000-4000-8000-000000000339', '00000000-0000-0000-0000-0000000033b2', 'z', 'nesto');
    raise exception 'nepoznata kategorija prošla';
  exception when check_violation then null;
  end;
end $$;
delete from public.slike_lovcima where grupa = '99999999-0000-4000-8000-0000000003a0';

-- treći lovac i admin ne vide
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b3', true); end $$;
do $$ begin assert (select count(*) from public.slike_lovcima) = 0, 'treći ne vidi'; end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033a1', true); end $$;
do $$ begin assert (select count(*) from public.slike_lovcima) = 0, 'admin ne vidi'; end $$;

-- probni nalog ne šalje
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b4', true); end $$;
do $$ begin
  begin
    insert into public.slike_lovcima (id, primalac_id, slika) values ('99999999-0000-4000-8000-000000000334', '00000000-0000-0000-0000-0000000033b2', 'x');
    raise exception 'probni poslao';
  exception when insufficient_privilege then null;
  end;
end $$;

-- primalac vidi i briše poslije preuzimanja
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b2', true); end $$;
do $$ begin assert (select opis from public.slike_lovcima) = 'Trag kod čeke', 'primalac vidi'; end $$;
delete from public.slike_lovcima where id = '99999999-0000-4000-8000-000000000331';
reset role;
do $$ begin assert (select count(*) from public.slike_lovcima) = 0, 'primalac obrisao'; end $$;

-- istekla slika se ne vidi, a čišćenje je briše (trigger uzima pošiljaoca iz sesije)
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b1', true); end $$;
insert into public.slike_lovcima (id, posiljalac_id, primalac_id, slika) values
  ('99999999-0000-4000-8000-000000000335', '00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033b2', 'x');
update public.slike_lovcima set istice = now() - interval '1 minute';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b2', true); end $$;
do $$ begin
  assert (select count(*) from public.slike_lovcima) = 0, 'istekla se ne vidi';
  assert public.ocisti_slike_lovcima() = 1, 'čišćenje briše isteklu';
end $$;
reset role;
do $$ begin assert (select count(*) from public.slike_lovcima) = 0, 'istekla obrisana'; end $$;

-- brisanje naloga ne pada zbog poslanih slika
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000033b1', true); end $$;
insert into public.slike_lovcima (id, posiljalac_id, primalac_id, slika) values
  ('99999999-0000-4000-8000-000000000336', '00000000-0000-0000-0000-0000000033b1', '00000000-0000-0000-0000-0000000033b2', 'x');
delete from auth.users where id = '00000000-0000-0000-0000-0000000033b1';
do $$ begin assert (select count(*) from public.slike_lovcima) = 0, 'brisanje naloga briše slike'; end $$;

rollback;
