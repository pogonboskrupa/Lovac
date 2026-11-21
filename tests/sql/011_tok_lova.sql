-- Test 011: komande samo vođa/organizator, status samo učesnik, samo dok lov traje, bez izmjene.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000011a1', 'admin11@t', '{"ime":"Ado","prezime":"Admin"}'),
  ('00000000-0000-0000-0000-0000000011c1', 'uc11@t', '{"ime":"Uroš","prezime":"Učesnik"}'),
  ('00000000-0000-0000-0000-0000000011c2', 'vodja11@t', '{"ime":"Vlado","prezime":"Vođa"}'),
  ('00000000-0000-0000-0000-0000000011d1', 'van11@t', '{"ime":"Vanja","prezime":"Van"}');
update public.korisnici set odobren = true, is_admin = true where id = '00000000-0000-0000-0000-0000000011a1';
update public.korisnici set odobren = true where id in ('00000000-0000-0000-0000-0000000011c1', '00000000-0000-0000-0000-0000000011c2', '00000000-0000-0000-0000-0000000011d1');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011a1', true); end $$;
do $$ begin
  insert into public.reviri (id, naziv) values ('66666666-0000-4000-8000-0000000011a1', 'Revir 11');
  insert into public.lovovi (id, revir_id, naziv, datum, organizator_id) values
    ('77777777-0000-4000-8000-000000000011', '66666666-0000-4000-8000-0000000011a1', 'Lov 11', '2026-12-05', auth.uid());
  insert into public.lov_ucesnici values
    ('77777777-0000-4000-8000-000000000011', '00000000-0000-0000-0000-0000000011c1', 'strijelac'),
    ('77777777-0000-4000-8000-000000000011', '00000000-0000-0000-0000-0000000011c2', 'vodja');
end $$;
reset role;

-- Prije početka lova događaji se ne primaju.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011c1', true); end $$;
do $$ begin
  begin
    insert into public.lov_dogadjaji (id, lov_id, vrsta) values ('aaaaaaaa-0000-4000-8000-000000000001', '77777777-0000-4000-8000-000000000011', 'na_stanu');
    raise exception 'FAIL: događaj prije početka lova';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.lovovi set status = 'u_toku' where id = '77777777-0000-4000-8000-000000000011';

-- Učesnik: status može, komandu ne.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011c1', true); end $$;
do $$ begin
  insert into public.lov_dogadjaji (id, lov_id, vrsta) values ('aaaaaaaa-0000-4000-8000-000000000002', '77777777-0000-4000-8000-000000000011', 'na_stanu');
  begin
    insert into public.lov_dogadjaji (id, lov_id, vrsta) values ('aaaaaaaa-0000-4000-8000-000000000003', '77777777-0000-4000-8000-000000000011', 'prekid');
    raise exception 'FAIL: učesnik poslao prekid';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lov_dogadjaji (id, lov_id, autor_id, vrsta) values ('aaaaaaaa-0000-4000-8000-000000000004', '77777777-0000-4000-8000-000000000011', '00000000-0000-0000-0000-0000000011c2', 'na_stanu');
    raise exception 'FAIL: događaj u tuđe ime';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lov_dogadjaji set vrsta = 'pauza';
    raise exception 'FAIL: izmjena događaja';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Vođa (uloga u lovu) i organizator šalju komande.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011c2', true); end $$;
do $$ begin
  insert into public.lov_dogadjaji (id, lov_id, vrsta, tekst) values ('aaaaaaaa-0000-4000-8000-000000000005', '77777777-0000-4000-8000-000000000011', 'pocetak_pogona', 'Idemo');
end $$;
reset role;
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011a1', true); end $$;
do $$ declare n int; begin
  insert into public.lov_dogadjaji (id, lov_id, vrsta) values ('aaaaaaaa-0000-4000-8000-000000000006', '77777777-0000-4000-8000-000000000011', 'prekid');
  select count(*) into n from public.lov_dogadjaji;
  if n <> 3 then raise exception 'FAIL: organizator vidi % događaja', n; end if;
end $$;
reset role;

-- Neučesnik ne vidi ništa.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011d1', true); end $$;
do $$ declare n int; begin
  select count(*) into n from public.lov_dogadjaji;
  if n <> 0 then raise exception 'FAIL: neučesnik vidi događaje'; end if;
  begin
    insert into public.lov_dogadjaji (id, lov_id, vrsta) values ('aaaaaaaa-0000-4000-8000-000000000007', '77777777-0000-4000-8000-000000000011', 'na_stanu');
    raise exception 'FAIL: neučesnik poslao status';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
