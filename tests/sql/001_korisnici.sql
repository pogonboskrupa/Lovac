-- Test 001: uloge, odobrenje i RLS na korisnicima. Sve se vraća (rollback) na kraju.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-00000000000b', 'novi@t',  '{"ime":"Novo","prezime":"Lice"}'),
  ('00000000-0000-0000-0000-00000000000c', 'lovac@t', '{"ime":"Lovro","prezime":"Lovac"}');

-- Prvi admin se postavlja ručno u SQL Editoru (kao vlasnik baze) — mora proći.
update public.korisnici set is_admin = true, odobren = true where id = '00000000-0000-0000-0000-00000000000a';
update public.korisnici set odobren = true where id = '00000000-0000-0000-0000-00000000000c';

do $$ begin
  assert (select count(*) from public.korisnici) = 3, 'trigger nije napravio redove korisnika';
  assert (select not odobren and not is_admin from public.korisnici where id = '00000000-0000-0000-0000-00000000000b'),
    'nov nalog mora biti neodobren i bez uloge';
  assert (select drustvo_id is not null from public.korisnici where id = '00000000-0000-0000-0000-00000000000b'),
    'nov nalog mora dobiti društvo';
end $$;

-- ---- anon ne vidi ništa ----
set local role anon;
do $$ begin
  begin
    perform 1 from public.korisnici;
    raise exception 'FAIL: anon čita korisnike';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---- neodobren korisnik B ----
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true); end $$;
do $$ begin
  assert (select count(*) from public.korisnici) = 1, 'neodobren smije vidjeti samo sebe';
  assert not public.je_odobren(), 'B nije odobren';
  assert not public.je_admin(), 'B nije admin';

  begin
    update public.korisnici set is_admin = true where id = auth.uid();
    raise exception 'FAIL: samopromocija u admina prošla';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.korisnici set odobren = true where id = auth.uid();
    raise exception 'FAIL: samoodobrenje prošlo';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.admin_odobri(auth.uid(), true);
    raise exception 'FAIL: neodobren pozvao admin_odobri';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.korisnici (id, ime, prezime, is_admin, odobren)
    values ('00000000-0000-0000-0000-0000000000ff', 'X', 'Y', true, true);
    raise exception 'FAIL: insert u korisnike prošao';
  exception when insufficient_privilege then null;
  end;

  -- Ime se (od migracije 051) mijenja samo kroz promijeni_ime (uz email za prijavu); direktan update je zabranjen,
  -- a ostala polja svog reda se i dalje smiju mijenjati.
  begin
    update public.korisnici set ime = 'Novak' where id = auth.uid();
    raise exception 'FAIL: direktna izmjena imena prošla';
  exception when insufficient_privilege then null;
  end;
  update public.korisnici set updated_at = now() where id = auth.uid();
end $$;
reset role;

-- ---- odobren lovac C (nije admin) ----
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); end $$;
do $$ begin
  assert public.je_odobren(), 'C je odobren';
  assert not public.je_admin(), 'C nije admin';
  assert (select count(*) from public.korisnici) = 2, 'odobren vidi odobrene (A, C), ne neodobrenog B';

  update public.korisnici set ime = 'Hakovano' where id = '00000000-0000-0000-0000-00000000000a';
  assert (select ime from public.korisnici where id = '00000000-0000-0000-0000-00000000000a') = 'Ado',
    'C ne smije mijenjati tuđi red';

  begin
    perform public.admin_postavi_ulogu(auth.uid(), true);
    raise exception 'FAIL: lovac se postavio za admina';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---- admin A ----
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); end $$;
do $$ begin
  assert public.je_admin(), 'A je admin';
  assert (select count(*) from public.korisnici) = 3, 'admin vidi sve korisnike, i neodobrene';

  perform public.admin_odobri('00000000-0000-0000-0000-00000000000b', true);
  assert (select odobren and promijenio = auth.uid() and promijenjeno is not null
            from public.korisnici where id = '00000000-0000-0000-0000-00000000000b'),
    'odobrenje upisuje ko je i kad promijenio';

  begin
    perform public.admin_postavi_ulogu(auth.uid(), false);
    raise exception 'FAIL: uklonjen zadnji admin';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.admin_odobri(auth.uid(), false);
    raise exception 'FAIL: admin opozvao sam sebe';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.admin_reset_pin('00000000-0000-0000-0000-00000000000b', '12');
    raise exception 'FAIL: prekratak PIN prihvaćen';
  exception when invalid_parameter_value then null;
  end;

  perform public.admin_reset_pin('00000000-0000-0000-0000-00000000000b', '654321');
  perform public.admin_postavi_ulogu('00000000-0000-0000-0000-00000000000c', true);
  perform public.admin_postavi_ulogu('00000000-0000-0000-0000-00000000000c', false);
end $$;
reset role;

do $$ begin
  assert (select encrypted_password = extensions.crypt('654321', encrypted_password)
            from auth.users where id = '00000000-0000-0000-0000-00000000000b'), 'reset PIN-a';
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true); end $$;
do $$ begin
  perform public.admin_obrisi_korisnika('00000000-0000-0000-0000-00000000000b');
end $$;
reset role;

do $$ begin
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b'),
    'obrisan korisnik ne smije ostati';
  assert not exists (select 1 from public.korisnici where id = '00000000-0000-0000-0000-00000000000b'),
    'brisanje auth korisnika briše i red u korisnici';
end $$;

-- Opozvan admin gubi admin prava odmah (je_admin zahtijeva i odobren).
update public.korisnici set odobren = false where id = '00000000-0000-0000-0000-00000000000c';
update public.korisnici set is_admin = true where id = '00000000-0000-0000-0000-00000000000c';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true); end $$;
do $$ begin
  assert not public.je_admin(), 'neodobren admin nije admin';
end $$;
reset role;

rollback;
