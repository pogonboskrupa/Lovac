-- Test 005: slojeve objavljuje samo admin, čitaju odobreni, nema brisanja.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000005a1', 'a5@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000005b1', 'l5@t', '{"ime":"Lovro","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000005c1', 'n5@t', '{"ime":"Novo","prezime":"Lice"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000005a1';
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-0000000005b1';

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005a1', true); end $$;
do $$ begin
  insert into public.slojevi (naziv, geojson) values ('Granica lovišta', '{"type":"FeatureCollection","features":[]}');
  assert (select promijenio = auth.uid() from public.slojevi where naziv = 'Granica lovišta'), 'ko je objavio upisuje server';
  update public.slojevi set verzija = 2 where naziv = 'Granica lovišta';
  begin
    delete from public.slojevi where naziv = 'Granica lovišta';
    raise exception 'FAIL: brisanje sloja prošlo';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005b1', true); end $$;
do $$ begin
  assert (select count(*) from public.slojevi) = 1, 'lovac čita objavljene slojeve';
  begin
    insert into public.slojevi (naziv, geojson) values ('Lažna granica', '{}');
    raise exception 'FAIL: lovac objavio sloj';
  exception when insufficient_privilege then null;
  end;
  update public.slojevi set naziv = 'hak';
  assert (select naziv from public.slojevi) = 'Granica lovišta', 'lovac ne mijenja sloj';
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000005c1', true); end $$;
do $$ begin
  assert (select count(*) from public.slojevi) = 0, 'neodobren ne vidi slojeve';
end $$;
reset role;

rollback;
