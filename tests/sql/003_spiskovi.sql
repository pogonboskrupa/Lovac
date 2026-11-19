-- Test 003: admin spiskovi — čitaju odobreni, mijenja samo admin, nema brisanja, "ko i kad".
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000003a1', 'a@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000003b2', 'l@t', '{"ime":"Lovro","prezime":"Lovac"}'),
  ('00000000-0000-0000-0000-0000000003c3', 'n@t', '{"ime":"Novo","prezime":"Lice"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000003a1';
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-0000000003b2';

do $$ begin
  assert (select count(*) from public.objekat_vrste) >= 10, 'početne vrste objekata';
  assert (select count(*) from public.lovostaj) = 0, 'lovostaj se NE puni iz migracije (unosi ga admin)';
  assert (select count(*) from public.lovno_vrijeme) = 0, 'lovno vrijeme se NE puni iz migracije';
end $$;

-- neodobren ne vidi spiskove
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003c3', true); end $$;
do $$ begin
  assert (select count(*) from public.vrste) = 0, 'neodobren ne smije čitati spiskove';
end $$;
reset role;

-- lovac čita, ne mijenja
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003b2', true); end $$;
do $$ begin
  assert (select count(*) from public.vrste) >= 10, 'lovac čita vrste';
  begin
    insert into public.lovostaj (vrsta_kod, otvoreno_od, otvoreno_do) values ('srna', '05-01', '09-30');
    raise exception 'FAIL: lovac unio lovostaj';
  exception when insufficient_privilege then null;
  end;
  update public.vrste set naziv = 'Hak' where kod = 'srna';
  assert (select naziv from public.vrste where kod = 'srna') = 'Srna obična', 'lovac ne smije mijenjati vrste';
end $$;
reset role;

-- admin unosi i mijenja; server upisuje ko i kad; brisanja nema ni za admina
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003a1', true); end $$;
do $$ begin
  insert into public.lovostaj (vrsta_kod, kategorija_kod, otvoreno_od, otvoreno_do, izvor, promijenio)
  values ('srna', 'srndac', '05-01', '09-30', 'test', '00000000-0000-0000-0000-0000000003b2');
  assert (select promijenio = auth.uid() from public.lovostaj where izvor = 'test'),
    'promijenio upisuje server (klijent ga ne može lažirati)';
  insert into public.lovno_vrijeme (prije_izlaska_min, poslije_zalaska_min) values (60, 60);
  update public.vrste set aktivno = false where kod = 'kuna';
  assert (select not aktivno from public.vrste where kod = 'kuna'), 'sklanjanje radi';
  begin
    delete from public.vrste where kod = 'kuna';
    raise exception 'FAIL: brisanje vrste prošlo';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lovostaj (vrsta_kod, otvoreno_od, otvoreno_do) values ('srna', '13-01', '09-30');
    raise exception 'FAIL: neispravan datum prihvaćen';
  exception when check_violation then null;
  end;
end $$;
reset role;

rollback;
